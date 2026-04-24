import type { SupportedLocale } from './locale';

export interface IntentPreset {
  /** Stable identifier for telemetry. Never change once shipped. */
  id: string;
  labels: { en: string; zh: string };
  /** Bilingual body. UI renders the locale-matching body in the tooltip and
   *  splices the locale-matching body into the textarea on click. Whatever
   *  locale the user picks at submit time is what Claude receives.
   *
   *  Note: the EN body is stronger for Claude's scene generation — the
   *  storyboard worker's system prompt is authored in English and Claude
   *  prompts more reliably in English. Users who pick zh accept that
   *  tradeoff (per v2.0 product decision, Option C). */
  body: { en: string; zh: string };
}

export const INTENT_PRESETS: IntentPreset[] = [
  {
    id: 'executive-summary',
    labels: { en: 'Executive Summary', zh: '高階主管摘要' },
    body: {
      en: [
        'Emphasize business outcomes, time savings, and ROI.',
        'Keep pacing deliberate. Close on the single strongest value proposition.',
        'Tone: authoritative, calm.',
      ].join(' '),
      zh: '以商業成果、時間效益、投資報酬為主軸。節奏沉穩，不趕。結尾聚焦在最核心的一個價值主張。語氣:專業、篤定。',
    },
  },
  {
    id: 'tutorial',
    labels: { en: 'Tutorial / Walkthrough', zh: '教學版' },
    body: {
      en: [
        'Walk through the product step-by-step as a first-time user would experience it.',
        'Show the starting state, the key action, then the result.',
        'Include screenshots of the UI where helpful.',
        'Tone: instructive, clear, patient.',
      ].join(' '),
      zh: '以新手第一次使用的角度，一步步帶過產品流程。先展示起始畫面，再做出關鍵操作，最後呈現結果。關鍵步驟附上介面截圖輔助說明。語氣:清楚、耐心、循序漸進。',
    },
  },
  {
    id: 'marketing-hype',
    labels: { en: 'Marketing Hype', zh: '行銷版' },
    body: {
      en: [
        'High-energy promotional spot.',
        'Short punchy scene durations. Emphasize speed, results, and aesthetic.',
        'Use a single powerful tagline.',
        'Tone: energetic, modern.',
      ].join(' '),
      zh: '高能量的行銷短片。每個鏡頭節奏快而俐落。強調速度、效果、視覺質感。主軸放在一句有力的標語。語氣:活力、現代、有衝擊力。',
    },
  },
  {
    id: 'technical-deep-dive',
    labels: { en: 'Technical Deep-Dive', zh: '技術向' },
    body: {
      en: [
        'Speak to a developer audience.',
        'Emphasize architecture, integrations, and engineering decisions.',
        'Highlight data flows and performance characteristics.',
        'Tone: precise, substantive, respectful of expertise.',
      ].join(' '),
      zh: '對工程師觀眾說話。聚焦架構設計、整合方式、工程決策。點出資料流動與效能特徵。語氣:精確、有料、對專業抱持尊重。',
    },
  },
  {
    id: 'customer-success',
    labels: { en: 'Customer Success Story', zh: '客戶案例' },
    body: {
      en: [
        'Frame as a user journey: the problem, the before state, adopting the tool,',
        'then the after state with measurable results.',
        'Use testimonial-style beats.',
        'Tone: narrative, empathetic, outcome-focused.',
      ].join(' '),
      zh: '以使用者旅程的方式呈現:遇到什麼問題、原本的狀態、導入這個工具、改變後可量化的成果。用客戶見證式的節奏鋪陳。語氣:敘事、有同理心、聚焦成果。',
    },
  },
];

/**
 * Pure fill/append rule used when a chip is clicked.
 *
 * Precedence (in order):
 *   1. Bilingual dedup — if EITHER body.en OR body.zh already appears
 *      verbatim in `current`, return unchanged. Prevents double-click AND
 *      locale-swap + re-click from stuffing two copies of the same preset
 *      into the textarea.
 *   2. Empty / whitespace-only current → return the locale-matching body
 *      verbatim (fill mode).
 *   3. Otherwise → append on a blank line, prefixed with [Preset: <label>]
 *      where the label AND body both follow the passed `locale`.
 */
export function applyPreset(
  current: string | null | undefined,
  preset: IntentPreset,
  locale: SupportedLocale = 'en'
): string {
  // Defensive: partial migrations (HMR during this task) or unexpected
  // undefined from stale closures should not crash the click handler.
  const c = current ?? '';
  if (c.includes(preset.body.en) || c.includes(preset.body.zh)) {
    return c; // bilingual dedup
  }
  if (c.trim().length === 0) return preset.body[locale];
  return `${c}\n\n[Preset: ${preset.labels[locale]}]\n${preset.body[locale]}`;
}
