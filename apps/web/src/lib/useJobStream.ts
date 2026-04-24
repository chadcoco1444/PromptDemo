import { useEffect, useReducer } from 'react';
import type { JobStatus } from './types';

export interface JobStreamState {
  status: JobStatus | 'connecting';
  stage: 'crawl' | 'storyboard' | 'render' | null;
  progress: number;
  queuedPosition: number | null;
  videoUrl: string | null;
  error: { code: string; message: string; retryable: boolean } | null;
}

type Action =
  | { type: 'snapshot'; data: { status: JobStatus; stage: JobStreamState['stage']; progress: number } }
  | { type: 'progress'; data: { stage: JobStreamState['stage']; pct: number } }
  | { type: 'queued'; data: { position: number } }
  | { type: 'done'; data: { videoUrl: string } }
  | { type: 'error'; data: { code: string; message: string; retryable: boolean } };

const initial: JobStreamState = {
  status: 'connecting',
  stage: null,
  progress: 0,
  queuedPosition: null,
  videoUrl: null,
  error: null,
};

function reducer(s: JobStreamState, a: Action): JobStreamState {
  switch (a.type) {
    case 'snapshot':
      return { ...s, status: a.data.status, stage: a.data.stage, progress: a.data.progress };
    case 'progress':
      return { ...s, stage: a.data.stage, progress: a.data.pct };
    case 'queued':
      return { ...s, status: 'waiting_render_slot', queuedPosition: a.data.position };
    case 'done':
      return { ...s, status: 'done', progress: 100, videoUrl: a.data.videoUrl };
    case 'error':
      return { ...s, status: 'failed', error: a.data };
  }
}

export function useJobStream(url: string): JobStreamState {
  const [state, dispatch] = useReducer(reducer, initial);
  useEffect(() => {
    const es = new EventSource(url);
    const onSnap = (e: MessageEvent) => dispatch({ type: 'snapshot', data: JSON.parse(e.data) });
    const onProg = (e: MessageEvent) => dispatch({ type: 'progress', data: JSON.parse(e.data) });
    const onQueued = (e: MessageEvent) => dispatch({ type: 'queued', data: JSON.parse(e.data) });
    const onDone = (e: MessageEvent) => dispatch({ type: 'done', data: JSON.parse(e.data) });
    const onErr = (e: MessageEvent) => dispatch({ type: 'error', data: JSON.parse(e.data) });
    es.addEventListener('snapshot', onSnap);
    es.addEventListener('progress', onProg);
    es.addEventListener('queued', onQueued);
    es.addEventListener('done', onDone);
    es.addEventListener('error', onErr);
    return () => es.close();
  }, [url]);
  return state;
}
