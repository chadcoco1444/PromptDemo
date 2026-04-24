import React from 'react';
import type { Scene, Storyboard } from '@promptdemo/schema';
import { HeroRealShot } from './scenes/HeroRealShot';
import { FeatureCallout } from './scenes/FeatureCallout';
import { TextPunch } from './scenes/TextPunch';
import { SmoothScroll } from './scenes/SmoothScroll';
import { CTA } from './scenes/CTA';
import type { BrandTheme } from './utils/brandTheme';

export interface ResolveSceneInput {
  scene: Scene;
  assets: Storyboard['assets'];
  theme: BrandTheme;
  url: string;
  logoUrl?: string;
  resolver: (uri: string | undefined) => string | undefined;
}

export function resolveScene(input: ResolveSceneInput): React.ReactElement {
  const { scene, assets, theme, url, logoUrl, resolver } = input;
  switch (scene.type) {
    case 'HeroRealShot': {
      const key = scene.props.screenshotKey;
      const screenshotUrl = resolver(assets.screenshots[key]);
      if (!screenshotUrl) throw new Error(`HeroRealShot requires assets.screenshots.${key}`);
      return (
        <HeroRealShot
          title={scene.props.title}
          {...(scene.props.subtitle ? { subtitle: scene.props.subtitle } : {})}
          screenshotUrl={screenshotUrl}
          url={url}
          theme={theme}
        />
      );
    }
    case 'FeatureCallout': {
      // Route both screenshots + variant to the FeatureCallout dispatcher — it
      // picks the right panel (image / kenBurns / collage / dashboard) and
      // falls back to the stylized DashboardPanel dashboard if a required
      // screenshot is missing (Tier-B fallback).
      const viewportSrc = resolver(assets.screenshots.viewport);
      const fullPageSrc = resolver(assets.screenshots.fullPage);
      return (
        <FeatureCallout
          title={scene.props.title}
          description={scene.props.description}
          layout={scene.props.layout}
          theme={theme}
          variant={scene.props.variant}
          {...(viewportSrc ? { viewportSrc } : {})}
          {...(fullPageSrc ? { fullPageSrc } : {})}
        />
      );
    }
    case 'TextPunch':
      return <TextPunch text={scene.props.text} emphasis={scene.props.emphasis} theme={theme} />;
    case 'SmoothScroll': {
      const screenshotUrl = resolver(assets.screenshots.fullPage);
      if (!screenshotUrl) throw new Error('SmoothScroll requires assets.screenshots.fullPage');
      return <SmoothScroll screenshotUrl={screenshotUrl} url={url} speed={scene.props.speed} theme={theme} />;
    }
    case 'CTA':
      return (
        <CTA
          headline={scene.props.headline}
          url={scene.props.url}
          {...(logoUrl ? { logoUrl } : {})}
          theme={theme}
        />
      );
    case 'HeroStylized':
    case 'CursorDemo':
    case 'UseCaseStory':
    case 'StatsBand':
    case 'BentoGrid':
      throw new Error(
        `scene type "${scene.type}" is deferred to v1.1 and not implemented in v1.0`
      );
  }
}
