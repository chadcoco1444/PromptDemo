import type { Storyboard } from '@lumespec/schema';

/**
 * v1.7 soft validator — measures TextPunch usage discipline per the spec
 * (max 2 per storyboard, never consecutive). Does NOT reject; only reports.
 * Caller logs the report for telemetry; future Phase 5 may decide to upgrade
 * to hard rejection (Zod refinement) once we have prod data.
 */

export interface TextPunchDisciplineReport {
  total: number;                          // total TextPunch scenes in storyboard
  consecutive: number;                    // count of TextPunch-TextPunch adjacencies
  variantCounts: Record<string, number>;  // 'default' | 'photoBackdrop' | 'slideBlock'
  violatesMaxCount: boolean;              // total > 2
  violatesNoConsecutive: boolean;         // consecutive > 0
}

const MAX_TEXTPUNCH_PER_STORYBOARD = 2;

export function evaluateTextPunchDiscipline(sb: Storyboard): TextPunchDisciplineReport {
  const scenes = sb.scenes;
  let total = 0;
  let consecutive = 0;
  const variantCounts: Record<string, number> = {};

  for (let i = 0; i < scenes.length; i++) {
    const scene = scenes[i];
    if (!scene || scene.type !== 'TextPunch') continue;
    total += 1;
    const variant = scene.props.variant ?? 'default';
    variantCounts[variant] = (variantCounts[variant] ?? 0) + 1;
    const next = scenes[i + 1];
    if (next && next.type === 'TextPunch') consecutive += 1;
  }

  return {
    total,
    consecutive,
    variantCounts,
    violatesMaxCount: total > MAX_TEXTPUNCH_PER_STORYBOARD,
    violatesNoConsecutive: consecutive > 0,
  };
}
