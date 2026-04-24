'use client';

import { useState } from 'react';
import { JobInputSchema, type JobInput } from '../lib/types';
import { IntentPresets } from './IntentPresets';
import { applyPreset, type IntentPreset } from '../lib/intentPresets';
import { detectLocale, type SupportedLocale } from '../lib/locale';
import { trackIntentPresetSelected } from '../lib/telemetry';

export interface JobFormProps {
  onSubmit: (input: JobInput) => Promise<{ jobId: string }>;
  initialHint?: string;
  parentJobId?: string;
}

const INPUT_CLASSES =
  'w-full rounded border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 px-3 py-2 placeholder:text-gray-400 dark:placeholder:text-gray-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:border-transparent transition-colors';

export function JobForm({ onSubmit, initialHint, parentJobId }: JobFormProps) {
  const [url, setUrl] = useState('');
  const [intent, setIntent] = useState(initialHint ?? '');
  const [duration, setDuration] = useState<10 | 30 | 60>(30);
  const [error, setError] = useState<string | null>(null);
  const [shakeNonce, setShakeNonce] = useState(0); // re-trigger shake anim on each invalid submit
  const [pending, setPending] = useState(false);

  const [locale, setLocale] = useState<SupportedLocale>(() =>
    detectLocale(typeof navigator !== 'undefined' ? navigator.language : undefined)
  );

  function handlePresetSelect(preset: IntentPreset) {
    setIntent((current) => applyPreset(current, preset, locale));
    trackIntentPresetSelected(preset.id);
  }

  function toggleLocale() {
    setLocale((l) => (l === 'en' ? 'zh' : 'en'));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const draft: JobInput = {
      url,
      intent,
      duration,
      ...(parentJobId ? { parentJobId } : {}),
    };
    const parsed = JobInputSchema.safeParse(draft);
    if (!parsed.success) {
      const urlIssue = parsed.error.issues.find((i) => i.path[0] === 'url');
      setError(urlIssue ? 'Please enter a valid URL' : parsed.error.issues[0]?.message ?? 'Invalid input');
      setShakeNonce((n) => n + 1); // bump to restart CSS animation
      return;
    }
    setPending(true);
    try {
      await onSubmit(parsed.data);
    } catch (err) {
      setError((err as Error).message);
      setShakeNonce((n) => n + 1);
      setPending(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="space-y-4 max-w-xl"
      // keying by shakeNonce on the error div below; form itself stable
    >
      <div>
        <label htmlFor="url" className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300">
          URL
        </label>
        <input
          id="url"
          type="text"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://your-product.com"
          className={INPUT_CLASSES}
        />
      </div>
      <div>
        <label htmlFor="intent" className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300">
          Intent
        </label>
        <textarea
          id="intent"
          value={intent}
          onChange={(e) => setIntent(e.target.value)}
          placeholder="What should the video emphasize?"
          className={`${INPUT_CLASSES} h-24`}
        />
        <div className="mt-2 flex items-start gap-3" suppressHydrationWarning>
          <button
            type="button"
            onClick={toggleLocale}
            className="text-xs rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-2 py-1 font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-1 dark:focus-visible:ring-offset-gray-900 active:scale-95 transition-transform"
            aria-label="Toggle preset language"
            title="Switch preset language"
            suppressHydrationWarning
          >
            {locale === 'en' ? '中' : 'EN'}
          </button>
          <div className="flex-1">
            <IntentPresets locale={locale} onSelect={handlePresetSelect} />
          </div>
        </div>
      </div>
      <div>
        <label htmlFor="duration" className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300">
          Duration
        </label>
        <select
          id="duration"
          value={duration}
          onChange={(e) => setDuration(Number(e.target.value) as 10 | 30 | 60)}
          className={`${INPUT_CLASSES} w-auto`}
        >
          <option value={10}>10s</option>
          <option value={30}>30s</option>
          <option value={60}>60s</option>
        </select>
      </div>
      {error ? (
        <div
          key={shakeNonce}
          role="alert"
          className="text-red-600 dark:text-red-400 text-sm animate-shake-x"
        >
          {error}
        </div>
      ) : null}
      <button
        type="submit"
        disabled={pending}
        className="bg-brand-500 hover:bg-brand-600 disabled:opacity-50 disabled:cursor-not-allowed text-white px-5 py-2 rounded-md font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-gray-900 active:scale-[0.98] transition-all duration-150"
      >
        {pending ? 'Creating…' : 'Create video'}
      </button>
    </form>
  );
}
