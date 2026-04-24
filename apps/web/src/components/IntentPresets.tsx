'use client';

import { INTENT_PRESETS, type IntentPreset } from '../lib/intentPresets';
import type { SupportedLocale } from '../lib/locale';

export interface IntentPresetsProps {
  locale: SupportedLocale;
  onSelect: (preset: IntentPreset) => void;
}

export function IntentPresets({ locale, onSelect }: IntentPresetsProps) {
  return (
    <div className="flex flex-wrap gap-2" role="group" aria-label="Preset suggestions">
      {INTENT_PRESETS.map((preset) => (
        <button
          key={preset.id}
          type="button"
          title={preset.body[locale]}
          onClick={() => onSelect(preset)}
          className="text-xs rounded-full border border-brand-500 bg-white text-brand-700 px-3 py-1 hover:bg-brand-500 hover:text-white transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2"
          // suppressHydrationWarning only works ONE level deep — we have to
          // put it on the button itself (not a wrapping div) so React ignores
          // the server-vs-client text mismatch for zh users. Server renders
          // 'en' labels (no navigator); client may hydrate with 'zh'.
          suppressHydrationWarning
        >
          {preset.labels[locale]}
        </button>
      ))}
    </div>
  );
}
