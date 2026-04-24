export type SupportedLocale = 'en' | 'zh';

/**
 * Decide which set of chip labels to render. Only two supported locales.
 * BCP-47 tags like "zh-TW" / "zh-Hans-CN" / "zh" all resolve to "zh";
 * everything else (including parse failures) falls back to "en".
 */
export function detectLocale(languageTag: string | undefined | null): SupportedLocale {
  if (!languageTag) return 'en';
  const primary = languageTag.split('-')[0]?.toLowerCase();
  if (primary === 'zh') return 'zh';
  return 'en';
}
