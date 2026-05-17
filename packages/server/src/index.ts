import { fetchRequestHandler } from '@trpc/server/adapters/fetch';
import { appRouter } from './routers/index';
import { db } from './db/client';

const PORT = Number(process.env.PORT ?? 3001);

// Origins allowed to call the API directly (only relevant during development
// when the Vite dev server on 5173 is a different origin than this server).
// In production both API and frontend are served from the same origin.
const ALLOWED_ORIGINS = new Set(['http://localhost:5173', 'http://localhost:3001']);

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
      // Attach CORS headers to the tRPC response
      const cors = corsHeaders(origin);
      for (const [key, value] of Object.entries(cors)) {
        response.headers.set(key, value);
      }
      return response;
    }

    return new Response('Not Found', { status: 404 });
  },
});

console.log(`Server running on http://localhost:${PORT}`);
