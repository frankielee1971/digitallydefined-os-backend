// Shared CORS utilities for Supabase Edge Functions
// NOTE: Keep the allowlist in sync with api/index.js and hermes/index.ts.
const ALLOWED_ORIGINS = [
  "https://dashboard.digitallydefined.online",
  "https://digitallydefined.online",
  "https://www.digitallydefined.online",
  "http://localhost:3000",
  "http://localhost:3001",
  "http://localhost:5173",
];

export function corsHeaders(origin: string) {
  const allowed = origin && ALLOWED_ORIGINS.includes(origin)
    ? origin
    : "https://dashboard.digitallydefined.online";
  return {
    'Access-Control-Allow-Origin': allowed,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS, PUT, DELETE',
    'Access-Control-Allow-Headers': 'Content-Type, apikey, Authorization, x-api-key',
    'Vary': 'Origin',
    'Access-Control-Max-Age': '86400',
  };
}

export function createCorsResponse(status: number, body: any, origin: string = '') {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      ...corsHeaders(origin),
    },
  });
}

export function handleCors(req: Request): Response | null {
  if (req.method === 'OPTIONS') {
    return new Response('ok', {
      status: 200,
      headers: corsHeaders(req.headers.get('origin') || ''),
    });
  }
  return null;
}
