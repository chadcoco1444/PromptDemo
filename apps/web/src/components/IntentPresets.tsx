'use client';

import { useState } from 'react';
import { INTENT_PRESETS, type IntentPreset } from '../lib/intentPresets';
import type { SupportedLocale } from '../lib/locale';

export interface IntentPresetsProps {
  locale: SupportedLocale;
  onSelect: (preset: IntentPreset) => void;
}

export function IntentPresets({ locale, onSelect }: IntentPresetsProps) {
  // Per-chip animation nonce — incrementing the value re-triggers the
  // `animate-chip-pop` CSS animation by forcing a remount of the key. We
  // store per-preset.id so clicking different chips in rapid succession
  // animates each independently.
  const [popNonce, setPopNonce] = useState<Record<string, number>>({});

  function handleClick(preset: IntentPreset) {
    setPopNonce((prev) => ({ ...prev, [preset.id]: (prev[preset.id] ?? 0) + 1 }));
    onSelect(preset);
  }

  return (
    <div className="flex flex-wrap gap-2" role="group" aria-label="Preset suggestions">
      {INTENT_PRESETS.map((preset) => {
        const nonce = popNonce[preset.id] ?? 0;
        // Only apply the pop animation class AFTER a click so the page load
        // doesn't bounce all 5 chips. Keying by preset.id:nonce forces a
        // remount on each click, which re-triggers the animation cleanly.
        const popClass = nonce > 0 ? 'animate-chip-pop' : '';
        return (
          <button
            key={`${preset.id}:${nonce}`}
            type="button"
            title={preset.body[locale]}
            onClick={() => handleClick(preset)}
            className={`text-xs rounded-full border border-brand-500 bg-white dark:bg-gray-800 text-brand-700 dark:text-brand-300 px-3 py-1 hover:bg-brand-500 hover:text-white dark:hover:bg-brand-500 dark:hover:text-white transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-gray-900 ${popClass}`}
          >
            {preset.labels[locale]}
          </button>
        );
      })}
    </div>
  );
}
