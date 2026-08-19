// middleware.js
// Vercel Edge Middleware for CORS handling - now disabled since we handle CORS in the API handler
// This file is kept for reference but can be removed if not needed

export const config = {
  matcher: '/api/:path*',
};

export function middleware(request) {
  // CORS is now handled in the API handler itself
  // This middleware can be used for additional edge processing if needed
  return NextResponse.next();
}