import type { FastifyPluginAsync } from 'fastify';
import type { JobStore } from '../jobStore.js';
import type { Broker } from '../sse/broker.js';

export interface StreamRouteOpts {
  store: JobStore;
  broker: Broker;
  requireUserIdHeader?: boolean;
  allowedOrigins?: string[];
}

export const streamRoute: FastifyPluginAsync<StreamRouteOpts> = async (app, opts) => {
  app.get<{ Params: { id: string } }>('/api/jobs/:id/stream', async (req, reply) => {
    const job = await opts.store.get(req.params.id);
    if (!job) return reply.code(404).send({ error: 'not found' });

    if (opts.requireUserIdHeader && job.userId) {
      const rawId = req.headers['x-user-id'];
      const requestUserId = Array.isArray(rawId) ? rawId[0] : rawId;
      if (job.userId !== requestUserId) {
        return reply.code(403).send({ error: 'forbidden' });
      }
    }

    // The raw response bypasses Fastify's CORS plugin; set the headers ourselves.
    // Echo the request's Origin so the browser's EventSource accepts the stream.
    // (EventSource doesn't send credentials by default, so we don't need Allow-Credentials.)
    const origin = (req.headers.origin as string | undefined) ?? '*';
    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
      'Access-Control-Allow-Origin': origin,
      Vary: 'Origin',
    });

    const write = (chunk: string) => {
      reply.raw.write(chunk);
    };

    write(`event: snapshot\ndata: ${JSON.stringify(job)}\n\n`);

    const dispose = opts.broker.subscribe(req.params.id, write);

    const heartbeat = setInterval(() => {
      reply.raw.write(': keepalive\n\n');
    }, 25_000);

    req.raw.on('close', () => {
      clearInterval(heartbeat);
      dispose();
      reply.raw.end();
    });

    // Tell Fastify we're handling the response manually
    return reply;
  });
};
