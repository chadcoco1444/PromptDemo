import React from 'react';
import type { Scene, Storyboard } from '@lumespec/schema';
import { HeroRealShot } from './scenes/HeroRealShot';
import { FeatureCallout } from './scenes/FeatureCallout';
import { TextPunch } from './scenes/TextPunch';
import { SmoothScroll } from './scenes/SmoothScroll';
import { CTA } from './scenes/CTA';
import { BentoGrid } from './scenes/BentoGrid';
import { CursorDemo } from './scenes/CursorDemo';
import { StatsCounter } from './scenes/StatsCounter';
import { ReviewMarquee } from './scenes/ReviewMarquee';
import { LogoCloud } from './scenes/LogoCloud';
import { CodeToUI } from './scenes/CodeToUI';
import { DeviceMockup } from './scenes/DeviceMockup';
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
      return <SmoothScroll screenshotUrl={screenshotUrl} url={url} speed={scene.props.speed} theme={theme} durationInFrames={scene.durationInFrames} />;
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
    case 'BentoGrid': {
      const items = scene.props.items.map(({ title, description, iconHint }) => ({
        title,
        ...(description !== undefined ? { description } : {}),
        ...(iconHint !== undefined ? { iconHint } : {}),
      }));
      return <BentoGrid items={items} theme={theme} />;
    }
    case 'CursorDemo': {
      const screenshotUrl = resolver(assets.screenshots.viewport);
      return (
        <CursorDemo
          action={scene.props.action}
          targetHint={scene.props.targetHint}
          targetDescription={scene.props.targetDescription}
          {...(screenshotUrl ? { screenshotUrl } : {})}
          durationInFrames={scene.durationInFrames}
          theme={theme}
        />
      );
    }
    case 'StatsCounter':
      return <StatsCounter stats={scene.props.stats} theme={theme} />;
    case 'ReviewMarquee':
      return (
        <ReviewMarquee
          reviews={scene.props.reviews}
          speed={scene.props.speed}
          theme={theme}
          durationInFrames={scene.durationInFrames}
        />
      );
    case 'LogoCloud': {
      const logos = scene.props.logos
        .map(({ name, s3Uri }) => ({ name, resolvedUrl: resolver(s3Uri) }))
        .filter((l): l is { name: string; resolvedUrl: string } => !!l.resolvedUrl);
      return (
        <LogoCloud
          logos={logos}
          speed={scene.props.speed}
          {...(scene.props.label ? { label: scene.props.label } : {})}
          theme={theme}
          durationInFrames={scene.durationInFrames}
        />
      );
    }
    case 'CodeToUI': {
      const screenshotUri = assets.screenshots[scene.props.screenshotKey];
      const screenshotUrl = resolver(screenshotUri);
      return (
        <CodeToUI
          code={scene.props.code}
          {...(scene.props.language ? { language: scene.props.language } : {})}
          {...(scene.props.label ? { label: scene.props.label } : {})}
          {...(screenshotUrl ? { screenshotUrl } : {})}
          theme={theme}
          durationInFrames={scene.durationInFrames}
        />
      );
    }
    case 'DeviceMockup': {
      // v1 only ships 'laptop'. If AI emits 'phone' before mobile-viewport
      // crawling is built, fall back to HeroRealShot — Q6 graceful-degradation
      // policy. Same fallback fires when the viewport screenshot is missing.
      const screenshotUrl = resolver(assets.screenshots.viewport);
      if (scene.props.device !== 'laptop' || !screenshotUrl) {
        return (
          <HeroRealShot
            title={scene.props.headline}
            {...(scene.props.subtitle ? { subtitle: scene.props.subtitle } : {})}
            screenshotUrl={screenshotUrl ?? ''}
            url={url}
            theme={theme}
          />
        );
      }
      return (
        <DeviceMockup
          headline={scene.props.headline}
          {...(scene.props.subtitle ? { subtitle: scene.props.subtitle } : {})}
          screenshotUrl={screenshotUrl}
          device={scene.props.device}
          motion={scene.props.motion}
          durationInFrames={scene.durationInFrames}
          theme={theme}
        />
      );
    }
    case 'HeroStylized':
    case 'UseCaseStory':
    case 'StatsBand': {
      // Deferred scene type: substitute a TextPunch placeholder rather than
      // crashing the render. The storyboard validator should have filtered these
      // out already; this is a last-resort defence.
      const label = scene.type;
      return <TextPunch text={`${label} coming soon`} emphasis="secondary" theme={theme} />;
    }
  }
}
