import type { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Placeholder: later you can verify a JWT, API key, or Firebase ID token
  const apiKey = req.headers['x-api-key'];

  if (!apiKey || apiKey !== process.env.DASHBOARD_API_KEY) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  return res.status(200).json({ ok: true });
}
