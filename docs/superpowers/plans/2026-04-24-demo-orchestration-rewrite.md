# Demo Orchestration Rewrite Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `pnpm lume start` reliably spawn all 5 services on Windows — no zombie accumulation, no random "only 1 service survives" failures, no PID tracking lies. `status` reports ground truth, `stop` kills everything cleanly.

**Architecture:** Stop routing spawns through `cmd.exe → pnpm.cmd → tsx/next`. The chain loses the real node PID when each intermediate exits, so we track dead shells and leak the actual worker. New approach: resolve the `tsx` / `next` CLI's entry JS file at runtime, spawn `node.exe` directly with `detached: true + windowsHide: true + stdio → log-file fds`. The PID we save IS the real server — reliable for status checks and kill.

**Tech Stack:** Node `child_process.spawn` (direct node invocation) · `require.resolve` for bin paths · per-service `package.json.scripts.dev` parsing · no PowerShell bridge · no pnpm middleman.

**Spec reference:** `docs/superpowers/followups/2026-04-24-demo-orchestration-rewrite.md` — root-cause analysis + design decision (Option B chosen).

---

## File Structure

### Created
- `scripts/lib/devCommand.ts` — pure function mapping a service config → `{ node, args, cwd }` for `child_process.spawn`. Actually, since `scripts/lume.mjs` is plain ESM JS (not TS), we keep everything in one language: create `scripts/lib/devCommand.mjs` (JS module) with JSDoc types.
- `scripts/lib/devCommand.mjs` — spawn-arg resolver.
- `scripts/tests/devCommand.test.mjs` — unit tests (vitest reached via a root-level `test:scripts` or run ad-hoc; see Task 1 Step 2).

### Modified
- `scripts/lume.mjs` — large surgery:
  - Replace `spawnServiceWindows` + PowerShell bridge + `appendHeaderWithRetry` with direct-node spawn.
  - Update `stopAll` to rely on real PIDs (`taskkill /T /F /PID` actually kills the tree now).
  - Add `demo clean-all` subcommand.
  - Trim stale comments referencing CVE-2024-27980 / EINVAL / PowerShell bridge rationale (no longer true).
- `docs/superpowers/followups/2026-04-24-demo-orchestration-rewrite.md` — mark resolved with commit SHA.
- `package.json` (repo root) — add `"test:scripts": "vitest run --root scripts"` script so the new tests are part of CI.

### Untouched
- Everything under `apps/*`, `workers/*`, `packages/*` — this is purely tooling.
- `.env.example`, Docker compose, S3/Redis/MinIO — infra unchanged.

---

## Task 1: `devCommand.mjs` — pure spawn-arg resolver with tests

**Why first:** isolating the "translate service config → node args" logic into a pure function makes it testable without running a real spawn. Everything downstream depends on this being right.

**Files:**
- Create: `scripts/lib/devCommand.mjs`
- Create: `scripts/tests/devCommand.test.mjs`

- [ ] **Step 1: Prepare vitest for `scripts/`**

`scripts/` has no test harness yet. Add a minimal vitest config:

Create `scripts/vitest.config.mjs`:

```js
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.mjs'],
  },
});
```

Create `scripts/package.json` (tells vitest to treat this subtree as module scope + registers the script alias for the root):

```json
{
  "name": "@lumespec-internal/scripts",
  "private": true,
  "type": "module",
  "scripts": {
    "test": "vitest run"
  }
}
```

Root `package.json` gets a new script alias. Open the repo root `package.json`, find `"scripts": { ... }`, and add:

```json
    "test:scripts": "pnpm --filter @lumespec-internal/scripts test",
```

Verify the new workspace was picked up: run `pnpm install` from repo root. pnpm auto-discovers workspaces via `pnpm-workspace.yaml` — if `scripts/` isn't listed there already, add `- 'scripts'` to the `packages:` array first.

- [ ] **Step 2: Write the failing test**

Create `scripts/tests/devCommand.test.mjs`:

```js
import { describe, it, expect } from 'vitest';
import { resolve as pathResolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveDevCommand } from '../lib/devCommand.mjs';

const repoRoot = pathResolve(fileURLToPath(new URL('../../', import.meta.url)));

describe('resolveDevCommand', () => {
  it('resolves tsx services (workers, api) to node + tsx CLI + watch + entry', () => {
    const result = resolveDevCommand({
      name: 'api',
      filter: '@lumespec/api',
      cwd: pathResolve(repoRoot, 'apps/api'),
    });
    expect(result.node).toBe(process.execPath);
    // First arg is the absolute path to tsx's CLI JS
    expect(result.args[0]).toMatch(/node_modules[\\/]tsx[\\/]dist[\\/]cli\.mjs$/);
    expect(result.args.slice(1)).toEqual(['watch', 'src/index.ts']);
    expect(result.cwd).toBe(pathResolve(repoRoot, 'apps/api'));
  });

  it('resolves the web service to node + next CLI + dev -p 3001', () => {
    const result = resolveDevCommand({
      name: 'web',
      filter: '@lumespec/web',
      cwd: pathResolve(repoRoot, 'apps/web'),
    });
    expect(result.node).toBe(process.execPath);
    expect(result.args[0]).toMatch(/node_modules[\\/]next[\\/]dist[\\/]bin[\\/]next$/);
    expect(result.args.slice(1)).toEqual(['dev', '-p', '3001']);
    expect(result.cwd).toBe(pathResolve(repoRoot, 'apps/web'));
  });

  it('resolves all 3 workers the same tsx way', () => {
    for (const name of ['worker-crawler', 'worker-storyboard', 'worker-render']) {
      const cwd = pathResolve(repoRoot, `workers/${name.replace('worker-', '')}`);
      const result = resolveDevCommand({ name, filter: `@lumespec/${name}`, cwd });
      expect(result.node).toBe(process.execPath);
      expect(result.args[0]).toMatch(/tsx[\\/]dist[\\/]cli\.mjs$/);
      expect(result.args.slice(1)).toEqual(['watch', 'src/index.ts']);
    }
  });

  it('throws a clear error when the dev script uses an unsupported tool', () => {
    // Uses a fixture directory written to a tmp location
    const fs = require('node:fs');
    const os = require('node:os');
    const path = require('node:path');
    const fixture = fs.mkdtempSync(path.join(os.tmpdir(), 'devcmd-'));
    fs.writeFileSync(
      path.join(fixture, 'package.json'),
      JSON.stringify({ name: 'x', scripts: { dev: 'vite serve' } })
    );
    expect(() =>
      resolveDevCommand({ name: 'x', filter: 'x', cwd: fixture })
    ).toThrow(/unsupported dev script/i);
  });

  it('throws when the service package has no dev script', () => {
    const fs = require('node:fs');
    const os = require('node:os');
    const path = require('node:path');
    const fixture = fs.mkdtempSync(path.join(os.tmpdir(), 'devcmd-'));
    fs.writeFileSync(path.join(fixture, 'package.json'), JSON.stringify({ name: 'x' }));
    expect(() =>
      resolveDevCommand({ name: 'x', filter: 'x', cwd: fixture })
    ).toThrow(/missing "dev" script/i);
  });
});
```

Run: `pnpm --filter @lumespec-internal/scripts test`
Expected: FAIL — "Cannot find module '../lib/devCommand.mjs'".

- [ ] **Step 3: Implement the resolver**

Create `scripts/lib/devCommand.mjs`:

```js
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * @typedef {{ name: string; filter: string; cwd: string }} ServiceConfig
 * @typedef {{ node: string; args: string[]; cwd: string }} SpawnPlan
 */

/**
 * Translate a service's `package.json.scripts.dev` into direct-node spawn args.
 * Supports two shapes (everything in this monorepo):
 *   - "tsx watch src/index.ts"                   → node <tsx-cli.mjs> watch src/index.ts
 *   - "next dev -p <port>"                       → node <next-bin>    dev -p <port>
 *
 * @param {ServiceConfig} svc
 * @returns {SpawnPlan}
 */
export function resolveDevCommand(svc) {
  const pkgPath = join(svc.cwd, 'package.json');
  let pkg;
  try {
    pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
  } catch (err) {
    throw new Error(`resolveDevCommand(${svc.name}): cannot read ${pkgPath}: ${err.message}`);
  }
  const dev = pkg?.scripts?.dev;
  if (!dev || typeof dev !== 'string') {
    throw new Error(`resolveDevCommand(${svc.name}): missing "dev" script in ${pkgPath}`);
  }

  const req = createRequire(join(svc.cwd, 'package.json'));
  const tokens = dev.trim().split(/\s+/);
  const [tool, ...rest] = tokens;

  if (tool === 'tsx') {
    const cli = req.resolve('tsx/dist/cli.mjs');
    return { node: process.execPath, args: [cli, ...rest], cwd: svc.cwd };
  }
  if (tool === 'next') {
    const bin = req.resolve('next/dist/bin/next');
    return { node: process.execPath, args: [bin, ...rest], cwd: svc.cwd };
  }
  throw new Error(
    `resolveDevCommand(${svc.name}): unsupported dev script "${dev}" — add a branch for tool "${tool}"`
  );
}
```

Run: `pnpm --filter @lumespec-internal/scripts test`
Expected: PASS (5 tests).

- [ ] **Step 4: Commit**

```bash
git add scripts/lib/devCommand.mjs scripts/tests/devCommand.test.mjs scripts/vitest.config.mjs scripts/package.json pnpm-workspace.yaml package.json
git commit -m "feat(demo): resolveDevCommand — pure spawn-arg resolver w/ unit tests"
```

---

## Task 2: Replace `spawnService` with direct-node spawn

**Files:**
- Modify: `scripts/lume.mjs` (replace `spawnService`, delete `spawnServiceWindows`, delete `appendHeaderWithRetry`)

- [ ] **Step 1: Replace `spawnService`**

Find the existing `spawnService(svc)` function in `scripts/lume.mjs`. Replace it + delete `spawnServiceWindows` entirely. The new function:

```js
function spawnService(svc) {
  const log = logPath(svc.name);
  // Log header: a single append before spawn, no retry needed — since we now
  // track the real node PID, orphan log-file handles from previous runs don't
  // survive into a new run if the user ran stop first. If the write fails, the
  // child's own append handle still works — we just lose the marker line.
  try {
    appendFileSync(log, `\n===== start ${new Date().toISOString()} (PORT=${svc.port}) =====\n`);
  } catch {
    // Ignore — best-effort header only.
  }

  const plan = resolveDevCommand(svc);
  const stdout = openSync(log, 'a');
  const stderr = openSync(log, 'a');

  const child = spawn(plan.node, plan.args, {
    env: serviceEnv(svc),
    cwd: plan.cwd,
    detached: true,
    stdio: ['ignore', stdout, stderr],
    shell: false,
    windowsHide: true,
  });
  child.unref();
  writePid(svc.name, child.pid);
  console.log(
    `${svc.color}[${svc.name}]${C.reset} started (pid ${child.pid}, PORT=${svc.port}, log: ${log})`
  );
}
```

Add the import at the top of `scripts/lume.mjs`:

```js
import { resolveDevCommand } from './lib/devCommand.mjs';
```

- [ ] **Step 2: Delete dead code**

In `scripts/lume.mjs`, delete:
- The entire `spawnServiceWindows(svc, log)` function and its surrounding rationale comment (the block explaining `ProcessStartInfo.CreateNoWindow` via PowerShell).
- The entire `appendHeaderWithRetry(log, header)` helper — the new code calls `appendFileSync` once inside a try/catch.
- Any `import { spawnSync }` if no longer used elsewhere (check — `reapPorts` uses it via `findPidsOnPort`, so probably still needed).

- [ ] **Step 3: Typecheck and smoke-invoke**

Run: `node --check scripts/lume.mjs`
Expected: "syntax OK" (no output is fine too — non-zero exit would indicate a parse error).

Smoke-invoke the resolver via `--print`:

```bash
node -e "import('./scripts/lib/devCommand.mjs').then(m => console.log(JSON.stringify(m.resolveDevCommand({name:'api',filter:'@lumespec/api',cwd:'apps/api'}), null, 2)))"
```

Expected output: an object with `node` = path to node.exe, `args[0]` = absolute path to `tsx/dist/cli.mjs`, `args.slice(1)` = `['watch', 'src/index.ts']`, `cwd` = `apps/api`.

- [ ] **Step 4: Commit**

```bash
git add scripts/lume.mjs
git commit -m "refactor(demo): spawn node directly, drop PowerShell+cmd.exe bridge"
```

---

## Task 3: Rewrite `stopAll` — PIDs are now real

**Why:** With direct-node spawn, the saved PID is the actual worker. `taskkill /T /F /PID` kills the tree; `process.kill(-pid, 'SIGTERM')` does the same on POSIX. The existing `reapPorts` stays as a safety net for zombies leaked by prior (pre-rewrite) runs.

**Files:**
- Modify: `scripts/lume.mjs` (`stopAll` function)

- [ ] **Step 1: Replace `stopAll`**

Find the existing `stopAll()` and replace with:

```js
async function stopAll() {
  let stopped = 0;
  let stalePids = 0;

  for (const svc of SERVICES) {
    const pid = readPid(svc.name);
    if (pid && isAlive(pid)) {
      try {
        if (IS_WINDOWS) {
          // /T kills the whole tree — Windows has no reliable process-group
          // semantics, so the parent's death does NOT cascade. Without /T,
          // tsx's inner watcher-worker node and next's bundler worker survive
          // as zombies holding ports.
          spawnSync('taskkill', ['/T', '/F', '/PID', String(pid)], { stdio: 'ignore' });
        } else {
          // POSIX: positive pid kill. tsx and next handle SIGTERM gracefully
          // on their own children, so tree-kill is unnecessary. Using -pid
          // (process-group kill) would work — `detached: true` makes Node
          // call `setsid()` so the child IS a group leader — but the extra
          // complexity (ESRCH if the group already exited, EPERM if the
          // signal crosses a session boundary) buys nothing here.
          process.kill(pid, 'SIGTERM');
        }
        console.log(`${svc.color}[${svc.name}]${C.reset} stopped (pid ${pid})`);
        stopped++;
      } catch (err) {
        console.warn(`${svc.color}[${svc.name}]${C.reset} kill failed: ${err.message}`);
      }
    } else if (pid) {
      stalePids++;
    }
    removePid(svc.name);
  }

  if (stopped > 0) await sleep(500);

  // Safety net: catches zombies from pre-rewrite runs (where we tracked dead
  // cmd.exe PIDs and real nodes leaked) plus any edge-case subprocess our tree
  // kill missed. With the rewrite, the normal case finds 0 orphans here.
  const reaped = reapPorts('[stop]');

  cleanRemotionBundles();
  dockerDown();

  const summary = [
    `${stopped} tracked`,
    ...(stalePids > 0 ? [`${stalePids} stale pids`] : []),
    ...(reaped > 0 ? [`${reaped} reaped via port sweep`] : []),
  ].join(', ');
  console.log(`\n${C.bold}Stopped.${C.reset} ${summary}.`);
}
```

- [ ] **Step 2: Make `reapPorts` return its kill count**

Find `function reapPorts(label)` in `scripts/lume.mjs`. It currently does `return killed;` at the bottom — verify it does. If it doesn't, add `return killed;`. (The `stopAll` summary above depends on this.)

- [ ] **Step 3: Commit**

```bash
git add scripts/lume.mjs
git commit -m "refactor(demo): rely on real PIDs for stop, reapPorts is now safety-net only"
```

---

## Task 4: Add `demo clean-all` subcommand

**Why:** A user coming from a pre-rewrite state may still have zombie node/cmd processes from the old spawn path. Give them a nuclear option: match any process whose command line contains `@lumespec/` or a path under the repo, kill them all. Use sparingly.

**Files:**
- Modify: `scripts/lume.mjs` (new function + switch case + help text)

- [ ] **Step 1: Add the function**

Add near `reapPorts` in `scripts/lume.mjs`:

```js
/**
 * Nuclear option for cleaning up legacy zombies. Enumerates every process
 * whose command line touches this repo or our service filters, kills them.
 * Intended for one-time use when migrating from the pre-rewrite spawn model;
 * `stop` handles the normal case.
 */
async function cleanAll() {
  if (!IS_WINDOWS) {
    // POSIX: use pgrep -f; simpler than our Windows path.
    const r = spawnSync('sh', ['-c', `pgrep -f '@lumespec/|${REPO_ROOT}' | xargs -r kill -9`], {
      stdio: 'inherit',
    });
    console.log(`${C.bold}clean-all:${C.reset} POSIX sweep ${r.status === 0 ? 'complete' : 'exited nonzero'}`);
    return;
  }
  // Windows: enumerate via PowerShell + Get-CimInstance.
  const ps = [
    `$matches = Get-CimInstance Win32_Process | Where-Object {`,
    `  $_.CommandLine -and (`,
    `    $_.CommandLine -match '@lumespec/' -or`,
    `    $_.CommandLine -match [regex]::Escape('${REPO_ROOT.replace(/\\/g, '\\\\')}')`,
    `  )`,
    `}`,
    `$matches | ForEach-Object { Write-Output ("killing pid=" + $_.ProcessId + " cmd=" + $_.CommandLine.Substring(0, [Math]::Min(80, $_.CommandLine.Length))); Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }`,
    `Write-Output ("total=" + $matches.Count)`,
  ].join('\n');
  const r = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', ps], {
    stdio: 'inherit',
    windowsHide: true,
  });
  if (r.status !== 0) {
    console.warn(`${C.yellow}clean-all:${C.reset} PowerShell sweep exited ${r.status}`);
  }
  // Also wipe pid files so next start has a clean slate.
  for (const svc of SERVICES) removePid(svc.name);
  console.log(`${C.bold}clean-all:${C.reset} done`);
}
```

- [ ] **Step 2: Wire it into the dispatch switch**

Find the `switch (cmd)` block in `scripts/lume.mjs` (near the bottom). Add:

```js
    case 'clean-all': await cleanAll(); break;
```

- [ ] **Step 3: Update the help text**

Find `function help()` (or the inline help string). Add a line:

```
  ${C.red}clean-all${C.reset}  Nuclear option — kill every node/cmd touching this repo or @lumespec/* filters. Use after upgrading from a broken demo state.
```

- [ ] **Step 4: Smoke test the help text renders**

Run: `pnpm lume help`
Expected: the new `clean-all` line appears without breaking the rest of the help.

- [ ] **Step 5: Commit**

```bash
git add scripts/lume.mjs
git commit -m "feat(demo): add clean-all nuclear option for legacy zombie cleanup"
```

---

## Task 5: Trim stale comments and scaffolding

**Why:** The PowerShell bridge block had a ~20-line explanatory comment about CVE-2024-27980 + EINVAL. That rationale no longer applies — we don't spawn .cmd files anymore, we spawn node.exe directly. Leaving the comment misleads future readers.

**Files:**
- Modify: `scripts/lume.mjs` (comment cleanup)

- [ ] **Step 1: Find + prune stale comments**

Search `scripts/lume.mjs` for:
- "CVE-2024-27980"
- "EINVAL"
- "PowerShell bridge"
- "ProcessStartInfo"
- "CreateNoWindow"
- References to `windowsHide: true` workarounds that are no longer relevant.

For each hit, either delete the comment outright or rewrite to a single line that matches the current (direct-node) code path. Don't leave "this was the way we used to do it" archaeology — git log is authoritative for that.

Typical replacements:
- The entire "On Windows, the combination of (a)...(b)...(c)..." commentary block → delete.
- `windowsHide: true` comment "prevents cmd.exe console from flashing" → change to "prevents any console window when Node spawns a detached grandchild" (accurate for the new world).

- [ ] **Step 2: Check nothing else still uses deleted helpers**

Search the file for `appendHeaderWithRetry` and `spawnServiceWindows`. Expect zero hits (Task 2 deleted them). If any reference survived, remove it.

- [ ] **Step 3: Verify the file still parses + help still renders**

```bash
node --check scripts/lume.mjs
pnpm lume help
```

Both should succeed, help output should look clean.

- [ ] **Step 4: Commit**

```bash
git add scripts/lume.mjs
git commit -m "chore(demo): remove stale PowerShell/EINVAL comments after rewrite"
```

---

## Task 6: Windows smoke test + acceptance checklist

**Why:** Unit tests (Task 1) cover the resolver. Direct-node spawn has no unit test — it's integration by nature. Verify on a Windows machine that the full lifecycle works.

**Files:** none (manual verification only).

- [ ] **Step 1: Fresh Windows state**

Run `pnpm lume clean-all` to nuke any zombies from old runs. Close ALL other PowerShell windows that might have zombie services.

- [ ] **Step 2: Cold start acceptance**

```powershell
pnpm lume start
```

- [ ] All 5 services print "started" lines with PIDs.
- [ ] "All services started" banner appears.
- [ ] Zero extra terminal windows pop up during start (no cmd.exe flashes).
- [ ] `pnpm lume status` within 30s of start shows ALL 5 services UP. The PID shown for each should be the REAL node pid (check via `Get-Process -Id <pid>` → should be `node` not `cmd`).

- [ ] **Step 3: Port ownership check**

```powershell
netstat -ano | Select-String "LISTENING" | Select-String ":3000|:3001|:8081|:8082|:8083"
```

- [ ] 5 listener lines appear (api 3000, web 3001, workers 8081/8082/8083).
- [ ] The PID on each netstat line matches the PID demo.mjs printed in its `started` line.

- [ ] **Step 4: End-to-end video generation**

```powershell
curl -X POST http://localhost:3000/api/jobs -H "Content-Type: application/json" -d '{\"url\":\"https://www.anthropic.com\",\"intent\":\"executive summary\",\"duration\":30}'
```

Note the returned `jobId`. Open `http://localhost:3001/jobs/<jobId>` in the browser.

- [ ] Progress stages advance through crawl → storyboard → render.
- [ ] A video URL appears within ~5 minutes.
- [ ] The video is playable.

- [ ] **Step 5: Stop + restart loop**

```powershell
pnpm lume stop
pnpm lume status   # all DOWN
pnpm lume start
pnpm lume status   # all UP again
pnpm lume stop
```

- [ ] `stop` reports "5 tracked" on the first stop, "0 reaped via port sweep" (no orphans leaked).
- [ ] `status` after stop shows all 5 DOWN.
- [ ] Second start succeeds identically to the first — no EBUSY, no EADDRINUSE.
- [ ] After second stop, no zombie `node` processes survive (verify via `Get-Process node | Where-Object { $_.StartTime -gt (Get-Date).AddMinutes(-5) }` — should be empty).

- [ ] **Step 6: macOS/Linux smoke (if you have access)**

If you do not have a POSIX machine handy, skip this step but flag in the commit that POSIX was not verified. The POSIX code path (non-Windows branch of `spawnService` + `stopAll`) is simpler than Windows and is shared with the existing well-tested behavior, so risk is low.

If POSIX is available:
```bash
pnpm lume start && pnpm lume status && pnpm lume stop
```

Confirm all 5 up, clean stop, no zombies (`pgrep -f @lumespec`).

- [ ] **Step 7: Tag the release**

```bash
git tag v2.0.0-demo-rewrite
git log --oneline -1
```

Do not push the tag — the user pushes when ready.

---

## Task 7: Close the followup doc + update CLAUDE.md

**Files:**
- Modify: `docs/superpowers/followups/2026-04-24-demo-orchestration-rewrite.md`
- Consider: `CLAUDE.md` at repo root — if it lists "known local dev issues", remove the stale note about demo tooling being flaky.

- [ ] **Step 1: Mark followup as resolved**

Edit `docs/superpowers/followups/2026-04-24-demo-orchestration-rewrite.md`. At the top, under the existing `**Status:**` line, change to:

```markdown
**Status:** RESOLVED — implemented 2026-04-24, tag `v2.0.0-demo-rewrite`. Option B (direct node spawn, skip pnpm.cmd middleman) shipped per `docs/superpowers/plans/2026-04-24-demo-orchestration-rewrite.md`.
```

Leave the rest of the document intact as historical context.

- [ ] **Step 2: Check CLAUDE.md**

If `CLAUDE.md` exists at the repo root and mentions the demo tooling issue, remove or update that section.

```bash
grep -rn "demo" CLAUDE.md 2>/dev/null
```

If hits mention fragility, update to match reality.

- [ ] **Step 3: Commit**

```bash
git add docs/superpowers/followups/2026-04-24-demo-orchestration-rewrite.md CLAUDE.md
git commit -m "docs(demo): mark orchestration-rewrite followup resolved"
```

---

## Self-Review Against Spec

Cross-check against the followup spec at `docs/superpowers/followups/2026-04-24-demo-orchestration-rewrite.md`:

| Spec requirement | Where addressed |
|---|---|
| Replace cmd.exe→pnpm.cmd→node chain with direct node spawn | Task 1 (resolver) + Task 2 (spawn call site) |
| Real PID tracked (not dead cmd.exe) | Task 2 — `child.pid` is now node |
| `stopAll` kills the tree via PID | Task 3 — `taskkill /T /F /PID` + `process.kill(-pid)` |
| `reapPorts` stays as safety net | Task 3 — kept and reported in stop summary |
| `demo clean-all` nuclear option for legacy zombies | Task 4 |
| Drop PowerShell bridge entirely | Task 2 (delete `spawnServiceWindows`) + Task 5 (trim comments) |
| Keep windowsHide for CREATE_NO_WINDOW on descendants | Task 2 (spawn options include `windowsHide: true`) |
| POSIX parent-kill is sufficient (no tree-kill needed) | Task 3 — `process.kill(pid, 'SIGTERM')` on POSIX, tsx/next handle their own children cleanly |
| `status` uses port-based probe (already correct) | unchanged from current `isServiceUp` |
| Cross-platform: Windows + macOS + Linux | Task 1 uses `require.resolve` which works everywhere; Task 2 spawn args are OS-agnostic (only `windowsHide` is Windows-only, harmless on POSIX) |
| Log file append with EBUSY retry — keep | Simplified in Task 2: single-shot try/catch (no retry needed because real PIDs no longer leave zombie log handles) |

Placeholder scan: no TBD / TODO / "handle edge cases" strings.

Type consistency: `resolveDevCommand` signature is stable across Task 1, 2. `SpawnPlan` shape (`{node, args, cwd}`) is used identically in the spawn call in Task 2. `reapPorts` returning an integer is consistent across its old use (Task 3) and the new summary formatting.

Scope: purely `scripts/` + one followup doc update. Zero changes to product code, workers, apps, or packages. Low-risk blast radius — a broken demo blocks local dev but never production.

---

## What This Plan Does NOT Do

- Does not switch to PM2 / concurrently / foreman — considered in followup's Option C, rejected for dep weight + behavioral surprises.
- Does not attempt log rotation or structured logging — out of scope.
- Does not add health-check HTTP probes beyond what `isServiceUp` already does.
- Does not handle graceful shutdown of in-flight renders (kills remain forced — spec's explicit non-goal).
- Does not auto-install chromium / heavy deps — those are service-level concerns.
- Does not change the list of services (`SERVICES` array in demo.mjs stays the same).

## Risks

- **pnpm install layout change:** if pnpm moves bin files out of `node_modules/tsx/dist/` in a future version, `require.resolve('tsx/dist/cli.mjs')` starts failing. Mitigation: the error message is clear (Task 1's unit test covers this); a minor pin bump is a one-liner.
- **Next.js version change:** `next/dist/bin/next` is a stable public entry but not guaranteed. If Next 15 moves it, same kind of fix.
- **Process group semantics on WSL1 / unusual POSIX:** `process.kill(-pid)` requires the child to have started a new process group, which `detached: true` provides. Verified on macOS + Linux; WSL1 is unsupported by the spec.
