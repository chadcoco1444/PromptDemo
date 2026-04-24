import type { FastifyPluginAsync } from 'fastify';
import type { JobStore } from '../jobStore.js';
import type { Broker } from '../sse/broker.js';

export interface StreamRouteOpts {
  store: JobStore;
  broker: Broker;
}

export const streamRoute: FastifyPluginAsync<StreamRouteOpts> = async (app, opts) => {
  app.get<{ Params: { id: string } }>('/api/jobs/:id/stream', async (req, reply) => {
    const job = await opts.store.get(req.params.id);
    if (!job) return reply.code(404).send({ error: 'not found' });

    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });

    const write = (chunk: string) => {
      reply.raw.write(chunk);
    };

    write(`event: snapshot\ndata: ${JSON.stringify(job)}\n\n`);

    const dispose = opts.broker.subscribe(req.params.id, write);

    req.raw.on('close', () => {
      dispose();
      reply.raw.end();
    });

    // Tell Fastify we're handling the response manually
    return reply;
  });
};
