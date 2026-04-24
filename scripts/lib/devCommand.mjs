import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
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
    const tsxPkg = dirname(req.resolve('tsx/package.json'));
    const cli = join(tsxPkg, 'dist', 'cli.mjs');
    return { node: process.execPath, args: [cli, ...rest], cwd: svc.cwd };
  }
  if (tool === 'next') {
    const nextPkg = dirname(req.resolve('next/package.json'));
    const bin = join(nextPkg, 'dist', 'bin', 'next');
    return { node: process.execPath, args: [bin, ...rest], cwd: svc.cwd };
  }
  throw new Error(
    `resolveDevCommand(${svc.name}): unsupported dev script "${dev}" - add a branch for tool "${tool}"`
  );
}
