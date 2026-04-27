#!/usr/bin/env node
// Pre-commit guard: if any architectural file is staged but the corresponding
// module's DESIGN.md is NOT, refuse the commit.
//
// Bypass with `git commit --no-verify` (and please note the reason in the
// commit message). The trigger table here MUST stay in lockstep with the
// human-readable table in CLAUDE.md ("修改後的強制動作 — 同步 DESIGN.md").

import { execSync } from 'node:child_process';

/** @type {Array<{ slug: string, design: string, triggers: RegExp[] }>} */
const MODULES = [
  {
    slug: 'apps/api',
    design: 'apps/api/DESIGN.md',
    triggers: [
      /^apps\/api\/src\/routes\//,
      /^apps\/api\/src\/cron\//,
      /^apps\/api\/src\/credits\//,
      /^apps\/api\/src\/orchestrator\//,
      /^apps\/api\/src\/auth\//,
      /^apps\/api\/src\/sse\//,
      /^apps\/api\/src\/jobStore.*\.ts$/,
      /^apps\/api\/src\/queues\.ts$/,
      /^apps\/api\/src\/index\.ts$/,
      /^apps\/api\/src\/app\.ts$/,
      /^apps\/api\/package\.json$/,
    ],
  },
  {
    slug: 'apps/web',
    design: 'apps/web/DESIGN.md',
    triggers: [
      /^apps\/web\/src\/app\/api\//,
      /^apps\/web\/src\/auth\.ts$/,
      /^apps\/web\/src\/middleware\.ts$/,
      /^apps\/web\/src\/lib\/internalToken\.ts$/,
      /^apps\/web\/src\/app\/(layout|history|billing|create)\//,
      /^apps\/web\/src\/app\/layout\.tsx$/,
      /^apps\/web\/package\.json$/,
    ],
  },
  {
    slug: 'workers/crawler',
    design: 'workers/crawler/DESIGN.md',
    triggers: [
      /^workers\/crawler\/src\/index\.ts$/,
      /^workers\/crawler\/src\/circuitBreaker\.ts$/,
      /^workers\/crawler\/package\.json$/,
    ],
  },
  {
    slug: 'workers/storyboard',
    design: 'workers/storyboard/DESIGN.md',
    triggers: [
      /^workers\/storyboard\/src\/index\.ts$/,
      /^workers\/storyboard\/src\/generator\.ts$/,
      /^workers\/storyboard\/src\/anthropic\//,
      /^workers\/storyboard\/src\/validation\//,
      /^workers\/storyboard\/package\.json$/,
    ],
  },
  {
    slug: 'workers/render',
    design: 'workers/render/DESIGN.md',
    triggers: [
      /^workers\/render\/src\/index\.ts$/,
      /^workers\/render\/package\.json$/,
    ],
  },
  {
    slug: 'packages/schema',
    design: 'packages/schema/DESIGN.md',
    triggers: [/^packages\/schema\/src\//],
  },
  {
    slug: 'packages/remotion',
    design: 'packages/remotion/DESIGN.md',
    triggers: [
      /^packages\/remotion\/src\/scenes\//,
      /^packages\/remotion\/src\/resolveScene\.tsx$/,
      /^packages\/remotion\/src\/Composition\.tsx$/,
      /^packages\/remotion\/package\.json$/,
    ],
  },
  {
    slug: 'db',
    design: 'db/DESIGN.md',
    triggers: [/^db\/migrations\//],
  },
];

const RED = '\x1b[31m';
const YELLOW = '\x1b[33m';
const CYAN = '\x1b[36m';
const BOLD = '\x1b[1m';
const RESET = '\x1b[0m';

let staged;
try {
  staged = execSync('git diff --cached --name-only --diff-filter=ACMRD', {
    encoding: 'utf8',
  })
    .split('\n')
    .map((s) => s.replace(/\\/g, '/').trim())
    .filter(Boolean);
} catch (err) {
  // No git repo / nothing staged — let git handle it.
  process.exit(0);
}

if (staged.length === 0) process.exit(0);

const violations = [];
for (const mod of MODULES) {
  const triggered = staged.filter((f) => mod.triggers.some((rx) => rx.test(f)));
  if (triggered.length === 0) continue;
  if (staged.includes(mod.design)) continue;
  violations.push({ slug: mod.slug, design: mod.design, files: triggered });
}

if (violations.length === 0) process.exit(0);

console.error('');
console.error(`${RED}${BOLD}╔════════════════════════════════════════════════════════════════════╗${RESET}`);
console.error(`${RED}${BOLD}║  DESIGN.md sync required — commit blocked                          ║${RESET}`);
console.error(`${RED}${BOLD}╚════════════════════════════════════════════════════════════════════╝${RESET}`);
console.error('');
console.error(
  `${YELLOW}Per CLAUDE.md「修改後的強制動作 — 同步 DESIGN.md」, the following${RESET}`,
);
console.error(`${YELLOW}architectural changes need their DESIGN.md updated in the same commit:${RESET}`);
console.error('');

for (const v of violations) {
  console.error(`  ${BOLD}${CYAN}${v.slug}${RESET}  ${BOLD}→  must also stage:  ${v.design}${RESET}`);
  for (const f of v.files) console.error(`    ${YELLOW}↳${RESET} touched: ${f}`);
  console.error('');
}

console.error(
  `${YELLOW}If this change does NOT alter responsibilities / public interfaces /${RESET}`,
);
console.error(
  `${YELLOW}data-flow boundaries / anti-patterns (pure refactor, log tweak,${RESET}`,
);
console.error(`${YELLOW}typo, test fixture), bypass with:${RESET}`);
console.error('');
console.error(`  ${BOLD}git commit --no-verify${RESET}`);
console.error('');
console.error(
  `${YELLOW}…and please note the reason in the commit message body.${RESET}`,
);
console.error('');

process.exit(1);
