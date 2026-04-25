'use client';

import { useSession } from 'next-auth/react';
import { JobForm } from '../JobForm';
import type { JobInput } from '../../lib/types';
import { signInRedirectFor } from '../../lib/prefill';

export interface PreviewFormProps {
  /**
   * Called only when the user is signed in. Same signature as the JobForm
   * `onSubmit` prop the existing /create flow uses.
   */
  onAuthedSubmit: (input: JobInput) => Promise<{ jobId: string }>;
  initialHint?: string;
}

/**
 * Wraps <JobForm/> for the marketing landing page. When the user submits
 * while signed-out, we don't fail — we capture the intent and bounce to
 * sign-in, with the form values carried via `?prefill=<base64>` on the
 * post-auth callback URL. /create reads it and auto-submits.
 *
 * Signed-in users get the normal submit path.
 */
export function PreviewForm({ onAuthedSubmit, initialHint }: PreviewFormProps) {
  const { status } = useSession();

  const handleSubmit = async (input: JobInput): Promise<{ jobId: string }> => {
    // Session still hydrating — never redirect prematurely. Hang the
    // promise so JobForm stays in its "pending" state. By the time the
    // user notices, useSession will have resolved and a re-submit lands
    // on the right branch. (In practice, hydration takes <50ms and the
    // hang is imperceptible.)
    if (status === 'loading') {
      return new Promise(() => {});
    }
    if (status === 'authenticated') {
      return onAuthedSubmit(input);
    }
    const redirect = signInRedirectFor({
      url: input.url,
      intent: input.intent,
      duration: input.duration,
    });
    window.location.href = redirect;
    return new Promise(() => {});
  };

  return <JobForm onSubmit={handleSubmit} {...(initialHint ? { initialHint } : {})} />;
}
