export interface IntentVideo {
  intent: 'hardsell' | 'tech' | 'emotional';
  filename: string;
  emoji: string;
  label: string;
  headline: string;
  description: string;
}

export interface IntentVideoGroup {
  brandName: string;
  brandUrl: string;
  brandTagline: string;
  videos: IntentVideo[];
}

// Each group = one URL × 3 intents. Adding a row = appending a new group here.
export const INTENT_VIDEO_GROUPS: IntentVideoGroup[] = [
  {
    brandName: 'Vercel',
    brandUrl: 'vercel.com',
    brandTagline: 'Infrastructure for the modern web — same URL, three story angles.',
    videos: [
      { intent: 'hardsell', filename: 'vercel-hardsell.mp4', emoji: '🔥', label: 'Hard-sell', headline: 'Punchy promo cuts', description: 'Fast scene pace, single tagline, energetic tone.' },
      { intent: 'tech', filename: 'vercel-tech.mp4', emoji: '🔬', label: 'Tech deep-dive', headline: 'Methodical walkthrough', description: 'Concrete features in sequence, no marketing fluff.' },
      { intent: 'emotional', filename: 'vercel-emotional.mp4', emoji: '💫', label: 'Emotional brand story', headline: 'Cinematic atmosphere', description: 'Slow pace, aspiration, who-you-become framing.' },
    ],
  },
  {
    brandName: 'Burton',
    brandUrl: 'burton.com',
    brandTagline: 'Snowboard heritage brand — completely different industry, same three intents.',
    videos: [
      { intent: 'hardsell', filename: 'burton-hardsell.mp4', emoji: '🔥', label: 'Hard-sell', headline: 'Mountain-ready pitch', description: 'High-energy gear push, tight scene cuts.' },
      { intent: 'tech', filename: 'burton-tech.mp4', emoji: '🔬', label: 'Tech deep-dive', headline: 'Build & material focus', description: 'Construction details, sequential feature reveal.' },
      { intent: 'emotional', filename: 'burton-emotional.mp4', emoji: '💫', label: 'Emotional brand story', headline: 'First-tracks atmosphere', description: 'Aspirational mountain lifestyle, slow pacing.' },
    ],
  },
];
