import { createServer } from 'node:http';

export function startHealthServer(port: number = Number(process.env.PORT) || 8080): void {
  const server = createServer((req, res) => {
    if (req.url === '/healthz') {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ ok: true }));
    } else {
      res.writeHead(404);
      res.end();
    }
  });
  server.listen(port, '0.0.0.0', () => {
    console.log(`[health] listening on :${port}`);
  });
}
