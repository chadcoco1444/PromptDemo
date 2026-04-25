'use client';

import { useState, useRef, useEffect } from 'react';
import { motion } from 'framer-motion';
import { JobInputSchema, type JobInput } from '../lib/types';
import { IntentPresets } from './IntentPresets';
import { MagneticButton } from './MagneticButton';
import { applyPreset, type IntentPreset } from '../lib/intentPresets';
import { type SupportedLocale } from '../lib/locale';
import { trackIntentPresetSelected } from '../lib/telemetry';

export interface JobFormProps {
  onSubmit: (input: JobInput) => Promise<{ jobId: string }>;
  initialHint?: string;
  initialUrl?: string;
  initialIntent?: string;
  initialDuration?: 10 | 30 | 60;
  parentJobId?: string;
}

const INPUT_CLASSES =
  'w-full rounded border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 px-3 py-2 placeholder:text-gray-400 dark:placeholder:text-gray-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:border-transparent transition-colors';

export function JobForm({ onSubmit, initialHint, initialUrl, initialIntent, initialDuration, parentJobId }: JobFormProps) {
  const [url, setUrl] = useState(initialUrl ?? '');
  const [intent, setIntent] = useState(initialIntent ?? initialHint ?? '');
  const [duration, setDuration] = useState<10 | 30 | 60>(initialDuration ?? 30);
  const [error, setError] = useState<string | null>(null);
  const [shakeNonce, setShakeNonce] = useState(0); // re-trigger shake anim on each invalid submit
  const [pending, setPending] = useState(false);

  // Locale starts hard-locked to 'en' on every mount. Auto-detection (via
  // navigator.language) caused a flash-of-English → Chinese swap on hydration
  // for zh users — we now require an explicit click on the language toggle.
  // Trade-off: zh users see English on first load, but no SSR/CSR mismatch
  // and no layout shift.
  const [locale, setLocale] = useState<SupportedLocale>('en');

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
        <SpringTextarea
          id="intent"
          value={intent}
          onChange={(e) => setIntent(e.target.value)}
          placeholder="What should the video emphasize?"
          className={INPUT_CLASSES}
        />
        <div className="mt-2 flex items-start gap-3">
          <button
            type="button"
            onClick={toggleLocale}
            className="text-xs rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-2 py-1 font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-1 dark:focus-visible:ring-offset-gray-900 active:scale-95 transition-transform"
            aria-label="Toggle preset language"
            title="Switch preset language"
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
      <MagneticButton
        type="submit"
        disabled={pending}
        className="bg-brand-500 hover:bg-brand-600 disabled:opacity-50 disabled:cursor-not-allowed text-white px-5 py-2 rounded-md font-medium shadow-lg shadow-brand-500/30 hover:shadow-brand-500/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-gray-900 transition-shadow"
      >
        {pending ? 'Creating…' : 'Create video'}
      </MagneticButton>
    </form>
  );
}

/**
 * v2.1 Phase 4 — textarea with spring-animated height growth. When the
 * intent text overflows the visible rows, the height transitions via
 * framer-motion spring instead of the default abrupt scrollbar appearance.
 *
 * Reads scrollHeight on every change and animates `height` to match,
 * clamped to a min/max so a paragraph paste doesn't push the form off
 * screen.
 */
function SpringTextarea({
  id,
  value,
  onChange,
  placeholder,
  className,
}: {
  id: string;
  value: string;
  onChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => void;
  placeholder: string;
  className: string;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const [height, setHeight] = useState(96); // initial: matches old h-24

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    // Measure: temporarily reset height to auto so scrollHeight is accurate,
    // then snap back to the controlled height the spring will animate to.
    el.style.height = 'auto';
    const next = Math.min(280, Math.max(96, el.scrollHeight));
    el.style.height = '';
    setHeight(next);
  }, [value]);

  return (
    <motion.textarea
      ref={ref}
      id={id}
      value={value}
      onChange={onChange}
      placeholder={placeholder}
      animate={{ height }}
      transition={{ type: 'spring', stiffness: 220, damping: 22, mass: 0.5 }}
      className={`${className} resize-none overflow-hidden`}
      style={{ height }}
    />
  );
}
