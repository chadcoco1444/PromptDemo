import { StoryboardSchema, type Storyboard } from '@promptdemo/schema';

export type ValidateResult =
  | { kind: 'ok'; storyboard: Storyboard }
  | { kind: 'error'; issues: string[] };

export function zodValidate(input: unknown): ValidateResult {
  const res = StoryboardSchema.safeParse(input);
  if (res.success) return { kind: 'ok', storyboard: res.data };
  const issues = res.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`);
  return { kind: 'error', issues };
}
