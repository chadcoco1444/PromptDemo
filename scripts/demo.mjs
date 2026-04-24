#!/usr/bin/env node
// Local demo lifecycle manager.
// Usage:
//   pnpm demo start    - docker up + spawn 5 services in background
//   pnpm demo stop     - kill background services + docker down
//   pnpm demo status   - health check all services
//   pnpm demo test     - end-to-end smoke test (POST /api/jobs, poll until done)
//   pnpm demo logs     - tail all logs (or a single service: pnpm demo logs api)
//   pnpm demo restart  - stop + start
//   pnpm demo run      - foreground (all output mixed, Ctrl-C stops)
//
// State: services run detached; PIDs + logs at .tmp/demo/{pids,logs}/
// Requires: Docker Desktop running. ANTHROPIC_API_KEY in .env (or shell).

import { spawn, spawnSync } from 'node:child_process';
import {
  existsSync, mkdirSync, readFileSync, writeFileSync, rmSync,
  openSync, statSync, appendFileSync, readdirSync,
} from 'node:fs';
import { resolve, join } from 'node:path';
import { platform, tmpdir } from 'node:os';
import { createConnection } from 'node:net';
import { setTimeout as sleep } from 'node:timers/promises';

const REPO_ROOT = process.cwd();
const TMP = join(REPO_ROOT, '.tmp', 'demo');
const PIDS_DIR = join(TMP, 'pids');
const LOGS_DIR = join(TMP, 'logs');
const IS_WINDOWS = platform() === 'win32';

const C = {
  reset: '\x1b[0m', bold: '\x1b[1m', dim: '\x1b[2m',
  red: '\x1b[31m', green: '\x1b[32m', yellow: '\x1b[33m',
  blue: '\x1b[34m', magenta: '\x1b[35m', cyan: '\x1b[36m',
};

// Each service gets its own PORT env var so worker healthz endpoints don't collide
// locally. In Cloud Run each service runs on its own instance, so PORT=8080 is fine
// there — this override is dev-only.
const SERVICES = [
  { name: 'crawler',    filter: '@promptdemo/worker-crawler',    color: C.red,     kind: 'worker', port: 8081 },
  { name: 'storyboard', filter: '@promptdemo/worker-storyboard', color: C.green,   kind: 'worker', port: 8082 },
  { name: 'render',     filter: '@promptdemo/worker-render',     color: C.blue,    kind: 'worker', port: 8083 },
  { name: 'api',        filter: '@promptdemo/api',                color: C.yellow,  kind: 'http',   port: 3000, url: 'http://localhost:3000/healthz' },
  { name: 'web',        filter: '@promptdemo/web',                color: C.magenta, kind: 'http',   port: 3001, url: 'http://localhost:3001' },
];

// --- .env loader ---
function loadDotenv() {
  const path = resolve(REPO_ROOT, '.env');
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const m = trimmed.match(/^([A-Z_][A-Z0-9_]*)\s*=\s*(.*)$/i);
    if (!m) continue;
    let val = m[2];
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (!process.env[m[1]]) process.env[m[1]] = val;
  }
}

function applyDefaults() {
  const defaults = {
    REDIS_URL: 'redis://localhost:6379',
    S3_ENDPOINT: 'http://localhost:9000',
    S3_REGION: 'us-east-1',
    S3_ACCESS_KEY_ID: 'minioadmin',
    S3_SECRET_ACCESS_KEY: 'minioadmin',
    S3_BUCKET: 'promptdemo-dev',
    S3_FORCE_PATH_STYLE: 'true',
    CRAWLER_RESCUE_ENABLED: 'false',
    PLAYWRIGHT_TIMEOUT_MS: '15000',
    CLAUDE_MODEL: 'claude-sonnet-4-6',
    CLAUDE_MAX_TOKENS: '4096',
    MOCK_MODE: 'false',
    NODE_ENV: 'development',
    NEXT_PUBLIC_API_BASE: 'http://localhost:3000',
    NEXT_PUBLIC_S3_ENDPOINT: 'http://localhost:9000',
  };
  for (const [k, v] of Object.entries(defaults)) {
    if (!process.env[k]) process.env[k] = v;
  }
}

function ensureDirs() {
  mkdirSync(PIDS_DIR, { recursive: true });
  mkdirSync(LOGS_DIR, { recursive: true });
}

const pidPath = (name) => join(PIDS_DIR, `${name}.pid`);
const logPath = (name) => join(LOGS_DIR, `${name}.log`);

function readPid(name) {
  const p = pidPath(name);
  if (!existsSync(p)) return null;
  const n = Number(readFileSync(p, 'utf8').trim());
  return Number.isFinite(n) && n > 0 ? n : null;
}

const writePid = (name, pid) => writeFileSync(pidPath(name), String(pid), 'utf8');
const removePid = (name) => { try { rmSync(pidPath(name)); } catch {} };

function isAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    return err.code === 'EPERM';
  }
}

async function httpOk(url, timeoutMs = 2000) {
  try {
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), timeoutMs);
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(t);
    return res.ok;
  } catch { return false; }
}

function tcpCheck(host, port, timeoutMs = 1000) {
  return new Promise((res) => {
    const sock = createConnection({ host, port });
    let done = false;
    const finish = (ok) => { if (done) return; done = true; sock.destroy(); res(ok); };
    sock.setTimeout(timeoutMs);
    sock.once('connect', () => finish(true));
    sock.once('timeout', () => finish(false));
    sock.once('error', () => finish(false));
  });
}

// --- Docker infra ---
function dockerUp() {
  console.log(`${C.cyan}[infra]${C.reset} docker compose -f docker-compose.dev.yaml up -d`);
  const r = spawnSync('docker', ['compose', '-f', 'docker-compose.dev.yaml', 'up', '-d'], {
    stdio: 'inherit', shell: IS_WINDOWS,
  });
  if (r.status !== 0) {
    console.error(`${C.red}[infra]${C.reset} docker compose up failed`);
    process.exit(r.status ?? 1);
  }
}

function dockerDown() {
  console.log(`${C.cyan}[infra]${C.reset} docker compose -f docker-compose.dev.yaml down`);
  spawnSync('docker', ['compose', '-f', 'docker-compose.dev.yaml', 'down'], {
    stdio: 'inherit', shell: IS_WINDOWS,
  });
}

/**
 * Remotion's @remotion/bundler drops a fresh webpack bundle into the OS temp
 * dir every render and never deletes it. On Windows this is
 * %LOCALAPPDATA%\Temp\remotion-webpack-bundle-*; on POSIX /tmp/remotion-webpack-bundle-*.
 * Stale bundles also sometimes hold on to pre-registered static asset paths
 * from old code (e.g. BGMTrack's mp3 references), so clearing them on start/stop
 * is a good idempotent hygiene step.
 */
function cleanRemotionBundles() {
  const dir = tmpdir();
  if (!existsSync(dir)) return 0;
  let removed = 0;
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return 0;
  }
  for (const name of entries) {
    if (!name.startsWith('remotion-webpack-bundle-')) continue;
    const full = join(dir, name);
    try {
      rmSync(full, { recursive: true, force: true });
      removed++;
    } catch {
      // ignore locked dirs
    }
  }
  if (removed > 0) {
    console.log(`${C.cyan}[clean]${C.reset} removed ${removed} stale Remotion bundle${removed === 1 ? '' : 's'} in ${dir}`);
  } else {
    console.log(`${C.dim}[clean]${C.reset} no Remotion bundles to remove in ${dir}`);
  }
  return removed;
}

async function waitForInfra() {
  console.log(`${C.cyan}[infra]${C.reset} waiting for Redis + MinIO...`);
  for (let i = 0; i < 30; i++) {
    const redisOk = await tcpCheck('localhost', 6379);
    const minioOk = await httpOk('http://localhost:9000/minio/health/ready', 1000);
    if (redisOk && minioOk) {
      console.log(`${C.cyan}[infra]${C.reset} ready`);
      return;
    }
    await sleep(1000);
  }
  console.warn(`${C.yellow}[infra]${C.reset} timed out waiting for infra; proceeding anyway`);
}

// --- Service lifecycle ---
function serviceEnv(svc) {
  // Each service gets its own PORT (avoids healthz clash between 3 workers).
  return { ...process.env, PORT: String(svc.port) };
}

function spawnService(svc) {
  const log = logPath(svc.name);
  appendFileSync(log, `\n===== start ${new Date().toISOString()} (PORT=${svc.port}) =====\n`);
  const stdout = openSync(log, 'a');
  const stderr = openSync(log, 'a');

  const child = spawn('pnpm', ['--filter', svc.filter, 'dev'], {
    env: serviceEnv(svc),
    cwd: REPO_ROOT,
    detached: true,
    stdio: ['ignore', stdout, stderr],
    shell: IS_WINDOWS,
  });
  child.unref();
  writePid(svc.name, child.pid);
  console.log(`${svc.color}[${svc.name}]${C.reset} started (pid ${child.pid}, PORT=${svc.port}, log: ${log})`);
}

async function startAll() {
  loadDotenv();
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error(`${C.red}ERROR${C.reset}: ANTHROPIC_API_KEY is required. Create .env at repo root (see .env.example).`);
    process.exit(1);
  }
  applyDefaults();
  ensureDirs();
  dockerUp();
  await waitForInfra();

  // Pre-flight port sweep: clean up any orphans from a previous crashed run
  // so EADDRINUSE doesn't kill our fresh spawns.
  reapPorts('[start]');

  // Stale Remotion bundles can hold on to old BGM references / cached sources.
  cleanRemotionBundles();

  for (const svc of SERVICES) {
    const existing = readPid(svc.name);
    if (existing && isAlive(existing)) {
      console.log(`${svc.color}[${svc.name}]${C.reset} already running (pid ${existing}); skipping`);
      continue;
    }
    if (existing) removePid(svc.name);
    spawnService(svc);
  }

  console.log('');
  console.log(`${C.bold}All services started.${C.reset}`);
  console.log(`  ${C.yellow}API${C.reset}   -> http://localhost:3000/healthz`);
  console.log(`  ${C.magenta}Web${C.reset}   -> http://localhost:3001`);
  console.log(`  ${C.cyan}MinIO${C.reset} -> http://localhost:9001 (minioadmin/minioadmin)`);
  console.log('');
  console.log(`  ${C.dim}pnpm demo status${C.reset} | ${C.dim}pnpm demo test${C.reset} | ${C.dim}pnpm demo logs${C.reset} | ${C.dim}pnpm demo stop${C.reset}`);
  console.log('');
  console.log(`${C.dim}[info]${C.reset} first startup is slow: workers install chromium/redis/bullmq, next install google-fonts — watch logs for "worker started".`);
}

/**
 * Find PIDs listening on a given TCP port. Cross-platform.
 * Windows uses `netstat -ano` (no extra install); POSIX uses `lsof`.
 */
function findPidsOnPort(port) {
  if (IS_WINDOWS) {
    const r = spawnSync('netstat', ['-ano'], { encoding: 'utf8', shell: false });
    const out = r.stdout ?? '';
    const pids = new Set();
    for (const line of out.split(/\r?\n/)) {
      if (!line.includes('LISTENING')) continue;
      const tokens = line.trim().split(/\s+/);
      if (tokens.length < 5) continue;
      const local = tokens[1]; // e.g. "0.0.0.0:3001" or "[::]:3001"
      const portMatch = local.match(/:(\d+)$/);
      if (!portMatch || Number(portMatch[1]) !== port) continue;
      const pid = tokens[tokens.length - 1];
      if (/^\d+$/.test(pid) && pid !== '0') pids.add(pid);
    }
    return [...pids];
  }
  const r = spawnSync('sh', ['-c', `lsof -ti :${port} 2>/dev/null`], { encoding: 'utf8' });
  return (r.stdout ?? '').split(/\s+/).filter((s) => /^\d+$/.test(s));
}

function killPid(pid) {
  try {
    if (IS_WINDOWS) {
      spawnSync('taskkill', ['/F', '/T', '/PID', String(pid)], { stdio: 'ignore' });
    } else {
      process.kill(Number(pid), 'SIGKILL');
    }
    return true;
  } catch { return false; }
}

function reapPorts(label) {
  let killed = 0;
  for (const svc of SERVICES) {
    const pids = findPidsOnPort(svc.port);
    for (const pid of pids) {
      if (killPid(pid)) {
        console.log(`${svc.color}[${svc.name}]${C.reset} killed orphan on :${svc.port} (pid ${pid})`);
        killed++;
      }
    }
  }
  if (killed === 0) {
    console.log(`${C.dim}${label}${C.reset} no orphans on service ports`);
  }
  return killed;
}

async function stopAll() {
  let stopped = 0;
  for (const svc of SERVICES) {
    const pid = readPid(svc.name);
    if (pid && isAlive(pid)) {
      try {
        if (IS_WINDOWS) {
          spawnSync('taskkill', ['/T', '/F', '/PID', String(pid)], { stdio: 'ignore' });
        } else {
          process.kill(-pid, 'SIGTERM');
        }
        console.log(`${svc.color}[${svc.name}]${C.reset} stopped (pid ${pid})`);
        stopped++;
      } catch (err) {
        console.warn(`${svc.color}[${svc.name}]${C.reset} kill failed: ${err.message}`);
      }
    } else if (pid) {
      console.log(`${svc.color}[${svc.name}]${C.reset} stale pid ${pid}; cleaning up`);
    }
    removePid(svc.name);
  }

  if (stopped > 0) await sleep(1500);

  // Kill-by-port pass: catches orphans that our PID tracking missed (e.g. detached
  // Next.js workers on Windows where the spawn chain loses the real PID).
  reapPorts('[stop]');

  // Clean stale Remotion webpack bundles from OS temp dir.
  cleanRemotionBundles();

  dockerDown();
  console.log(`\n${C.bold}Stopped.${C.reset} ${stopped} tracked services killed; port sweep done.`);
}

async function statusAll() {
  console.log(`${C.bold}Infra:${C.reset}`);
  const redisOk = await tcpCheck('localhost', 6379);
  const minioOk = await httpOk('http://localhost:9000/minio/health/ready', 1000);
  console.log(`  Redis   ${redisOk ? C.green + 'UP' : C.red + 'DOWN'}${C.reset}`);
  console.log(`  MinIO   ${minioOk ? C.green + 'UP' : C.red + 'DOWN'}${C.reset}`);

  console.log(`\n${C.bold}Services:${C.reset}`);
  for (const svc of SERVICES) {
    const pid = readPid(svc.name);
    const alive = pid && isAlive(pid);
    const health = svc.url ? (await httpOk(svc.url, 1500) ? ' / healthy' : ' / not responding') : '';
    const tag = alive ? `${C.green}UP${C.reset}  (pid ${pid})${health}` : `${C.red}DOWN${C.reset}`;
    console.log(`  ${svc.color}${svc.name.padEnd(11)}${C.reset} ${tag}`);
  }
}

async function runTest() {
  loadDotenv();
  applyDefaults();
  const api = process.env.NEXT_PUBLIC_API_BASE ?? 'http://localhost:3000';
  console.log(`${C.bold}[test]${C.reset} API base: ${api}`);

  if (!(await httpOk(`${api}/healthz`, 3000))) {
    console.error(`${C.red}[test]${C.reset} API healthz failed. Is 'pnpm demo start' running?`);
    process.exit(1);
  }
  console.log(`${C.green}[test]${C.reset} API healthy`);

  const url = process.env.TEST_URL ?? 'https://example.com';
  const intent = process.env.TEST_INTENT ?? 'show the headline and tagline';
  const duration = Number(process.env.TEST_DURATION ?? '10');
  console.log(`${C.bold}[test]${C.reset} POST /api/jobs  url=${url}  intent="${intent}"  duration=${duration}s`);

  const createRes = await fetch(`${api}/api/jobs`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ url, intent, duration }),
  });
  if (!createRes.ok) {
    console.error(`${C.red}[test]${C.reset} create failed: ${createRes.status} ${await createRes.text()}`);
    process.exit(1);
  }
  const { jobId } = await createRes.json();
  console.log(`${C.green}[test]${C.reset} created jobId=${jobId}`);
  console.log(`${C.dim}[test]${C.reset} watch progress:  ${api.replace(/\/$/, '')}/api/jobs/${jobId}  (or UI: http://localhost:3001/jobs/${jobId})`);

  const timeout = Number(process.env.TEST_TIMEOUT_S ?? '300');
  const start = Date.now();
  let last = '';
  while ((Date.now() - start) / 1000 < timeout) {
    const j = await fetch(`${api}/api/jobs/${jobId}`).then((r) => r.json()).catch(() => null);
    if (!j) { await sleep(2000); continue; }
    const line = `${j.status}${j.stage ? ` (${j.stage})` : ''}${j.progress ? ` ${j.progress}%` : ''}`;
    if (line !== last) {
      console.log(`${C.dim}[test]${C.reset} ${Math.floor((Date.now() - start) / 1000)}s -> ${line}`);
      last = line;
    }
    if (j.status === 'done') {
      console.log(`\n${C.bold}${C.green}[test] PASS${C.reset}`);
      console.log(`  videoUrl: ${j.videoUrl}`);
      const resolved = j.videoUrl?.replace(/^s3:\/\//, `${process.env.NEXT_PUBLIC_S3_ENDPOINT}/`);
      if (resolved) console.log(`  resolved: ${resolved}`);
      return;
    }
    if (j.status === 'failed') {
      console.error(`\n${C.bold}${C.red}[test] FAIL${C.reset}`);
      console.error(`  code: ${j.error?.code}`);
      console.error(`  message: ${j.error?.message}`);
      process.exit(1);
    }
    await sleep(2000);
  }
  console.error(`\n${C.red}[test] TIMEOUT${C.reset} after ${timeout}s. Last state: ${last}`);
  process.exit(2);
}

function tailLogs(which) {
  const targets = which ? SERVICES.filter((s) => s.name === which) : SERVICES;
  if (targets.length === 0) {
    console.error(`Unknown service: ${which}. Options: ${SERVICES.map((s) => s.name).join(', ')}`);
    process.exit(1);
  }
  if (IS_WINDOWS) {
    for (const svc of targets) {
      const p = logPath(svc.name);
      if (!existsSync(p)) {
        console.log(`${svc.color}[${svc.name}]${C.reset} (no log yet)`);
        continue;
      }
      const size = statSync(p).size;
      const buf = readFileSync(p, 'utf8');
      const lines = buf.split('\n');
      const tail = lines.slice(Math.max(0, lines.length - 200)).join('\n');
      console.log(`\n${C.bold}${svc.color}=== ${svc.name} (last 200 lines of ${size}B) ===${C.reset}`);
      console.log(tail);
    }
  } else {
    const files = targets.map((s) => logPath(s.name)).filter((p) => existsSync(p));
    if (files.length === 0) {
      console.log('No logs yet. Is anything running?');
      return;
    }
    const child = spawn('tail', ['-f', '-n', '200', ...files], { stdio: 'inherit' });
    process.on('SIGINT', () => child.kill('SIGINT'));
  }
}

async function runForeground() {
  loadDotenv();
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error(`${C.red}ERROR${C.reset}: ANTHROPIC_API_KEY is required.`);
    process.exit(1);
  }
  applyDefaults();
  dockerUp();
  await waitForInfra();

  // Pre-flight port sweep — orphans from previous crashed runs die here.
  reapPorts('[run]');
  cleanRemotionBundles();

  console.log(`${C.bold}[dev-demo]${C.reset} starting 5 services in foreground. Ctrl-C to stop.\n`);

  const procs = SERVICES.map((svc) => {
    const p = spawn('pnpm', ['--filter', svc.filter, 'dev'], {
      env: serviceEnv(svc), shell: IS_WINDOWS, stdio: ['ignore', 'pipe', 'pipe'],
    });
    const prefix = `${svc.color}[${svc.name.padEnd(10)}]${C.reset}`;
    const pipe = (s) => {
      let buf = '';
      s.on('data', (d) => {
        buf += d.toString();
        let i;
        while ((i = buf.indexOf('\n')) >= 0) {
          const line = buf.slice(0, i);
          buf = buf.slice(i + 1);
          if (line) console.log(`${prefix} ${line}`);
        }
      });
    };
    pipe(p.stdout); pipe(p.stderr);
    p.on('exit', (code) => console.log(`${prefix} exited (code ${code})`));
    return p;
  });

  const shutdown = () => {
    console.log('\nShutting down...');
    for (const p of procs) if (!p.killed) p.kill('SIGTERM');
    setTimeout(() => {
      for (const p of procs) if (!p.killed) p.kill('SIGKILL');
      // Final sweep — catches grand-children that SIGKILL didn't cascade to.
      reapPorts('[shutdown]');
      cleanRemotionBundles();
      dockerDown();
      process.exit(0);
    }, 3000);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

function help() {
  console.log(`${C.bold}PromptDemo local demo manager${C.reset}

Commands:
  ${C.green}start${C.reset}      Docker up + spawn 5 services in background
  ${C.red}stop${C.reset}       Kill background services + Docker down
  ${C.cyan}status${C.reset}     Check infra + service health
  ${C.yellow}test${C.reset}       End-to-end smoke: POST /api/jobs, poll until done
             Override via env: TEST_URL, TEST_INTENT, TEST_DURATION, TEST_TIMEOUT_S
  ${C.blue}logs${C.reset} [svc] Tail logs (all, or one service: crawler/storyboard/render/api/web)
  clean      Remove stale Remotion webpack bundles from OS temp dir
             (auto-runs on start/stop/run/shutdown; use manually if needed)
  restart    Stop + start
  run        Foreground mode (all output mixed, Ctrl-C stops)
  help       This message

Requires Docker Desktop running + ANTHROPIC_API_KEY in .env at repo root.
`);
}

const cmd = process.argv[2] ?? 'help';
const arg = process.argv[3];

(async () => {
  switch (cmd) {
    case 'start':   await startAll(); break;
    case 'stop':    await stopAll(); break;
    case 'status':  await statusAll(); break;
    case 'test':    await runTest(); break;
    case 'logs':    tailLogs(arg); break;
    case 'restart': await stopAll(); await sleep(1000); await startAll(); break;
    case 'run':     await runForeground(); break;
    case 'clean':   cleanRemotionBundles(); break;
    case 'help':
    case '--help':
    case '-h':      help(); break;
    default:
      console.error(`Unknown command: ${cmd}\n`);
      help();
      process.exit(1);
  }
})();
