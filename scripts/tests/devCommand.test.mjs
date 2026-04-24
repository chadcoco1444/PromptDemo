import { describe, it, expect } from 'vitest';
import { resolve as pathResolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveDevCommand } from '../lib/devCommand.mjs';

const repoRoot = pathResolve(fileURLToPath(new URL('../../', import.meta.url)));

describe('resolveDevCommand', () => {
  it('resolves tsx services (workers, api) to node + tsx CLI + watch + entry', () => {
    const result = resolveDevCommand({
      name: 'api',
      filter: '@promptdemo/api',
      cwd: pathResolve(repoRoot, 'apps/api'),
    });
    expect(result.node).toBe(process.execPath);
    expect(result.args[0]).toMatch(/node_modules[\\/]tsx[\\/]dist[\\/]cli\.mjs$/);
    expect(result.args.slice(1)).toEqual(['watch', 'src/index.ts']);
    expect(result.cwd).toBe(pathResolve(repoRoot, 'apps/api'));
  });

  it('resolves the web service to node + next CLI + dev -p 3001', () => {
    const result = resolveDevCommand({
      name: 'web',
      filter: '@promptdemo/web',
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
      const result = resolveDevCommand({ name, filter: `@promptdemo/${name}`, cwd });
      expect(result.node).toBe(process.execPath);
      expect(result.args[0]).toMatch(/tsx[\\/]dist[\\/]cli\.mjs$/);
      expect(result.args.slice(1)).toEqual(['watch', 'src/index.ts']);
    }
  });

  it('throws a clear error when the dev script uses an unsupported tool', async () => {
    const fs = await import('node:fs');
    const os = await import('node:os');
    const path = await import('node:path');
    const fixture = fs.mkdtempSync(path.join(os.tmpdir(), 'devcmd-'));
    fs.writeFileSync(
      path.join(fixture, 'package.json'),
      JSON.stringify({ name: 'x', scripts: { dev: 'vite serve' } })
    );
    expect(() =>
      resolveDevCommand({ name: 'x', filter: 'x', cwd: fixture })
    ).toThrow(/unsupported dev script/i);
  });

  it('throws when the service package has no dev script', async () => {
    const fs = await import('node:fs');
    const os = await import('node:os');
    const path = await import('node:path');
    const fixture = fs.mkdtempSync(path.join(os.tmpdir(), 'devcmd-'));
    fs.writeFileSync(path.join(fixture, 'package.json'), JSON.stringify({ name: 'x' }));
    expect(() =>
      resolveDevCommand({ name: 'x', filter: 'x', cwd: fixture })
    ).toThrow(/missing "dev" script/i);
  });
});
