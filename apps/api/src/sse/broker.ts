export interface BrokerEvent {
  event: string;
  data: unknown;
}

export type SseWriter = (chunk: string) => void;

export interface Broker {
  subscribe(jobId: string, writer: SseWriter): () => void;
  publish(jobId: string, ev: BrokerEvent): void;
  hasSubscribers(jobId: string): boolean;
}

export function makeBroker(): Broker {
  const subs = new Map<string, Set<SseWriter>>();
  return {
    subscribe(jobId, writer) {
      let set = subs.get(jobId);
      if (!set) {
        set = new Set();
        subs.set(jobId, set);
      }
      set.add(writer);
      return () => {
        const s = subs.get(jobId);
        if (!s) return;
        s.delete(writer);
        if (s.size === 0) subs.delete(jobId);
      };
    },
    publish(jobId, ev) {
      const set = subs.get(jobId);
      if (!set) return;
      const chunk = `event: ${ev.event}\ndata: ${JSON.stringify(ev.data)}\n\n`;
      for (const w of set) w(chunk);
    },
    hasSubscribers(jobId) {
      return (subs.get(jobId)?.size ?? 0) > 0;
    },
  };
}
