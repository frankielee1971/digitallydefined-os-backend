/**
 * Digital Superpower Quiz API Handler
 * Migrated from the legacy /api route layer to the non-Vercel src/handlers area.
 */
import { digitalSuperpowerAgent } from '../../agents/digitalSuperpowerAgent.js';

const ALLOWED_ORIGINS = new Set([
  'https://digitallydefined.online',
  'https://dashboard.digitallydefined.online',
  'http://localhost:3000',
  'http://localhost:5173',
]);

export default async function quizHandler(req, res) {
  const origin = req.headers && req.headers.origin;
  const corsOrigin = origin && ALLOWED_ORIGINS.has(origin) ? origin : '*';
  res.setHeader('Access-Control-Allow-Origin', corsOrigin);
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-api-key, Authorization');
  res.setHeader('Vary', 'Origin');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  let body = req.body;
  if (typeof body === 'string') {
    try {
      body = JSON.parse(body);
    } catch {
      return res.status(400).json({ success: false, error: 'Invalid JSON' });
    }
  }
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return res.status(400).json({ success: false, error: 'Body must be a JSON object' });
  }

  const answers = body.answers || body;
  const answeredKeys = Object.keys(answers).filter((k) => k.startsWith('q') && answers[k]);

  if (answeredKeys.length === 0) {
    return res.status(400).json({
      success: false,
      error: 'Missing quiz answers. Expected { q1: "builder", q2: "creator", ... }',
    });
  }

  try {
    const data = await digitalSuperpowerAgent(answers);
    if (body.name) data.name = body.name;
    if (body.email) data.email = body.email;

    return res.status(200).json({
      success: true,
      agent: 'digital-superpower-quiz',
      data,
    });
  } catch (err) {
    console.error('[quiz] Agent error:', err);
    return res.status(500).json({
      success: false,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}
