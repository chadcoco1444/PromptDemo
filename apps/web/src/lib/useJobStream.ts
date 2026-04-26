import { useEffect, useReducer } from 'react';
import type { JobStatus } from './types';

export interface IntelFrame {
  stage: 'crawl' | 'storyboard' | 'render';
  message: string;
  ts: number;
}

export interface JobStreamState {
  status: JobStatus | 'connecting';
  stage: 'crawl' | 'storyboard' | 'render' | null;
  progress: number;
  queuedPosition: number | null;
  videoUrl: string | null;
  error: { code: string; message: string; retryable: boolean } | null;
  intel: IntelFrame | null;
}

type Action =
  | { type: 'snapshot'; data: { status: JobStatus; stage: JobStreamState['stage']; progress: number } }
  | { type: 'progress'; data: { stage: JobStreamState['stage']; pct: number } }
  | { type: 'queued'; data: { position: number } }
  | { type: 'done'; data: { videoUrl: string } }
  | { type: 'error'; data: { code: string; message: string; retryable: boolean } }
  | { type: 'intel'; data: IntelFrame };

const initial: JobStreamState = {
  status: 'connecting',
  stage: null,
  progress: 0,
  queuedPosition: null,
  videoUrl: null,
  error: null,
  intel: null,
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
    case 'intel':
      // Drop stale frames (ts regression) — common when SSE reconnects and
      // replays buffered events out of order.
      if (s.intel && a.data.ts < s.intel.ts) return s;
      return { ...s, intel: a.data };
  }
}

// Parse e.data only if it's a non-empty string. EventSource's native 'error' event
// (fires on connection loss, CORS block, etc.) has no data — guard against
// JSON.parse(undefined).
function parseEventData(e: MessageEvent): unknown {
  if (typeof e.data !== 'string' || e.data.length === 0) return null;
  try {
    return JSON.parse(e.data);
  } catch {
    return null;
  }
}

export function useJobStream(url: string): JobStreamState {
  const [state, dispatch] = useReducer(reducer, initial);
  useEffect(() => {
    const es = new EventSource(url);
    const onSnap = (e: MessageEvent) => {
      const data = parseEventData(e);
      if (data) dispatch({ type: 'snapshot', data: data as { status: JobStatus; stage: JobStreamState['stage']; progress: number } });
    };
    const onProg = (e: MessageEvent) => {
      const data = parseEventData(e);
      if (data) dispatch({ type: 'progress', data: data as { stage: JobStreamState['stage']; pct: number } });
    };
    const onQueued = (e: MessageEvent) => {
      const data = parseEventData(e);
      if (data) dispatch({ type: 'queued', data: data as { position: number } });
    };
    const onDone = (e: MessageEvent) => {
      const data = parseEventData(e);
      if (data) dispatch({ type: 'done', data: data as { videoUrl: string } });
    };
    const onErr = (e: MessageEvent) => {
      const data = parseEventData(e);
      if (data) {
        dispatch({ type: 'error', data: data as { code: string; message: string; retryable: boolean } });
      } else if (es.readyState === EventSource.CLOSED) {
        // Permanent failure (non-2xx response, CORS block, etc.) — EventSource will not retry.
        dispatch({
          type: 'error',
          data: { code: 'STREAM_ERROR', message: 'connection to server failed', retryable: true },
        });
      }
      // readyState CONNECTING: EventSource is auto-reconnecting after a transient drop.
      // Stay silent — the next successful snapshot will clear any stale state.
    };
    const onIntel = (e: MessageEvent) => {
      const data = parseEventData(e);
      if (data && typeof data === 'object' && 'stage' in data && 'message' in data && 'ts' in data) {
        dispatch({ type: 'intel', data: data as IntelFrame });
      }
    };
    es.addEventListener('snapshot', onSnap);
    es.addEventListener('progress', onProg);
    es.addEventListener('queued', onQueued);
    es.addEventListener('done', onDone);
    es.addEventListener('error', onErr);
    es.addEventListener('intel', onIntel);
    return () => es.close();
  }, [url]);
  return state;
}
