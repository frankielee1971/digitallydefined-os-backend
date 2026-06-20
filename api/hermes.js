/**
 * Hermes Backend Handler
 * AI Assistant endpoint that uses a fallback chain:
 * 1. Vercel AI Gateway (preferred)
 * 2. OpenRouter
 * 3. Groq
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

  // === Method Validation ===
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed - use POST' });
  }

  // === API Key Validation ===
  const providedKey = req.headers['x-api-key'] || req.headers['authorization'] || '';
  const expectedKey = process.env.DASHBOARD_API_KEY || '';

  if (!expectedKey || String(providedKey).trim() !== String(expectedKey).trim()) {
    return res.status(401).json({ error: 'Unauthorized - Invalid or missing API key' });
  }

  try {
    // === Parse Request Body Safely ===
    let body;
    try {
      body = typeof req.json === 'function' ? await req.json() : req.body;
    } catch (parseError) {
      return res.status(400).json({
        error: 'Invalid JSON in request body',
        detail: parseError?.message || 'Malformed JSON'
      });
    }

    if (!body || typeof body !== 'object') {
      return res.status(400).json({ error: 'Request body must be a JSON object' });
    }

    const { message, context = {}, conversation = [] } = body;

    if (!message || typeof message !== 'string') {
      return res.status(400).json({ error: 'Missing or invalid message field' });
    }

    // === Hermes System Prompt (plain text only) ===
    const hermesSystemPrompt = "You are Hermes, the DigitallyDefined business partner. RESPOND USING PLAIN TEXT ONLY. NO MARKDOWN. NO FORMATTING. NO BOLD. NO ITALICS. NO LISTS. NO BULLETS. NO NUMBERED LISTS. NO CODE BLOCKS. NO SYMBOLS. NO SPECIAL CHARACTERS. Use simple sentences with normal punctuation only. You help me grow the digital assets I already have. You evaluate my assets based on leverage, traffic potential, monetization potential, speed of execution, and long term compounding value. You help me choose which assets to build first so I can show Gen X women real proof. You understand that digital assets include websites, rank and rent sites, niche content sites, email lists, digital products, templates, content hubs, and automation systems. You help me decide which ones have the highest return with the least friction. You always think in terms of working smarter, not harder. You focus on leverage, automation, and compounding results. You help me build assets that grow over time and become examples for Gen X women who need to see what is possible. You understand that Gen X women trust results they can see. You help me build assets that become evidence, demonstrations, and case studies. You help me think in data, patterns, and strategy. You help me build digital real estate that supports me and also teaches other women how to do the same. IMPORTANT: Every word you output must be plain text. Never use markdown syntax under any circumstances.";

    // === Strip Markdown from responses ===
    const stripMarkdown = (text) => {
      if (!text || typeof text !== 'string') return '';
      return text
        .replace(/```[\s\S]*?```/g, '')
        .replace(/\*\*\*[^\*]+\*\*\*/g, '')
        .replace(/\*\*[^\*]+\*\*/g, '')
        .replace(/\*[^\*]+\*/g, '')
        .replace(/_[^_]+_/g, '')
        .replace(/`[^`]+`/g, '')
        .replace(/^>\s*/gm, '')
        .replace(/^\s*[-*+]\s+/gm, '')
        .replace(/^\s*\d+\.\s+/gm, '')
        .replace(/[\n\r]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
    };

    // === Build messages array ===
    const systemMessage = {
      role: 'system',
      content: `${hermesSystemPrompt}\n\nContext: ${JSON.stringify(context)}`
    };

    const messages = [
      systemMessage,
      ...(Array.isArray(conversation) ? conversation.map(c => ({
        role: c.role || 'user',
        content: c.content || c.text || ''
      })) : []),
      { role: 'user', content: message }
    ];

    // === AI Provider Fallback Chain ===
    let reply = null;
    let lastError = null;

    // 1. Try Vercel AI Gateway
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
            messages: messages,
            temperature: 0.35,
            max_tokens: 650
          }),
          signal: controller.signal
        });

        clearTimeout(timeout);

        if (gatewayResponse.ok) {
          const gatewayData = await gatewayResponse.json();
          reply = stripMarkdown(gatewayData?.choices?.[0]?.message?.content || '');
          if (reply) {
            console.log('[Hermes] Vercel AI Gateway succeeded');
          }
        } else {
          const errorText = await gatewayResponse.text();
          lastError = `Vercel AI Gateway error: ${gatewayResponse.status} - ${errorText.slice(0, 200)}`;
          console.error('[Hermes] Vercel AI Gateway failed:', lastError);
        }
      } catch (gatewayErr) {
        lastError = `Vercel AI Gateway connection error: ${gatewayErr?.message || 'Unknown error'}`;
        console.error('[Hermes] Vercel AI Gateway connection error:', gatewayErr);
      }
    } else {
      console.log('[Hermes] VERCEL_AI_GATEWAY_API_KEY not set, skipping');
    }

    // 2. Try OpenRouter
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
              model: process.env.HERMES_MODEL || 'openai/gpt-4o-mini',
              stream: false,
              messages: messages,
              temperature: 0.35,
              max_tokens: 650
            }),
            signal: controller.signal
          });

          clearTimeout(timeout);

          if (openRouterResponse.ok) {
            const openRouterData = await openRouterResponse.json();
            reply = stripMarkdown(openRouterData?.choices?.[0]?.message?.content || '');
            if (reply) {
              console.log('[Hermes] OpenRouter succeeded');
            }
          } else {
            const errorText = await openRouterResponse.text();
            lastError = `OpenRouter error: ${openRouterResponse.status} - ${errorText.slice(0, 200)}`;
            console.error('[Hermes] OpenRouter failed:', lastError);
          }
        } catch (openRouterErr) {
          lastError = `OpenRouter connection error: ${openRouterErr?.message || 'Unknown error'}`;
          console.error('[Hermes] OpenRouter connection error:', openRouterErr);
        }
      } else {
        console.log('[Hermes] OPENROUTER_API_KEY not set, skipping');
      }
    }

    // 3. Try Groq
    if (!reply) {
      const groqKey = (process.env.GROQ_API_KEY || '').trim();
      if (groqKey) {
        try {
          console.log('[Hermes] Trying Groq...');
          const controller = new AbortController();
          const timeout = setTimeout(() => controller.abort(), 30000);

          const model = (process.env.MODEL || 'llama-3.3-70b-versatile').trim();

          const groqResponse = await fetch('https://api.groq.com/openai/v1/chat/completions', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${groqKey}`
            },
            body: JSON.stringify({
              model: model,
              stream: false,
              messages: messages,
              temperature: 0.35,
              max_tokens: 650
            }),
            signal: controller.signal
          });

          clearTimeout(timeout);

          if (groqResponse.ok) {
            const groqData = await groqResponse.json();
            reply = stripMarkdown(groqData?.choices?.[0]?.message?.content || '');
            if (reply) {
              console.log('[Hermes] Groq succeeded');
            }
          } else {
            const errorText = await groqResponse.text();
            lastError = `Groq error: ${groqResponse.status} - ${errorText.slice(0, 200)}`;
            console.error('[Hermes] Groq failed:', lastError);
          }
        } catch (groqErr) {
          lastError = `Groq connection error: ${groqErr?.message || 'Unknown error'}`;
          console.error('[Hermes] Groq connection error:', groqErr);
        }
      } else {
        console.log('[Hermes] GROQ_API_KEY not set, skipping');
      }
    }

    // === Final Response ===
    if (reply) {
      return res.status(200).json({
        success: true,
        reply: reply
      });
    }

    // No AI provider available - return helpful message
    if (!gatewayKey && !process.env.OPENROUTER_API_KEY && !process.env.GROQ_API_KEY) {
      return res.status(200).json({
        success: false,
        reply: 'Hermes is ready but no AI model is configured. Please set VERCEL_AI_GATEWAY_API_KEY, OPENROUTER_API_KEY, or GROQ_API_KEY in your backend environment variables to enable AI responses.'
      });
    }

    // All providers failed
    return res.status(500).json({
      success: false,
      reply: 'All AI services are currently unavailable. Please try again shortly.',
      detail: lastError || 'All AI providers returned errors'
    });

  } catch (error) {
    console.error('[Hermes Backend] Unexpected error:', error);
    return res.status(500).json({
      error: 'Internal server error',
      reply: 'Hermes encountered an unexpected error. Please try again.',
      detail: process.env.NODE_ENV !== 'production' ? error?.message || 'Unknown error' : 'An internal error occurred'
    });
  }
}
