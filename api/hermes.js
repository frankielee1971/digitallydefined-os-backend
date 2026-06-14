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
    : process.env.ALLOWED_ORIGIN || 'https://dashboard.digitallydefined.online';

  res.setHeader('Access-Control-Allow-Origin', allowedOrigin);
  res.setHeader('Access-Control-Allow-Methods', 'OPTIONS, POST');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-api-key');
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Max-Age', '86400');
  res.setHeader('Vary', 'Origin');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const provided = String(req.headers['x-api-key'] || req.headers['authorization'] || '').trim();
  const expected = String(process.env.DASHBOARD_API_KEY || '').trim();

  if (!expected || provided !== expected) {
    return res.status(401).json({ error: 'Unauthorized - API key required' });
  }

  try {
    const body = typeof req.json === 'function' ? await req.json() : req.body;
    const { message, context = {}, conversation = [] } = body || {};

    if (!message || typeof message !== 'string') {
      return res.status(400).json({ error: 'Missing or invalid message field' });
    }

    const gatewayKey = process.env.VERCEL_AI_GATEWAY_API_KEY;
    if (!gatewayKey) {
      return res.status(500).json({
        success: false,
        reply: 'Hermes bridge is offline: missing VERCEL_AI_GATEWAY_API_KEY.'
      });
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20000);

    const response = await fetch('https://ai-gateway.vercel.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${gatewayKey}`
      },
      body: JSON.stringify({
        model: process.env.HERMES_MODEL || 'openai/gpt-4o-mini',
        stream: false,
        messages: [
          {
            role: 'system',
            content: `You are the DigitallyDefined dashboard assistant.Operational context: ${JSON.stringify(context)}`
          },
          ...(Array.isArray(conversation) ? conversation : []),
          { role: 'user', content: message }
        ]
      }),
      signal: controller.signal
    });

    clearTimeout(timeout);

    if (!response.ok) {
      const text = await response.text();
      return res.status(response.status).json({
        success: false,
        reply: 'AI Gateway error.',
        detail: text.slice(0, 400)
      });
    }

    const data = await response.json();
    const reply = data?.choices?.[0]?.message?.content || '';

    return res.status(200).json({
      success: true,
      reply: reply || 'Gateway returned an empty response.'
    });
  } catch (error) {
    console.error('[Hermes Bridge] Error:', error);
    return res.status(500).json({
      success: false,
      reply: 'Dashboard error. Try again.',
      detail: error?.message || 'Unknown error'
    });
  }
}
