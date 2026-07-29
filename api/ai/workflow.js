import { run } from '../../lib/aiRouter.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed. Use POST.' });
  }

  try {
    const payload = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
    const result = await run('paidClaude', payload);
    return res.status(200).json(result);
  } catch (error) {
    return res.status(500).json({ error: error.message || 'AI workflow route failed' });
  }
}
