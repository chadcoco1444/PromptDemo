export interface IntentVideo {
  intent: 'hardsell' | 'tech' | 'emotional';
  filename: string;
  emoji: string;
  label: string;
  headline: string;
  description: string;
}

// One URL (Vercel), three intents — demonstrates the core value prop
// that intent steers the entire storyboard, not just the copy.
export const INTENT_VIDEOS: IntentVideo[] = [
  {
    intent: 'hardsell',
    filename: 'vercel-hardsell.mp4',
    emoji: '🔥',
    label: 'Hard-sell',
    headline: 'Punchy promo cuts',
    description: 'Fast scene pace, single tagline, energetic tone.',
  },
  {
    intent: 'tech',
    filename: 'vercel-tech.mp4',
    emoji: '🔬',
    label: 'Tech deep-dive',
    headline: 'Methodical walkthrough',
    description: 'Concrete features in sequence, no marketing fluff.',
  },
  {
    intent: 'emotional',
    filename: 'vercel-emotional.mp4',
    emoji: '💫',
    label: 'Emotional brand story',
    headline: 'Cinematic atmosphere',
    description: 'Slow pace, aspiration, who-you-become framing.',
  },
];
