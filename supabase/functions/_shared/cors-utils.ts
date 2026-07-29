// _shared/cors-utils.ts
// Shared CORS utilities for all Supabase Edge Functions

export function corsHeaders(origin: string): Record<string, string> {
  const allowedOrigins = [
    "https://dashboard.digitallydefined.online",
    "https://digitallydefined.online",
    "http://localhost:3000",
    "http://localhost:5173",
  ];
  const allowed = allowedOrigins.includes(origin) ? origin : "https://digitallydefined.online";

  return {
    "Access-Control-Allow-Origin": allowed,
    "Access-Control-Allow-Methods": "OPTIONS, POST, GET, PUT, DELETE",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, x-api-key",
    "Access-Control-Allow-Credentials": "true",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin",
  };
}

export function applyCors(req: Request): Record<string, string> {
  return corsHeaders(req.headers.get("origin") || "");
}
