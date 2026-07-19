/**
 * Hermes Backend Handler
 * Hybrid provider chain with safe JSON fallbacks.
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

    // === Agent Resolution ===
    let systemPrompt = 'You are Hermes, the orchestrator of DigitallyDefined OS.';
    let agentReply = null;

    // Try to get agent from registry if agentKey is provided
    if (body.agentKey) {
      try {
        const { getAgent } = await import('../agents/index.js');
        const agent = getAgent(body.agentKey);

        if (agent && typeof agent.run === 'function') {
          const llm = {
            chat: async (messages) => {
              const prompt = Array.isArray(messages)
                ? messages.map((msg) => `${msg.role}: ${msg.content}`).join('\n\n')
                : String(messages);

              const { omniRoute } = await import('../lib/omniroute.js');
              const result = await omniRoute(prompt, {
                systemPrompt: (Array.isArray(messages) && messages.find((msg) => msg.role === 'system')?.content) || systemPrompt,
                jsonMode: false,
                timeout: 60000,
                fallbackModels: [
                  process.env.OMNIROUTE_FALLBACK_MODEL_1,
                  process.env.OMNIROUTE_FALLBACK_MODEL_2,
                ].filter(Boolean),
              });

              if (result?.error) {
                throw new Error(result.error);
              }

              return {
                content: result?.reply || '',
                raw: result,
              };
            },
          };

          const response = await agent.run({ input: message, llm });
          agentReply = typeof response === 'string'
            ? response
            : response?.content || response?.reply || '';
        } else if (agent && agent.systemPrompt) {
          systemPrompt = agent.systemPrompt;
        }
      } catch (e) {
        console.warn(`[Hermes] Agent registry not available: ${e.message}`);
      }
    }

    // Allow direct systemPrompt override
    if (body.systemPrompt) {
      systemPrompt = body.systemPrompt;
    }

    const messages = [
      { role: 'system', content: systemPrompt },
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

    // === AI Call via OmniRoute ===
    let reply = null;
    let provider = 'omniroute';
    let model = null;
    let lastError = null;

    if (agentReply) {
      reply = stripMarkdown(agentReply);
      provider = 'agent';
    } else {
      try {
        const { omniRoute } = await import('../lib/omniroute.js');
        const result = await omniRoute(message, {
          systemPrompt,
          jsonMode: false,
          timeout: 60000,
          fallbackModels: [
            process.env.OMNIROUTE_FALLBACK_MODEL_1,
            process.env.OMNIROUTE_FALLBACK_MODEL_2,
          ].filter(Boolean),
        });

        if (result.error) {
          lastError = result.error;
        } else {
          reply = stripMarkdown(result.reply);
          model = result.model;
        }
      } catch (e) {
        lastError = e.message || 'OmniRoute call failed';
      }
    }

    if (!reply) {
      reply = lastError
        ? `Hermes AI request failed: ${lastError}`
        : 'Hermes could not generate a response. Check OMNIROUTE_API_KEY configuration.';
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
