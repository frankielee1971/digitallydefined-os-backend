// middleware.js
export const config = {
  matcher: '/api/:path*',
};

export function middleware(request) {
  const origin = request.headers.get('origin');
  const allowedOrigins = [
    'https://dashboard.digitallydefined.online',
    'https://digitallydefined.online',
    'http://localhost:5173' // For local dev
  ];

  const response = NextResponse.next();

  // If origin is allowed, echo it back
  if (origin && allowedOrigins.includes(origin)) {
    response.headers.set('Access-Control-Allow-Origin', origin);
    response.headers.set('Vary', 'Origin');
  } else {
    // Fallback to first allowed origin
    response.headers.set('Access-Control-Allow-Origin', allowedOrigins[0]);
  }

  response.headers.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  response.headers.set('Access-Control-Allow-Headers', 'Content-Type, x-api-key, Authorization');
  response.headers.set('Access-Control-Allow-Credentials', 'true');

  return response;
}