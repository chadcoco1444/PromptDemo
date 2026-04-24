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

export function JobForm({ onSubmit, initialHint, parentJobId }: JobFormProps) {
  const [url, setUrl] = useState('');
  const [intent, setIntent] = useState(initialHint ?? '');
  const [duration, setDuration] = useState<10 | 30 | 60>(30);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  // Read the browser locale in the useState initializer so the very first
  // client render uses the correct language — avoids the "Flash of English"
  // for zh users. The server render always sees `undefined` and resolves to
  // 'en', so there is an expected hydration mismatch on the chip-row subtree
  // for zh users; suppressHydrationWarning on the wrapping div tells React
  // not to complain. This is the standard pragmatic pattern for locale-
  // dependent client-only UI in Next.js App Router.
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
      return;
    }
    setPending(true);
    try {
      await onSubmit(parsed.data);
    } catch (err) {
      setError((err as Error).message);
      setPending(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4 max-w-xl">
      <div>
        <label htmlFor="url" className="block text-sm font-medium mb-1">
          URL
        </label>
        <input
          id="url"
          type="text"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://your-product.com"
          className="w-full rounded border px-3 py-2"
        />
      </div>
      <div>
        <label htmlFor="intent" className="block text-sm font-medium mb-1">
          Intent
        </label>
        <textarea
          id="intent"
          value={intent}
          onChange={(e) => setIntent(e.target.value)}
          placeholder="What should the video emphasize?"
          className="w-full rounded border px-3 py-2 h-24"
        />
        <div className="mt-2 flex items-start gap-3" suppressHydrationWarning>
          <button
            type="button"
            onClick={toggleLocale}
            className="text-xs rounded-md border border-gray-300 bg-white px-2 py-1 font-medium text-gray-700 hover:bg-gray-50 shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-1"
            aria-label="Toggle preset language"
            title="Switch preset language"
            // Server may derive a different locale than client (Node 22+
            // now populates navigator.language from OS locale), so the
            // button TEXT can legitimately differ. suppressHydrationWarning
            // on the button itself is required because the attribute only
            // propagates one level deep — the wrapper div's copy doesn't
            // reach the button's text child.
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
        <label htmlFor="duration" className="block text-sm font-medium mb-1">
          Duration
        </label>
        <select
          id="duration"
          value={duration}
          onChange={(e) => setDuration(Number(e.target.value) as 10 | 30 | 60)}
          className="rounded border px-3 py-2"
        >
          <option value={10}>10s</option>
          <option value={30}>30s</option>
          <option value={60}>60s</option>
        </select>
      </div>
      {error ? <div className="text-red-600 text-sm">{error}</div> : null}
      <button
        type="submit"
        disabled={pending}
        className="bg-brand-500 hover:bg-brand-700 disabled:opacity-50 text-white px-5 py-2 rounded"
      >
        {pending ? 'Creating…' : 'Create video'}
      </button>
    </form>
  );
}
