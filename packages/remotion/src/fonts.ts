import { delayRender, continueRender } from 'remotion';
import { loadFont as loadInter } from '@remotion/google-fonts/Inter';
import { loadFont as loadPoppins } from '@remotion/google-fonts/Poppins';
import { loadFont as loadRoboto } from '@remotion/google-fonts/Roboto';
import { loadFont as loadJetBrainsMono } from '@remotion/google-fonts/JetBrainsMono';
import { loadFont as loadMontserrat } from '@remotion/google-fonts/Montserrat';
import { loadFont as loadPlayfairDisplay } from '@remotion/google-fonts/PlayfairDisplay';
import { loadFont as loadDMSans } from '@remotion/google-fonts/DMSans';
import { loadFont as loadNunito } from '@remotion/google-fonts/Nunito';
import { loadFont as loadLato } from '@remotion/google-fonts/Lato';
import { loadFont as loadOpenSans } from '@remotion/google-fonts/OpenSans';
import { loadFont as loadSourceSans3 } from '@remotion/google-fonts/SourceSans3';

// Keep in sync with workers/crawler/src/extractors/fontDetector.ts (Plan 1 Task 1.8)
const LOADERS: Record<string, () => { fontFamily: string; waitUntilDone: () => Promise<void> }> = {
  Inter: loadInter,
  Poppins: loadPoppins,
  Roboto: loadRoboto,
  'JetBrains Mono': loadJetBrainsMono,
  Montserrat: loadMontserrat,
  'Playfair Display': loadPlayfairDisplay,
  'DM Sans': loadDMSans,
  Nunito: loadNunito,
  Lato: loadLato,
  'Open Sans': loadOpenSans,
  'Source Sans 3': loadSourceSans3,
};

const DEFAULT_FONT = 'Inter';

export async function loadBrandFont(requested: string | undefined): Promise<string> {
  const family = requested && LOADERS[requested] ? requested : DEFAULT_FONT;
  const handle = LOADERS[family]!();
  const delay = delayRender(`font-${family}`);
  try {
    await handle.waitUntilDone();
  } finally {
    continueRender(delay);
  }
  return handle.fontFamily;
}
