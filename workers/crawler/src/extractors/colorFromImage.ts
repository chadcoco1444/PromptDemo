import sharp from 'sharp';
import { toHex } from './colorSampler.js';

/**
 * Extract the dominant color from an image buffer using Sharp's built-in
 * HSV-based color quantization. Sharp's `.stats()` returns
 * `dominant: {r,g,b}` computed via histogram + clustering — well-suited to
 * logos which have limited palettes (typically 2-5 colors).
 *
 * Returns undefined if Sharp fails to parse the buffer (corrupt image,
 * unsupported format, etc.) — caller should fall through to the next tier.
 *
 * Cost: ~50ms for a 1000x1000 image (Sharp is native C++).
 *
 * Caveat: for purely-neutral logos (e.g., Vercel's black-on-white wordmark),
 * Sharp will correctly return a neutral hex. The caller (orchestrator)
 * applies no further filtering — neutral IS the right answer for those
 * brands, per the soft-neutral philosophy in colorSampler.ts.
 */
export async function extractDominantColorFromImage(buf: Buffer): Promise<string | undefined> {
  try {
    const { dominant } = await sharp(buf).stats();
    return toHex(dominant.r, dominant.g, dominant.b);
  } catch {
    return undefined;
  }
}
