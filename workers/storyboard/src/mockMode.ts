import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { StoryboardSchema, type Storyboard } from '@promptdemo/schema';

const FIXTURES_DIR = fileURLToPath(
  new URL('../../../packages/schema/fixtures/', import.meta.url)
);

const FIXTURE_BY_DURATION: Record<10 | 30 | 60, string> = {
  10: 'storyboard.10s.json',
  30: 'storyboard.30s.json',
  60: 'storyboard.60s.json',
};

export async function loadMockStoryboard(duration: 10 | 30 | 60): Promise<Storyboard> {
  const file = join(FIXTURES_DIR, FIXTURE_BY_DURATION[duration]);
  const raw = JSON.parse(await readFile(file, 'utf8'));
  return StoryboardSchema.parse(raw);
}
