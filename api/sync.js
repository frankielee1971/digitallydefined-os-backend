export default async function handler(req, res) {
  const allowedOrigins = [
    'https://dashboard.digitallydefined.online',
    'https://digitallydefined.online',
    'http://localhost:3000',
    'http://localhost:5173',
  ];

  const origin = req.headers.origin;
  const allowedOrigin = origin && allowedOrigins.includes(origin)
    ? origin
    : 'https://dashboard.digitallydefined.online';

  res.setHeader('Access-Control-Allow-Origin', allowedOrigin);
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-api-key, Authorization');
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Max-Age', '86400');
  res.setHeader('Vary', 'Origin');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method === 'POST') {
    const providedKey = String(req.headers['x-api-key'] || req.headers['authorization'] || '').trim();
    const expectedKey = String(process.env.DASHBOARD_API_KEY || process.env.VITE_DASHBOARD_API_KEY || '').trim();

    if (!expectedKey || providedKey !== expectedKey) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    return res.status(200).json({
      status: 'success',
      message: 'Vault synced successfully',
      timestamp: Date.now(),
      data: {
        leads: 12,
        revenue: 48000,
        conversion: 0.18,
      },
    });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
