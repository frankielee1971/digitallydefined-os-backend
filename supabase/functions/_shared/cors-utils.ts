// Shared CORS utilities for Supabase Edge Functions
export function corsHeaders(origin: string) {
  return {
    'Access-Control-Allow-Origin': origin || '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS, PUT, DELETE',
    'Access-Control-Allow-Headers': 'Content-Type, apikey, Authorization, x-api-key',
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
