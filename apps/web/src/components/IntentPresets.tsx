'use client';

import { INTENT_PRESETS, type IntentPreset } from '../lib/intentPresets';
import type { SupportedLocale } from '../lib/locale';

export interface IntentPresetsProps {
  locale: SupportedLocale;
  onSelect: (preset: IntentPreset) => void;
}

export function IntentPresets({ locale, onSelect }: IntentPresetsProps) {
  return (
    <div className="flex flex-wrap gap-2" role="group" aria-label="Intent presets">
      {INTENT_PRESETS.map((preset) => (
        <button
          key={preset.id}
          type="button"
          title={preset.body}
          onClick={() => onSelect(preset)}
          className="text-xs rounded-full border border-brand-500 bg-white text-brand-700 px-3 py-1 hover:bg-brand-500 hover:text-white transition-colors"
        >
          {preset.labels[locale]}
        </button>
      ))}
    </div>
  );
}
