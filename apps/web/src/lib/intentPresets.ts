export interface IntentPreset {
  /** Stable identifier for telemetry. Never change once shipped. */
  id: string;
  labels: { en: string; zh: string };
  /** Body text spliced into the intent. Always English — Claude prompts
   *  more reliably in English, and the storyboard worker's system prompt
   *  is English too. */
  body: string;
}

export const INTENT_PRESETS: IntentPreset[] = [
  {
    id: 'executive-summary',
    labels: { en: 'Executive Summary', zh: '高階主管摘要' },
    body: [
      'Emphasize business outcomes, time savings, and ROI.',
      'Keep pacing deliberate. Close on the single strongest value proposition.',
      'Tone: authoritative, calm.',
    ].join(' '),
  },
  {
    id: 'tutorial',
    labels: { en: 'Tutorial / Walkthrough', zh: '教學版' },
    body: [
      'Walk through the product step-by-step as a first-time user would experience it.',
      'Show the starting state, the key action, then the result.',
      'Include screenshots of the UI where helpful.',
      'Tone: instructive, clear, patient.',
    ].join(' '),
  },
  {
    id: 'marketing-hype',
    labels: { en: 'Marketing Hype', zh: '行銷版' },
    body: [
      'High-energy promotional spot.',
      'Short punchy scene durations. Emphasize speed, results, and aesthetic.',
      'Use a single powerful tagline.',
      'Tone: energetic, modern.',
    ].join(' '),
  },
  {
    id: 'technical-deep-dive',
    labels: { en: 'Technical Deep-Dive', zh: '技術向' },
    body: [
      'Speak to a developer audience.',
      'Emphasize architecture, integrations, and engineering decisions.',
      'Highlight data flows and performance characteristics.',
      'Tone: precise, substantive, respectful of expertise.',
    ].join(' '),
  },
  {
    id: 'customer-success',
    labels: { en: 'Customer Success Story', zh: '客戶案例' },
    body: [
      'Frame as a user journey: the problem, the before state, adopting the tool,',
      'then the after state with measurable results.',
      'Use testimonial-style beats.',
      'Tone: narrative, empathetic, outcome-focused.',
    ].join(' '),
  },
];

/**
 * Pure fill/append rule used when a chip is clicked.
 *
 * Rules, in order:
 *   1. Dedup — if the preset body already appears verbatim in `current`, return
 *      unchanged. Guards against double-click / same-chip-twice stuffing the
 *      textarea with duplicate preset copies.
 *   2. Empty / whitespace-only current → return the preset body verbatim (fill mode).
 *   3. Otherwise → append on a blank line, prefixed with [Preset: <en-label>].
 *
 * The English label is intentionally used in the marker even when the UI shows
 * the zh label, because the resulting string is sent to Claude (stronger prompts
 * in English). Chinese label is display-only.
 */
export function applyPreset(current: string, preset: IntentPreset): string {
  if (current.includes(preset.body)) return current; // dedup
  if (current.trim().length === 0) return preset.body;
  return `${current}\n\n[Preset: ${preset.labels.en}]\n${preset.body}`;
}
