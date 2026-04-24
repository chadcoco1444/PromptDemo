/**
 * Fire-and-forget preset-chip click tracker.
 *
 * Posts `{ presetId, ts }` to /api/telemetry/intent-preset via sendBeacon so
 * the request survives navigation. The endpoint does not exist in v2.0 — the
 * POST 404s, sendBeacon swallows it, the user sees nothing. Wire a real
 * receiver when the analytics service lands (see followup doc).
 *
 * Guarded against SSR + non-browser environments so it's safe to call from
 * any client-component event handler.
 */
export function trackIntentPresetSelected(presetId: string): void {
  if (typeof navigator === 'undefined' || typeof navigator.sendBeacon !== 'function') {
    return;
  }
  try {
    const payload = JSON.stringify({ presetId, ts: Date.now() });
    const blob = new Blob([payload], { type: 'application/json' });
    navigator.sendBeacon('/api/telemetry/intent-preset', blob);
  } catch {
    // Swallow — telemetry must never crash a click handler.
  }
}
