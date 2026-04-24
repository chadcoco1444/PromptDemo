import { describe, it, expect } from 'vitest';
import { withTempDir } from '../src/tempDir.js';
import { existsSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

describe('withTempDir', () => {
  it('creates dir, runs fn, cleans up on success', async () => {
    let path = '';
    const result = await withTempDir('promptdemo-render-', async (dir) => {
      path = dir;
      writeFileSync(join(dir, 'hello.txt'), 'hi');
      return 42;
    });
    expect(result).toBe(42);
    expect(existsSync(path)).toBe(false);
  });

  it('cleans up even when the fn throws', async () => {
    let path = '';
    await expect(
      withTempDir('promptdemo-render-', async (dir) => {
        path = dir;
        throw new Error('boom');
      })
    ).rejects.toThrow('boom');
    expect(existsSync(path)).toBe(false);
  });
});
