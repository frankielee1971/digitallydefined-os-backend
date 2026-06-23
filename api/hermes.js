/**
 * Hermes Backend Handler
 * AI Assistant endpoint with fallback chain:
 * 1. Vercel AI Gateway
 * 2. OpenRouter (primary recommended)
 * 3. Groq (optional fallback)
 * Returns plain text responses only (no markdown)
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

  // === Health Check (Fixes dashboard + Sync Vault GET errors) ===
  if (req.method === 'GET') {
    return res.status(200).json({
      ok: true,
      status: 'Hermes backend is running',
      timestamp: Date.now()
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
    // === Parse Request Body Safely ===
    let body;
    try {
      body = typeof req.json === 'function' ? await req.json() : req.body;
    } catch (parseError) {
      return res.status(400).json({
        error: 'Invalid JSON in request body',
        detail: parseError?.message || 'Malformed JSON',
        reply: ''
      });
    }

    if (!body || typeof body !== 'object') {
      return res.status(400).json({ error: 'Request body must be a JSON object', reply: '' });
    }

    // === Extract message from multiple possible shapes ===
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
      const userMsg = body.messages.find(m => (m.role === 'user' || m.role === undefined) && m.content) || body.messages[0];
      message = (userMsg?.content || userMsg?.text || '').trim();
    } else if (Array.isArray(conversation) && conversation.length) {
      const userConv = conversation.find(c => (c.role === 'user' || c.role === undefined) && (c.content || c.text)) || conversation[0];
      message = (userConv?.content || userConv?.text || '').trim();
    }

    if (!message || typeof message !== 'string') {
      return res.status(400).json({ error: 'Missing or invalid message field', reply: '' });
    }

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

    const hermesSystemPrompt = "You are Hermes, the DigitallyDefined business partner. RESPOND USING PLAIN TEXT ONLY. NO MARKDOWN. NO FORMATTING. NO BOLD. NO ITALICS. NO LISTS. NO BULLETS. NO NUMBERED LISTS. NO CODE BLOCKS. NO SYMBOLS. NO SPECIAL CHARACTERS. Use simple sentences with normal punctuation only. You help me grow the digital assets I already have. You evaluate my assets based on leverage, traffic potential, monetization potential, speed of execution, and long term compounding value. You help me choose which assets to build first so I can show Gen X women real proof. You understand that digital assets include websites, rank and rent sites, niche content sites, email lists, digital products, templates, content hubs, and automation systems. You help me decide which ones have the highest return with the least friction. You always think in terms of working smarter, not harder. You focus on leverage, automation, and compounding results. You help me build assets that grow over time and become examples for Gen X women who need to see what is possible. You understand that Gen X women trust results they can see. You help me build assets that become evidence, demonstrations, and case studies. You help me think in data, patterns, and strategy. You help me build digital real estate that supports me and also teaches other women how to do the same. IMPORTANT: Every word you output must be plain text. Never use markdown syntax under any circumstances.";

    // === Build messages array ===
    const systemMessage = {
      role: 'system',
      content: `${hermesSystemPrompt}\n\nContext: ${JSON.stringify(context)}`
    };

    const messages = [
      systemMessage,
      ...(Array.isArray(conversation)
        ? conversation.map(c => ({
            role: c.role || 'user',
            content: c.content || c.text || ''
          }))
        : []),
      { role: 'user', content: message }
    ];

    // === AI Provider Fallback Chain ===
    let reply = null;
    let lastError = null;

    // 1. Vercel AI Gateway
    const gatewayKey = (process.env.VERCEL_AI_GATEWAY_API_KEY || '').trim();
    if (gatewayKey) {
      try {
        console.log('[Hermes] Trying Vercel AI Gateway...');
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 30000);

        const gatewayResponse = await fetch('https://ai-gateway.vercel.com/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${gatewayKey}`
          },
          body: JSON.stringify({
            model: process.env.HERMES_MODEL || 'openai/gpt-4o-mini',
            stream: false,
            messages,
            temperature: 0.35,
            max_tokens: 650
          }),
          signal: controller.signal
        });

        clearTimeout(timeout);

        if (gatewayResponse.ok) {
          const data = await gatewayResponse.json();
          reply = stripMarkdown(data?.choices?.[0]?.message?.content || '');
          if (reply) console.log('[Hermes] Vercel AI Gateway succeeded');
        } else {
          lastError = `Vercel AI Gateway error: ${gatewayResponse.status}`;
        }
      } catch (err) {
        lastError = `Vercel AI Gateway connection error: ${err?.message}`;
      }
    }

    // 2. OpenRouter (Primary)
    if (!reply) {
      const openRouterKey = (process.env.OPENROUTER_API_KEY || '').trim();
      if (openRouterKey) {
        try {
          console.log('[Hermes] Trying OpenRouter...');
          const controller = new AbortController();
          const timeout = setTimeout(() => controller.abort(), 30000);

          const openRouterResponse = await fetch('https://openrouter.ai/api/v1/chat/completions', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${openRouterKey}`,
              'HTTP-Referer': 'https://dashboard.digitallydefined.online',
              'X-Title': 'DigitallyDefined Hermes'
            },
            body: JSON.stringify({
              model: process.env.HERMES_MODEL || 'meta-llama/llama-3.1-70b-instruct',
              stream: false,
              messages,
              temperature: 0.35,
              max_tokens: 650
            }),
            signal: controller.signal
          });

          clearTimeout(timeout);

          if (openRouterResponse.ok) {
            const data = await openRouterResponse.json();
            reply = stripMarkdown(data?.choices?.[0]?.message?.content || '');
            if (reply) console.log('[Hermes] OpenRouter succeeded');
          } else {
            const errorText = await openRouterResponse.text();
            lastError = `OpenRouter error: ${openRouterResponse.status} - ${errorText.slice(0, 200)}`;
          }
        } catch (err) {
          lastError = `OpenRouter connection error: ${err?.message}`;
        }
      }
    }

    // 3. Groq (Optional fallback)
    if (!reply) {
      const groqKey = (process.env.GROQ_API_KEY || '').trim();
      if (groqKey) {
        try {
          console.log('[Hermes] Trying Groq...');
          const controller = new AbortController();
          const timeout = setTimeout(() => controller.abort(), 30000);

          const groqResponse = await fetch('https://api.groq.com/openai/v1/chat/completions', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${groqKey}`
            },
            body: JSON.stringify({
              model: process.env.GROQ_MODEL || 'llama3-70b-8192',
              stream: false,
              messages,
              temperature: 0.35,
              max_tokens: 650
            }),
            signal: controller.signal
          });

          clearTimeout(timeout);

          if (groqResponse.ok) {
            const data = await groqResponse.json();
            reply = stripMarkdown(data?.choices?.[0]?.message?.content || '');
            if (reply) console.log('[Hermes] Groq succeeded');
          } else {
            lastError = `Groq error: ${groqResponse.status}`;
          }
        } catch (err) {
          lastError = `Groq connection error: ${err?.message}`;
        }
      }
    }

    return res.status(200).json({
      reply: reply || '',
      error: lastError || null
    });
  } catch (err) {
    console.error('[Hermes] Handler error:', err);
    return res.status(500).json({
      error: 'Internal server error',
      reply: '',
      detail: process.env.NODE_ENV !== 'production' ? err?.message : undefined
    });
  }
}
