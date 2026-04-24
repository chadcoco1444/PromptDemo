# Demo Orchestration Rewrite — Followup

**Created:** 2026-04-24
**Status:** **RESOLVED** (core issues) — implemented 2026-04-24 via `docs/superpowers/plans/2026-04-24-demo-orchestration-rewrite.md`, tag `v2.0.0-demo-rewrite`. Option B shipped (direct node spawn, skip pnpm.cmd middleman). End-to-end `pnpm demo test` passes: 5/5 services UP, real PIDs tracked, `stop` kills cleanly, no zombie accumulation, 60s video roundtrip.

## Known issue remaining (non-blocking)

**Terminal visibility on Windows.** `pnpm demo start` still pops 5 visible-but-empty console windows (4 `node.exe` + 1 `next-server`). `windowsHide: true` hides the parent node.exe we spawn, but `tsx watch`'s internal child-node spawn and Next.js's bundler-worker fork don't inherit the hide flag, so their grandchildren create visible consoles with no way to suppress from the launcher side. Impact:

- Services work correctly; consoles are empty (stdio goes to log files).
- `pnpm demo stop` closes all 5 windows cleanly along with the processes.
- Purely visual noise, no functional regression.

Fix path (deferred): Windows Job Object with `JOB_OBJECT_LIMIT_UI_LIMIT` + `JOB_OBJECT_UILIMIT_DESKTOP` via a native helper (`ffi-napi` or a small companion EXE). Estimated 4-6 hours, fragile across Windows versions, not worth blocking feature work on.

## Problem

`scripts/demo.mjs` is the local lifecycle manager for the 5-service demo stack
(crawler + storyboard + render + api + web). On Windows it's unreliable: each
`pnpm demo start` leaves only 1 random service actually listening on its port,
despite reporting all 5 as "started".

Symptoms observed this session:
- `start` prints `[svc] started (pid N)` for all 5, but `netstat` afterwards
  shows only 1 listening port
- `stop` leaves orphan tsx-watch `node.exe` processes behind (no listening
  port but still alive)
- After 3+ start/stop cycles, dozens of zombie `node` + `cmd` processes
  accumulate, competing for ports on the next start

## Root causes

1. **PID tracking lies.** `Start-Process cmd.exe /c pnpm --filter X dev`
   spawns cmd.exe, which execs pnpm.cmd, which spawns node. `pnpm.cmd` exits
   as soon as node is running, so cmd.exe exits too. We save cmd.exe's PID —
   already dead by the time we record it. Can't use this PID for alive-checks
   (fixed with port-based probe in `1d316d9`) and can't use it to kill the
   real node later.
2. **Job-object inheritance (suspected).** Node's `spawnSync('powershell', ...)`
   puts PowerShell in a job object. The `[Process]::Start($psi)` call inside
   PowerShell creates a cmd.exe that inherits the job. When spawnSync returns
   and PowerShell exits, Windows may terminate the whole job — killing the
   grandchild node. The "random one survives" pattern fits a race between
   Node exiting the outer IIFE and PS-derived jobs being torn down.
3. **Zombie accumulation.** `stop` only kills what's *currently listening*.
   tsx-watch's parent node process doesn't bind a port (it forks a child that
   does). When the port-bound child dies, the parent sticks around, gets
   orphaned, never reaped.

## Candidate fixes (pick one or combine)

### Option A — Commandline-based stop
Use `Get-CimInstance Win32_Process | Where CommandLine -like '*@promptdemo/*'`
to enumerate every related process (cmd, pnpm, node, tsx) and kill them all.
Handles zombies regardless of how they were spawned.

Tradeoff: slow (~300-500ms per `stop`), captures processes the user may
actually want (e.g. a `tsx src/index.ts` they launched by hand in another
terminal). Mitigation: filter by both commandline AND cwd
(`ExecutablePath -like '*promptdemo*'`).

### Option B — Direct node spawn (skip pnpm.cmd)
For each service, resolve the actual entry command at startup time:
- workers + api: `node_modules/.bin/tsx watch src/index.ts`
- web: `node_modules/.bin/next dev -p 3001`

Spawn these directly via `child_process.spawn(nodeBin, [tsxPath, 'watch', ...])`.
No cmd.exe middleman → PID we save IS the real server PID → stop/status/kill
all work deterministically.

Tradeoff: needs per-service entry detection (read each package.json's `dev`
script and reconstruct). If pnpm adds env vars or does workspace-symlink work
we skip that. Historically promptdemo's `dev` scripts are plain `tsx watch`
or `next dev`, so this should work.

### Option C — Use `concurrently` or PM2
Stop hand-rolling. `concurrently` runs multiple commands in one process,
prefixes output. PM2 is a full process manager with log rotation, status,
cluster mode, etc.

Tradeoff: extra dep. PM2 in particular is heavy. Concurrently doesn't give
us background/detached mode by default, so `pnpm demo start` would block
the terminal instead of being fire-and-forget.

### Option D — Add `demo clean-all` subcommand
As a minimum safety net: a nuclear option that kills every process whose
commandline matches `--filter @promptdemo/` OR `apps/(api|web)` OR
`workers/(crawler|storyboard|render)`. Use before every `start` if state
is suspect.

## Recommendation

**Option B is the right long-term fix.** Direct node spawn eliminates the
cmd.exe parent problem entirely and gives us honest PIDs. Combine with a
small `clean-all` (Option D) as a safety net for recovering from older
zombie state.

Estimated effort: 2-3 hours of focused work + testing on Windows + Linux.

## Scope for the rewrite PR

- Replace `spawnServiceWindows` and the POSIX branch with a single direct-node
  spawn path that reads each package's `package.json.scripts.dev` and
  reconstructs the argv for the local `tsx` / `next` binary.
- Update `stopAll` to kill by commandline match as a followup pass (catches
  orphans from earlier bad-state sessions).
- Add `pnpm demo clean-all` subcommand that nukes any `@promptdemo/*`-tagged
  node/cmd process.
- Drop the PowerShell bridge entirely (it was a workaround for EINVAL on
  pnpm.cmd, no longer needed once we skip pnpm).

## What to keep

- `reapPorts` (port-listener sweep) is still useful as a belt-and-suspenders
  pass before `start`.
- `isServiceUp` (port-based liveness probe) is the right signal — keep.
- Log-file append with EBUSY retry — keep.
- Windows `CREATE_NO_WINDOW` via spawnSync's `windowsHide` option — should
  work fine for direct node spawns without the PowerShell bridge.

## Non-goals

- Cross-platform parity beyond Windows + macOS + Linux (no WSL1, no BSDs).
- Graceful shutdown of in-flight renders (kills are always forced).
- Log aggregation beyond the current per-service tail files.
