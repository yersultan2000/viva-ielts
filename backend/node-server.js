/**
 * Runs the same handler as the Cloudflare Worker on plain Node 20+,
 * for local development or any Node host (Render, Railway, Fly.io, a VPS).
 *
 *   LLM_API_KEY=... ALLOWED_ORIGINS=http://localhost:5173 node backend/node-server.js
 */
import { createServer } from 'node:http';
import { handle } from './worker.js';

const port = Number(process.env.PORT) || 8787;

createServer(async (req, res) => {
  try {
    const chunks = [];
    for await (const c of req) chunks.push(c);
    const request = new Request(`http://${req.headers.host}${req.url}`, {
      method: req.method,
      headers: req.headers,
      body: ['GET', 'HEAD', 'OPTIONS'].includes(req.method) ? undefined : Buffer.concat(chunks),
    });
    const response = await handle(request, process.env);
    res.writeHead(response.status, Object.fromEntries(response.headers));
    res.end(Buffer.from(await response.arrayBuffer()));
  } catch (e) {
    console.error(e);
    res.writeHead(500, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ error: 'Server error.' }));
  }
}).listen(port, () => console.log(`Viva backend listening on http://localhost:${port}`));
