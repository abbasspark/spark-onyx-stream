// SPDX-License-Identifier: AGPL-3.0-only
//
// Serves the development player page on http://localhost:5173.
// Start it with: pnpm dev:player
//
// The port matters: the API only answers browsers whose origin is listed in
// CORS_ORIGINS, and http://localhost:5173 is the value in .env.example.
import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import path from 'node:path';

const PORT = Number(process.env.DEV_PLAYER_PORT ?? 5173);
const PAGE = path.join(import.meta.dirname, 'index.html');

const server = createServer(async (request, response) => {
  if (request.method !== 'GET' || (request.url !== '/' && request.url !== '/index.html')) {
    response.writeHead(404, { 'Content-Type': 'text/plain' }).end('Not found');
    return;
  }

  try {
    const page = await readFile(PAGE);
    response
      .writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' })
      .end(page);
  } catch (error) {
    response.writeHead(500, { 'Content-Type': 'text/plain' }).end(String(error));
  }
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`Development player: http://localhost:${PORT}`);
});
