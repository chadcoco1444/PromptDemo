import { StoryboardSchema, type Storyboard } from '@promptdemo/schema';
import { getPacingRules, type PacingProfile } from '../prompts/pacingProfiles.js';

export type ValidateResult =
  | { kind: 'ok'; storyboard: Storyboard }
  | { kind: 'error'; issues: string[] };

export interface ValidateOpts {
  /**
   * Pacing profile, derived from the user's intent. When provided, scenes
   * that violate the profile's frame caps cause validation to fail with a
   * specific issue — this gets fed back to Claude on retry.
   */
  profile?: PacingProfile;
}

export function zodValidate(input: unknown, opts: ValidateOpts = {}): ValidateResult {
  const res = StoryboardSchema.safeParse(input);
  if (!res.success) {
    const issues = res.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`);
    return { kind: 'error', issues };
  }

  // Profile-aware second pass. Only enforces caps; unrelated structure was
  // already vetted by Zod. We deliberately throw violations through the same
  // error channel so the generator's retry loop kicks in without special-casing.
  const profile = opts.profile;
  if (profile && profile !== 'default') {
    const rules = getPacingRules(profile);
    const pacingIssues: string[] = [];
    for (const [i, scene] of res.data.scenes.entries()) {
      if (rules.maxSceneFrames !== null && scene.durationInFrames > rules.maxSceneFrames) {
        pacingIssues.push(
          `scenes[${i}].durationInFrames: ${scene.durationInFrames} exceeds ${profile} cap of ${rules.maxSceneFrames}`,
        );
      }
      if (rules.minSceneFrames !== null && scene.durationInFrames < rules.minSceneFrames) {
        pacingIssues.push(
          `scenes[${i}].durationInFrames: ${scene.durationInFrames} below ${profile} floor of ${rules.minSceneFrames}`,
        );
      }
    }
    if (pacingIssues.length > 0) {
      return { kind: 'error', issues: pacingIssues };
    }
  }

  return { kind: 'ok', storyboard: res.data };
}
