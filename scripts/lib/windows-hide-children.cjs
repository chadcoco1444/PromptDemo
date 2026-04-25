// Loaded via NODE_OPTIONS=--require by spawnService in scripts/demo.mjs.
//
// Problem: Node's `windowsHide: true` flag tells libuv to pass
// CREATE_NO_WINDOW when creating the immediate child. It does NOT propagate
// to grandchildren. tsx's internal watcher spawns esbuild and the actual
// entry, both with default options — so each pops a brief console window
// even though we hid the outer Node. Multiply by 5 services on
// `pnpm demo start` and you see 5 terminal flashes.
//
// Fix: monkey-patch child_process.spawn / spawnSync so that any Node
// process descending from our launcher defaults to windowsHide:true. This
// affects only Node processes (NODE_OPTIONS only loads in node), but tsx,
// next, esbuild's TS-side wrapper — they're all node processes that spawn
// further children. Each becomes hidden.
//
// Caveats:
//   - Only patched when process.platform === 'win32'. POSIX is a no-op.
//   - Respects explicit windowsHide:false from the caller (don't override).
//   - Does NOT touch stdio, detached, or other options.
'use strict';

if (process.platform !== 'win32') return;

const cp = require('child_process');

function ensureHidden(opts) {
  if (!opts || typeof opts !== 'object') return { windowsHide: true };
  if (Object.prototype.hasOwnProperty.call(opts, 'windowsHide')) return opts;
  return Object.assign({}, opts, { windowsHide: true });
}

const origSpawn = cp.spawn;
cp.spawn = function patchedSpawn(command, args, options) {
  if (Array.isArray(args)) {
    return origSpawn.call(this, command, args, ensureHidden(options));
  }
  // (command, options) signature — args was actually options.
  return origSpawn.call(this, command, ensureHidden(args));
};

const origSpawnSync = cp.spawnSync;
cp.spawnSync = function patchedSpawnSync(command, args, options) {
  if (Array.isArray(args)) {
    return origSpawnSync.call(this, command, args, ensureHidden(options));
  }
  return origSpawnSync.call(this, command, ensureHidden(args));
};

const origExec = cp.exec;
cp.exec = function patchedExec(command, optionsOrCb, cb) {
  if (typeof optionsOrCb === 'function') {
    return origExec.call(this, command, ensureHidden(undefined), optionsOrCb);
  }
  return origExec.call(this, command, ensureHidden(optionsOrCb), cb);
};

const origExecFile = cp.execFile;
cp.execFile = function patchedExecFile(file, args, options, cb) {
  // Variadic: (file), (file, args), (file, options), (file, args, options),
  // any of the above with a final callback. Normalize to find the options slot.
  if (typeof args === 'function') {
    return origExecFile.call(this, file, undefined, ensureHidden(undefined), args);
  }
  if (Array.isArray(args)) {
    if (typeof options === 'function') {
      return origExecFile.call(this, file, args, ensureHidden(undefined), options);
    }
    return origExecFile.call(this, file, args, ensureHidden(options), cb);
  }
  // args is options here.
  if (typeof options === 'function') {
    return origExecFile.call(this, file, undefined, ensureHidden(args), options);
  }
  return origExecFile.call(this, file, undefined, ensureHidden(args), cb);
};
