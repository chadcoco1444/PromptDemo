import { describe, it, expect } from 'vitest';
import { DeviceMockup } from '../src/scenes/DeviceMockup.js';
import { deriveTheme } from '../src/utils/brandTheme.js';

const theme = deriveTheme('#4f46e5');

const baseProps: Parameters<typeof DeviceMockup>[0] = {
  headline: 'Ship demos in seconds',
  subtitle: 'Paste a URL, hit enter.',
  screenshotUrl: 'http://fake/viewport.jpg',
  device: 'laptop',
  motion: 'pushIn',
  durationInFrames: 150,
  theme,
};

describe('DeviceMockup smoke', () => {
  // NOTE: The plan originally proposed @testing-library/react render() smoke tests,
  // but the established pattern in packages/remotion/tests (CodeToUI, LogoCloud,
  // Watermark) is TypeScript shape / contract checks — actual frame rendering is
  // gated behind REMOTION_SMOKE=true (renderSmoke.test.ts) because Remotion hooks
  // (useCurrentFrame) throw outside CompositionManagerContext and there is no
  // jsdom env configured here. Following the established pattern.

  it('exports a function component', () => {
    expect(typeof DeviceMockup).toBe('function');
  });

  it('is named DeviceMockup (for Remotion DevTools)', () => {
    expect(DeviceMockup.name).toBe('DeviceMockup');
  });

  it('accepts the full prop shape with motion=pushIn', () => {
    const props: Parameters<typeof DeviceMockup>[0] = { ...baseProps, motion: 'pushIn' };
    expect(props.motion).toBe('pushIn');
    expect(props.headline).toContain('Ship demos');
    expect(props.subtitle).toContain('Paste a URL');
  });

  it('accepts the full prop shape with motion=pullOut', () => {
    const props: Parameters<typeof DeviceMockup>[0] = { ...baseProps, motion: 'pullOut' };
    expect(props.motion).toBe('pullOut');
  });

  it('accepts laptop and phone device variants', () => {
    for (const device of ['laptop', 'phone'] as const) {
      const props: Parameters<typeof DeviceMockup>[0] = { ...baseProps, device };
      expect(props.device).toBe(device);
    }
  });

  it('accepts props without subtitle', () => {
    const { subtitle: _omit, ...withoutSubtitle } = baseProps;
    void _omit;
    const props: Parameters<typeof DeviceMockup>[0] = withoutSubtitle;
    expect(props.subtitle).toBeUndefined();
    expect(props.headline).toContain('Ship demos');
  });
});
