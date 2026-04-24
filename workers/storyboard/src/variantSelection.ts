import type { Scene, Storyboard, FeatureVariant } from '@promptdemo/schema';

export function selectVariants(
  scenes: Scene[],
  assets: Storyboard['assets'],
  featureCount: number
): Scene[] {
  const hasViewport = Boolean(assets.screenshots.viewport);
  const hasFullPage = Boolean(assets.screenshots.fullPage);

  let fcIndex = -1;
  return scenes.map((scene) => {
    if (scene.type !== 'FeatureCallout') return scene;
    fcIndex += 1;
    const variant = pick(fcIndex, hasViewport, hasFullPage, featureCount);
    return {
      ...scene,
      props: { ...scene.props, variant },
    };
  });
}

function pick(
  fcIndex: number,
  hasViewport: boolean,
  hasFullPage: boolean,
  featureCount: number
): FeatureVariant {
  if (!hasViewport) return 'dashboard';
  if (fcIndex === 0) return 'image';
  if (hasFullPage && fcIndex % 2 === 0) return 'kenBurns';
  if (hasFullPage && featureCount >= 3) return 'collage';
  return 'image';
}
