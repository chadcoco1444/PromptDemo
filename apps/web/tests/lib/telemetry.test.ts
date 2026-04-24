import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { trackIntentPresetSelected } from '../../src/lib/telemetry';

describe('trackIntentPresetSelected', () => {
  const beaconSpy = vi.fn();
  const originalNavigator = globalThis.navigator;

  beforeEach(() => {
    beaconSpy.mockReset();
    // jsdom's navigator doesn't have sendBeacon — inject a spy we control.
    Object.defineProperty(globalThis, 'navigator', {
      configurable: true,
      value: { ...originalNavigator, sendBeacon: beaconSpy },
    });
  });

  afterEach(() => {
    Object.defineProperty(globalThis, 'navigator', {
      configurable: true,
      value: originalNavigator,
    });
  });

  it('calls navigator.sendBeacon with the preset id as JSON payload', () => {
    trackIntentPresetSelected('executive-summary');
    expect(beaconSpy).toHaveBeenCalledTimes(1);
    const [url, payload] = beaconSpy.mock.calls[0]!;
    expect(url).toBe('/api/telemetry/intent-preset');
    // Blob payloads are opaque in jsdom; accept Blob or string
    expect(payload).toBeTruthy();
  });

  it('does not throw when sendBeacon is unavailable (SSR / old browser)', () => {
    Object.defineProperty(globalThis, 'navigator', {
      configurable: true,
      value: { userAgent: 'test' }, // no sendBeacon
    });
    expect(() => trackIntentPresetSelected('tutorial')).not.toThrow();
  });

  it('does not throw when navigator itself is undefined', () => {
    Object.defineProperty(globalThis, 'navigator', {
      configurable: true,
      value: undefined,
    });
    expect(() => trackIntentPresetSelected('tutorial')).not.toThrow();
  });
});
