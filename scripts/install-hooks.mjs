#!/usr/bin/env node
// Wires `git config core.hooksPath` to scripts/git-hooks/ and ensures the
// pre-commit script is marked executable. Idempotent — safe to re-run.
//
// Triggered by package.json#scripts.prepare so it runs after `pnpm install`.

import { execSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const HOOKS_PATH = 'scripts/git-hooks';
const HOOK_FILE = join(REPO_ROOT, HOOKS_PATH, 'pre-commit');

// Skip silently outside a git checkout (e.g., npm tarball install).
try {
  execSync('git rev-parse --is-inside-work-tree', { stdio: 'ignore' });
} catch {
  process.exit(0);
}

if (!existsSync(HOOK_FILE)) {
  console.warn(`[install-hooks] ${HOOK_FILE} missing — skipping`);
  process.exit(0);
}

let current = '';
try {
  current = execSync('git config --get core.hooksPath', { encoding: 'utf8' }).trim();
} catch {
  // not set — fine, we'll set it below
}

if (current !== HOOKS_PATH) {
  execSync(`git config core.hooksPath ${HOOKS_PATH}`);
  console.log(`[install-hooks] core.hooksPath → ${HOOKS_PATH}`);
} else {
  console.log(`[install-hooks] core.hooksPath already → ${HOOKS_PATH}`);
}

// Mark the hook executable in git's index. Cross-platform: on Windows the
// fileMode bit is otherwise ignored, but git update-index records it so the
// bit travels with the repo and works on POSIX too.
try {
  execSync(`git update-index --chmod=+x ${HOOKS_PATH}/pre-commit`, { stdio: 'ignore' });
} catch {
  // First-time install before the file is tracked — git add later will pick
  // up the +x set by `chmod` below.
}

// Belt-and-suspenders: chmod +x on POSIX. No-op on Windows.
if (process.platform !== 'win32') {
  try {
    execSync(`chmod +x ${HOOK_FILE}`);
  } catch {
    // best-effort
  }
}
