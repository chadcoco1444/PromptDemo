import type { Job } from '../model/job.js';
import type { S3Uri } from '@promptdemo/schema';

export type OrchestratorEvent =
  | { kind: 'crawl:active'; progress?: number }
  | { kind: 'crawl:completed'; crawlResultUri: S3Uri }
  | { kind: 'crawl:failed'; error: { code: string; message: string; retryable: boolean } }
  | { kind: 'storyboard:active'; progress?: number }
  | { kind: 'storyboard:completed'; storyboardUri: S3Uri; canRender: boolean }
  | { kind: 'storyboard:failed'; error: { code: string; message: string; retryable: boolean } }
  | { kind: 'render:active'; progress?: number }
  | { kind: 'render:completed'; videoUrl: S3Uri }
  | { kind: 'render:failed'; error: { code: string; message: string; retryable: boolean } };

export function reduceEvent(_job: Job, ev: OrchestratorEvent): Partial<Job> {
  switch (ev.kind) {
    case 'crawl:active':
      return { status: 'crawling', stage: 'crawl', progress: ev.progress ?? 0 };
    case 'crawl:completed':
      return {
        status: 'generating',
        stage: 'storyboard',
        progress: 0,
        crawlResultUri: ev.crawlResultUri,
      };
    case 'crawl:failed':
      return { status: 'failed', error: ev.error };
    case 'storyboard:active':
      return { status: 'generating', stage: 'storyboard', progress: ev.progress ?? 0 };
    case 'storyboard:completed':
      return {
        status: ev.canRender ? 'rendering' : 'waiting_render_slot',
        stage: 'render',
        progress: 0,
        storyboardUri: ev.storyboardUri,
      };
    case 'storyboard:failed':
      return { status: 'failed', error: ev.error };
    case 'render:active':
      return { status: 'rendering', stage: 'render', progress: ev.progress ?? 0 };
    case 'render:completed':
      return { status: 'done', progress: 100, videoUrl: ev.videoUrl };
    case 'render:failed':
      return { status: 'failed', error: ev.error };
  }
}
