/**
 * Hermes Backend Handler
 * Hybrid provider chain:
 * 1. Vercel AI Gateway
 * 2. OpenRouter
 * 3. Groq
 * Returns plain text + metadata for the dashboard.
 */

export default async function handler(req, res) {
  // === CORS Configuration ===
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
  res.setHeader('Access-Control-Allow-Methods', 'OPTIONS, POST, GET');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-api-key');
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Max-Age', '86400');
  res.setHeader('Vary', 'Origin');

  // === Preflight ===
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // === Health Check ===
  if (req.method === 'GET') {
    return res.status(200).json({
      ok: true,
      status: 'Hermes backend is running',
      timestamp: Date.now(),
    });
  }

  // === Method Validation ===
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed - use POST', reply: '' });
  }

  // === API Key Validation ===
  const providedKey = String(req.headers['x-api-key'] || req.headers['authorization'] || '').trim();
  const expectedKey = String(process.env.DASHBOARD_API_KEY || process.env.VITE_DASHBOARD_API_KEY || '').trim();

  if (!expectedKey || providedKey !== expectedKey) {
    return res.status(401).json({ error: 'Unauthorized - Invalid or missing API key', reply: '' });
  }

  try {
    // === Body Parsing ===
    let body = {};

    const contentType = String(req.headers['content-type'] || '').toLowerCase();

    if (typeof req.body === 'string') {
      try {
        body = JSON.parse(req.body);
      } catch (parseError) {
        return res.status(400).json({
          error: 'Invalid JSON body: ' + (parseError instanceof Error ? parseError.message : String(parseError)),
          reply: '',
        });
      }
    } else if (req.body && typeof req.body === 'object') {
      body = req.body;
    } else if (!req.body && (contentType.includes('application/json') || contentType.includes('text/json'))) {
      return res.status(400).json({
        error: 'Missing request body. Expected JSON with message, messages, or conversation field.',
        reply: '',
      });
    }

    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return res.status(400).json({
        error: 'Request body must be a JSON object',
        reply: '',
      });
    }
    if (body.action === 'dashboard') {
      return res.status(200).json({
        ok: true,
        source: 'hermes-backend',
        message: 'Dashboard data loaded successfully',
        timestamp: Date.now(),
        reply: 'Hermes dashboard action acknowledged',
        provider: null,
        model: null,
        conversationUpdates: [],
        dashboardSnapshotUpdate: body.context || null,
      });
    }

    // === Extract message ===
    const context = body.context || {};
    const conversation = Array.isArray(body.conversation)
      ? body.conversation
      : Array.isArray(body.messages)
      ? body.messages
      : [];

    let message = '';

    if (typeof body.message === 'string' && body.message.trim()) {
      message = body.message.trim();
    } else if (typeof body.content === 'string' && body.content.trim()) {
      message = body.content.trim();
    } else if (typeof body.text === 'string' && body.text.trim()) {
      message = body.text.trim();
    } else if (Array.isArray(body.messages) && body.messages.length) {
      const userMsg =
        body.messages.find((m) => (m.role === 'user' || m.role === undefined) && m.content) ||
        body.messages[0];
      message = (userMsg?.content || userMsg?.text || '').trim();
    } else if (Array.isArray(conversation) && conversation.length) {
      const userConv =
        conversation.find((c) => (c.role === 'user' || c.role === undefined) && (c.content || c.text)) ||
        conversation[0];
      message = (userConv?.content || userConv?.text || '').trim();
    }

    if (!message || typeof message !== 'string') {
      return res.status(400).json({ error: 'Missing or invalid message field', reply: '' });
    }

    // === Build messages array ===
    const messages = [
      { role: 'system', content: 'You are Hermes, the orchestrator of DigitallyDefined OS.' },
      { role: 'user', content: message },
    ];

    // === Markdown Stripper ===
    const stripMarkdown = (text) => {
      if (!text) return '';
      return text
        .replace(/```[\s\S]*?```/g, '')
        .replace(/`[^`]+`/g, '')
        .replace(/\*\*([^*]+)\*\*/g, '$1')
        .replace(/\*([^*]+)\*/g, '$1')
        .replace(/_([^_]+)_/g, '$1')
        .replace(/^>\s*/gm, '')
        .replace(/^\s*[-*+]\s+/gm, '')
        .replace(/^\s*\d+\.\s+/gm, '')
        .replace(/[\n\r]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
    };

    let reply = null;
    let provider = null;
    let model = null;
    let lastError = null;

    // === Hermes Provider (Vercel AI Gateway Only) ===
    try {
      const vercelKey = process.env.VERCEL_AI_API_KEY;
      const vercelModel = (process.env.HERMES_MODEL || '').trim();

      if (!vercelKey || !vercelModel) {
        throw new Error(
          `Hermes provider not configured. Missing env: VERCEL_AI_API_KEY=${Boolean(vercelKey)} HERMES_MODEL=${String(vercelModel)}`,
        );
      }

      const resVercel = await fetch('https://api.vercel.ai/v1/chat/completions', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${vercelKey.trim()}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: vercelModel,
          messages,
        }),
      });

      const data = await resVercel.json();
      if (!resVercel.ok) {
        throw new Error(data?.error?.message || `Vercel AI Gateway error: ${resVercel.status}`);
      }

      const raw = data?.choices?.[0]?.message?.content || '';
      reply = stripMarkdown(raw);
      provider = 'vercel';
      model = vercelModel;
    } catch (e) {
      lastError = e.message || 'Vercel AI Gateway failed';
    }

    if (!reply) {
      reply = lastError
        ? `Hermes provider failed: ${lastError}`
        : 'Hermes could not reach any AI provider. Check backend env keys for Vercel, OpenRouter, or Groq.';
    }

    return res.status(200).json({
      reply,
      provider,
      model,
      error: lastError || null,
      conversationUpdates: [],
      dashboardSnapshotUpdate: context || null,
    });
  } catch (err) {
    return res.status(500).json({
      error: `Internal server error: ${err?.message || 'Unknown error'}`,
      reply: '',
      provider: null,
      model: null,
      conversationUpdates: [],
      dashboardSnapshotUpdate: null,
    });
  }
}
