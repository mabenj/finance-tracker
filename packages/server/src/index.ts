import { fetchRequestHandler } from '@trpc/server/adapters/fetch';
import { appRouter } from './routers/index';
import { db } from './db/client';
import { join, resolve, sep } from 'path';

const PORT = Number(process.env.PORT ?? 3001);

// In production the Vite-built frontend is served from the same origin as the API,
// so CORS is only needed during development (Vite dev server on 5173).
const ALLOWED_ORIGINS = new Set(['http://localhost:5173', 'http://localhost:3001']);

// Resolve the frontend dist directory relative to this source file.
// Bun runs TypeScript directly, so import.meta.dir is packages/server/src.
// The Vite client build outputs to packages/client/dist.
const DIST_DIR = resolve(join(import.meta.dir, '..', '..', '..', 'client', 'dist'));

function corsHeaders(origin: string | null): HeadersInit {
  if (origin && ALLOWED_ORIGINS.has(origin)) {
    return {
      'Access-Control-Allow-Origin': origin,
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Vary': 'Origin',
    };
  }
  return {};
}

async function serveStatic(pathname: string): Promise<Response | null> {
  // Resolve the requested path and verify it stays within DIST_DIR to
  // prevent directory traversal (e.g. GET /../../../../etc/passwd).
  const requested = resolve(join(DIST_DIR, pathname));
  const isContained = requested === DIST_DIR || requested.startsWith(DIST_DIR + sep);

  if (isContained) {
    for (const filePath of [requested, join(requested, 'index.html')]) {
      const file = Bun.file(filePath);
      if (await file.exists()) return new Response(file);
    }
  }

  // SPA fallback — always safe, handles client-side routes
  const fallback = Bun.file(join(DIST_DIR, 'index.html'));
  if (await fallback.exists()) return new Response(fallback);

  return null;
}

Bun.serve({
  port: PORT,
  maxRequestBodySize: 1 * 1024 * 1024, // 1 MB
  async fetch(req) {
    const origin = req.headers.get('origin');

    // Handle CORS preflight
    if (req.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders(origin) });
    }

    const url = new URL(req.url);

    if (url.pathname.startsWith('/trpc')) {
      const response = await fetchRequestHandler({
        endpoint: '/trpc',
        req,
        router: appRouter,
        createContext: () => ({ db }),
      });
      const cors = corsHeaders(origin);
      for (const [key, value] of Object.entries(cors)) {
        response.headers.set(key, value);
      }
      return response;
    }

    // Serve static frontend build (production)
    const staticResponse = await serveStatic(url.pathname);
    if (staticResponse) return staticResponse;

    return new Response('Not Found', { status: 404 });
  },
});

console.log(`Server running on http://localhost:${PORT}`);
console.log(`Static files: ${DIST_DIR}`);
