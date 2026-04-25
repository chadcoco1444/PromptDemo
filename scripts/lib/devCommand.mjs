import { createRequire } from 'node:module';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';

/**
 * @typedef {{ name: string; filter: string; cwd: string }} ServiceConfig
 * @typedef {{ node: string; args: string[]; cwd: string }} SpawnPlan
 */

/**
 * Translate a service's `package.json.scripts.dev` into direct-node spawn args.
 * Supports two shapes (everything in this monorepo):
 *   - "tsx watch src/index.ts"                   -> node <tsx-cli.mjs> watch src/index.ts
 *   - "next dev -p <port>"                       -> node <next-bin>    dev -p <port>
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
    // tsx's package.json `exports` restricts subpath access, so resolve the
    // package.json (which is always exported) and derive the CLI path from it.
    // On Windows+pnpm, local symlinks may not resolve via createRequire — fall
    // back to the pnpm virtual store at the workspace root.
    let tsxPkg;
    try {
      tsxPkg = dirname(req.resolve('tsx/package.json'));
    } catch {
      const pnpmStore = join(process.cwd(), 'node_modules', '.pnpm');
      const entries = existsSync(pnpmStore) ? readdirSync(pnpmStore) : [];
      const tsxEntry = entries.filter(e => e.startsWith('tsx@')).sort().at(-1);
      if (!tsxEntry) throw new Error(`resolveDevCommand(${svc.name}): cannot find tsx in pnpm store`);
      tsxPkg = join(pnpmStore, tsxEntry, 'node_modules', 'tsx');
    }
    const cli = join(tsxPkg, 'dist', 'cli.mjs');
    return { node: process.execPath, args: [cli, ...rest], cwd: svc.cwd };
  }
  if (tool === 'next') {
    let nextPkg;
    try {
      nextPkg = dirname(req.resolve('next/package.json'));
    } catch {
      const pnpmStore = join(process.cwd(), 'node_modules', '.pnpm');
      const entries = existsSync(pnpmStore) ? readdirSync(pnpmStore) : [];
      const nextEntry = entries.filter(e => e.startsWith('next@')).sort().at(-1);
      if (!nextEntry) throw new Error(`resolveDevCommand(${svc.name}): cannot find next in pnpm store`);
      nextPkg = join(pnpmStore, nextEntry, 'node_modules', 'next');
    }
    const bin = join(nextPkg, 'dist', 'bin', 'next');
    return { node: process.execPath, args: [bin, ...rest], cwd: svc.cwd };
  }
  throw new Error(
    `resolveDevCommand(${svc.name}): unsupported dev script "${dev}" - add a branch for tool "${tool}"`
  );
}
