/**
 * DigitallyDefined Unified Edge Function
 * 
 * Replaces all Vercel serverless functions with a single Supabase Edge Function.
 * Handles: /api/hermes, /api/sync, /api/vault, /api/automations, /api/models
 * 
 * Usage:
 *   curl -X POST https://<project>.supabase.co/functions/v1/hermes \
 *     -H "Content-Type: application/json" \
 *     -H "apikey: <anon-key>" \
 *     -H "x-api-key: <dashboard-api-key>" \
 *     -d '{"action":"dashboard"}'
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';

// === Configuration - Environment Variables ===
const API_KEY = Deno.env.get('DASHBOARD_API_KEY') || 'DigitallyDefined-OS-2026';
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || 'https://dijjlppdljpcgyoakdnq.supabase.co';
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') || '';
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';

// AI Providers
const OPENROUTER_API_KEY = Deno.env.get('OPENROUTER_API_KEY') || '';
const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY') || '';
const AGNES_API_KEY = Deno.env.get('AGNES_API_KEY') || '';
const BLUESMINDS_API_KEY = Deno.env.get('BLUESMINDS_API_KEY') || '';
const NOVITA_API_KEY = Deno.env.get('NOVITA_API_KEY') || '';
const NOVITA_BASE_URL = Deno.env.get('NOVITA_BASE_URL') || 'https://api.novita.ai/openai/v1';
const MISTRAL_API_KEY = Deno.env.get('MISTRAL_API_KEY') || '';
const GROQ_API_KEY = Deno.env.get('GROQ_API_KEY') || '';

// Integrations
const SHEETS_WEBHOOK_URL = Deno.env.get('SHEETS_WEBHOOK_URL') || '';
const FACEBOOK_GROUP_ID = Deno.env.get('FACEBOOK_GROUP_ID') || '';
const FACEBOOK_ACCESS_TOKEN = Deno.env.get('FACEBOOK_ACCESS_TOKEN') || '';
const SENDPULSE_API_ID = Deno.env.get('SENDPULSE_API_ID') || '';
const SENDPULSE_API_SECRET = Deno.env.get('SENDPULSE_API_SECRET') || '';
const NOTION_API_KEY = Deno.env.get('NOTION_API_KEY') || '';
const NOTION_IDEAS_DB_ID = Deno.env.get('NOTION_IDEAS_DB_ID') || '';
const NOTION_CONTENT_DB_ID = Deno.env.get('NOTION_CONTENT_DB_ID') || '';
const NOTION_AUTOMATIONS_DB_ID = Deno.env.get('NOTION_AUTOMATIONS_DB_ID') || '';
const NOTION_COMMAND_CENTER_DB_ID = Deno.env.get('NOTION_COMMAND_CENTER_DB_ID') || '';

// Social Media
const INSTAGRAM_USERNAME = Deno.env.get('INSTAGRAM_USERNAME') || 'digitally.defined';
const INSTAGRAM_BUSINESS_ACCOUNT_ID = Deno.env.get('INSTAGRAM_BUSINESS_ACCOUNT_ID') || '';
const META_APP_ID = Deno.env.get('META_APP_ID') || '';
const META_APP_SECRET = Deno.env.get('META_APP_SECRET') || '';

// Communication
const SLACK_BOT_TOKEN = Deno.env.get('SLACK_BOT_TOKEN') || '';
const SLACK_APP_TOKEN = Deno.env.get('SLACK_APP_TOKEN') || '';
const TELEGRAM_BOT_TOKEN = Deno.env.get('TELEGRAM_BOT_TOKEN') || '';
const TELEGRAM_ALLOWED_USERS = Deno.env.get('TELEGRAM_ALLOWED_USERS') || '';

// Email
const BREVO_API_KEY = Deno.env.get('BREVO_API_KEY') || '';
const BREVO_LIST_ID = Deno.env.get('BREVO_LIST_ID') || '2';

// Business
const GUMROAD_API_KEY = Deno.env.get('GUMROAD_API_KEY') || '';
const EXA_API_KEY = Deno.env.get('EXA_API_KEY') || '';
const FIRECRAWL_API_KEY = Deno.env.get('FIRECRAWL_API_KEY') || '';
const AGENTOPS_API_KEY = Deno.env.get('AGENTOPS_API_KEY') || '';

// === CORS Headers ===
const allowedOrigins = [
  'https://dashboard.digitallydefined.online',
  'https://digitallydefined.online',
  'http://localhost:3000',
  'http://localhost:5173',
];

function getCorsHeaders(origin: string | null) {
  const headers: Record<string, string> = {
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, apikey, Authorization, x-api-key',
    'Access-Control-Max-Age': '86400',
  };
  if (origin && allowedOrigins.includes(origin)) {
    headers['Access-Control-Allow-Origin'] = origin;
  } else {
    headers['Access-Control-Allow-Origin'] = 'https://dashboard.digitallydefined.online';
  }
  return headers;
}

// === Helper Functions ===
function sendResponse(status: number, data: any, origin: string | null = null) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...getCorsHeaders(origin), 'Content-Type': 'application/json' },
  });
}

function sendError(status: number, message: string, origin: string | null = null) {
  return sendResponse(status, { error: message }, origin);
}

async function parseBody(req: Request): Promise<any> {
  const contentType = req.headers.get('content-type') || '';
  if (!contentType.includes('application/json')) {
    return {};
  }
  try {
    return await req.json();
  } catch {
    return {};
  }
}

// === Rate Limiting ===
const rateLimitStore = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT_WINDOW_MS = 60 * 1000;
const RATE_LIMIT_MAX_REQUESTS = 60;

function applyRateLimit(clientIp: string): { status: number; body: any } | null {
  const now = Date.now();
  const bucket = rateLimitStore.get(clientIp);

  if (!bucket || now > bucket.resetAt) {
    rateLimitStore.set(clientIp, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return null;
  }

  if (bucket.count >= RATE_LIMIT_MAX_REQUESTS) {
    const retryAfter = Math.max(1, Math.ceil((bucket.resetAt - now) / 1000));
    return {
      status: 429,
      body: { error: 'Too many requests. Please try again shortly.' },
    };
  }

  bucket.count += 1;
  return null;
}

function getClientIp(req: Request): string {
  const forwardedFor = req.headers.get('x-forwarded-for');
  if (typeof forwardedFor === 'string' && forwardedFor.trim()) {
    return forwardedFor.split(',')[0].trim();
  }
  return 'unknown';
}

// === Dashboard Data ===
async function getDashboardData(): Promise<any> {
  const data: any = {
    revenue: '$12,450',
    leads: 156,
    conversionRate: 0.248,
    assetValue: 48000,
    topAsset: 'Email List',
    communityGrowth: '+12%',
    emailGrowth: '+8%',
    churnRisk: 'Low',
    reviews: [
      {
        name: 'Sarah M.',
        reviewText: 'This dashboard changed my business!',
        sentiment: 'positive',
        date: '2024-01-15',
        aiDraftedResponse: 'Thank you Sarah!',
      },
    ],
    campaigns: [
      { name: 'Authority Launch Sequence', openRate: '42%', clickRate: '18%' },
      { name: 'Evergreen Reputation Funnel', openRate: '38%', clickRate: '15%' },
    ],
    competitors: [
      { name: 'Competitor A', notes: 'Similar target audience' },
      { name: 'Competitor B', notes: 'Stronger social presence' },
    ],
    email: { subscribers: 1284, openRate: '42%', clickRate: '18%', revenuePerCampaign: '$1,240' },
    alerts: [{ type: 'info', source: 'System', message: 'All automations running normally' }],
    sourceHealth: {
      googleMyBusiness: 'Active',
      facebook: 'Active',
      instagram: 'Active',
      email: 'Active',
    },
    automations: [
      { name: 'Review Response Auto-Reply', status: 'active', lastRun: '2 hours ago' },
      { name: 'Social Media Cross-Post', status: 'active', lastRun: '5 hours ago' },
      { name: 'Email Lead Nurturing', status: 'paused', lastRun: '1 day ago' },
    ],
    aiBrief: {
      working: ['Email open rates above average', 'Social engagement increasing'],
      slipping: ['Review response time', 'Content calendar'],
      nextActions: ['Respond to reviews', "Schedule social content", 'Review campaigns'],
    },
    community: [
      { name: 'Rena Walker', date: 'Mar 28, 2026', status: 'Active' },
      { name: 'Angela Brooks', date: 'Mar 31, 2026', status: 'Onboarding' },
    ],
  };

  // Try to fetch from Supabase if credentials available
  if (SUPABASE_SERVICE_ROLE_KEY) {
    try {
      const supabase = fetch(`${SUPABASE_URL}/rest/v1/`, {
        headers: {
          'apikey': SUPABASE_ANON_KEY,
          'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
          'Prefer': 'return=minimal',
        },
      });
      // Real queries would go here
    } catch (err) {
      console.warn('[EdgeFunc] Supabase query failed (using mock data):', err);
    }
  }

  return data;
}

// === AI Chat Handler ===
async function handleAIChat(body: any): Promise<any> {
  const message = body.message || body.content || body.text || '';
  const conversation = body.conversation || body.messages || [];

  if (!message) {
    return { error: 'Missing message field', reply: '' };
  }

  // Try multiple AI providers in order of preference
  const models = [
    { key: 'openai/gpt-4o-mini', name: 'GPT-4o Mini', keyEnv: 'OPENROUTER_API_KEY' },
    { key: 'anthropic/claude-3-haiku', name: 'Claude 3 Haiku', keyEnv: 'ANTHROPIC_API_KEY' },
    { key: 'mistral/mistral-small', name: 'Mistral Small', keyEnv: 'MISTRAL_API_KEY' },
    { key: 'groq/llama3-8b', name: 'Llama 3', keyEnv: 'GROQ_API_KEY' },
  ];

  for (const model of models) {
    const apiKey = Deno.env.get(model.keyEnv);
    if (!apiKey) continue;

    try {
      let apiUrl = '';
      let headers: Record<string, string> = { 'Content-Type': 'application/json' };

      if (model.keyEnv === 'OPENROUTER_API_KEY') {
        apiUrl = 'https://openrouter.ai/api/v1/chat/completions';
        headers['Authorization'] = `Bearer ${apiKey}`;
        headers['HTTP-Referer'] = 'https://dashboard.digitallydefined.online';
        headers['X-Title'] = 'DigitallyDefined Dashboard';
      } else if (model.keyEnv === 'ANTHROPIC_API_KEY') {
        apiUrl = 'https://api.anthropic.com/v1/messages';
        headers['x-api-key'] = apiKey;
        headers['anthropic-version'] = '2023-06-01';
      } else if (model.keyEnv === 'MISTRAL_API_KEY') {
        apiUrl = 'https://api.mistral.ai/v1/chat/completions';
        headers['Authorization'] = `Bearer ${apiKey}`;
      } else if (model.keyEnv === 'GROQ_API_KEY') {
        apiUrl = 'https://api.groq.com/openai/v1/chat/completions';
        headers['Authorization'] = `Bearer ${apiKey}`;
      }

      const res = await fetch(apiUrl, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          model: model.key,
          messages: conversation.length > 0 ? conversation : [{ role: 'user', content: message }],
          max_tokens: 1000,
          temperature: 0.7,
        }),
      });

      const data = await res.json();
      
      if (model.keyEnv === 'ANTHROPIC_API_KEY') {
        return { reply: data.content?.[0]?.text || 'No response', model: model.name };
      }
      
      return {
        reply: data.choices?.[0]?.message?.content || 'No response',
        model: model.name,
      };
    } catch (err) {
      console.warn(`[EdgeFunc] ${model.name} failed:`, err);
      continue;
    }
  }

  // Fallback response
  return {
    reply: `Hermes received: "${message}". Configure AI provider keys for chat responses.`,
    agent: 'hermes',
  };
}

// === Main Handler ===
serve(async (req: Request): Promise<Response> => {
  const origin = req.headers.get('origin');

  // CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: getCorsHeaders(origin) });
  }

  // Rate limiting
  const clientIp = getClientIp(req);
  const rateLimitResult = applyRateLimit(clientIp);
  if (rateLimitResult) {
    return sendResponse(rateLimitResult.status, rateLimitResult.body, origin);
  }

  const url = new URL(req.url);
  const path = url.pathname;

  console.log(`[EdgeFunc] ${req.method} ${path}`);

  // Route: /health
  if (path === '/health' || path === '/') {
    return sendResponse(200, {
      status: 'ok',
      message: 'DigitallyDefined Edge Function running',
      timestamp: new Date().toISOString(),
      version: '1.0.0',
    }, origin);
  }

  // Route: /api/hermes (main endpoint)
  if (path === '/api/hermes' || path === '/hermes') {
    // Authenticate
    const apiKey = req.headers.get('x-api-key') || req.headers.get('authorization') || '';
    if (apiKey.trim() !== API_KEY) {
      return sendError(401, 'Unauthorized - Invalid or missing API key', origin);
    }

    const body = await parseBody(req);
    const action = body.action;

    // Dashboard action
    if (action === 'dashboard') {
      const data = await getDashboardData();
      return sendResponse(200, data, origin);
    }

    // Automation list action
    if (action === 'automation.list') {
      return sendResponse(200, {
        automations: [
          { name: 'Review Response Auto-Reply', status: 'active', lastRun: '2 hours ago' },
          { name: 'Social Media Cross-Post', status: 'active', lastRun: '5 hours ago' },
          { name: 'Email Lead Nurturing', status: 'paused', lastRun: '1 day ago' },
        ],
      }, origin);
    }

    // Subscribe action (email signup)
    if (action === 'subscribe') {
      const email = body.email;
      const name = body.name || '';
      const source = body.source || 'website';
      const tags = Array.isArray(body.tags) ? body.tags : [];

      if (!email || typeof email !== 'string' || !email.includes('@')) {
        return sendError(400, 'Valid email is required', origin);
      }

      // Log subscription (real Brevo integration would go here via BREVO_API_KEY)
      console.log(`[EdgeFunc] Subscribe: ${email} (${name}) from ${source}`, { tags });

      return sendResponse(200, {
        success: true,
        message: "You're on the list!",
        data: { email, name, source, tags, subscribedAt: new Date().toISOString() },
      }, origin);
    }

    // Contact form action
    if (action === 'contact') {
      const { name, email, message } = body;
      if (!email || !message) {
        return sendError(400, 'Email and message are required', origin);
      }

      console.log(`[EdgeFunc] Contact: ${name || 'Anonymous'} (${email}): ${message}`);

      return sendResponse(200, {
        success: true,
        message: 'Message received. We will get back to you soon.',
      }, origin);
    }

    // Vault sync action
    if (action === 'vault.sync' || action === 'sheets') {
      if (!SHEETS_WEBHOOK_URL) {
        return sendError(503, 'SHEETS_WEBHOOK_URL not configured', origin);
      }
      try {
        const url = new URL(SHEETS_WEBHOOK_URL);
        url.searchParams.set('action', 'dashboard');
        url.searchParams.set('t', String(Date.now()));
        
        const res = await fetch(url.toString(), {
          headers: { 'Cache-Control': 'no-store' },
        });
        return sendResponse(200, await res.json(), origin);
      } catch (err) {
        return sendError(500, `Sheets sync failed: ${err.message}`, origin);
      }
    }

    // AI Chat (default)
    const aiResult = await handleAIChat(body);
    return sendResponse(200, aiResult, origin);
  }

  // Route: /api/sync
  if (path === '/api/sync' || path === '/sync') {
    const apiKey = req.headers.get('x-api-key') || '';
    if (apiKey.trim() !== API_KEY) {
      return sendError(401, 'Unauthorized', origin);
    }
    const data = await getDashboardData();
    return sendResponse(200, { synced: true, data, timestamp: new Date().toISOString() }, origin);
  }

  // Route: /api/vault
  if (path === '/api/vault' || path === '/vault') {
    if (!SHEETS_WEBHOOK_URL) {
      return sendError(503, 'SHEETS_WEBHOOK_URL not configured', origin);
    }
    try {
      const url = new URL(SHEETS_WEBHOOK_URL);
      url.searchParams.set('action', 'vault');
      url.searchParams.set('t', String(Date.now()));
      
      const res = await fetch(url.toString(), {
        headers: { 'Cache-Control': 'no-store' },
      });
      return sendResponse(200, await res.json(), origin);
    } catch (err) {
      return sendError(500, `Vault sync failed: ${err.message}`, origin);
    }
  }

  // Route: /api/automations
  if (path === '/api/automations' || path === '/automations') {
    return sendResponse(200, {
      automations: [
        { name: 'Review Response Auto-Reply', status: 'active' },
        { name: 'Social Media Cross-Post', status: 'active' },
        { name: 'Email Lead Nurturing', status: 'paused' },
      ],
    }, origin);
  }

  // Route: /api/models
  if (path === '/api/models' || path === '/models') {
    return sendResponse(200, {
      models: [
        { id: 'openai/gpt-4o-mini', name: 'GPT-4o Mini', provider: 'OpenRouter' },
        { id: 'anthropic/claude-3-haiku', name: 'Claude 3 Haiku', provider: 'Anthropic' },
        { id: 'mistral/mistral-small', name: 'Mistral Small', provider: 'Mistral' },
        { id: 'groq/llama3-8b', name: 'Llama 3 8B', provider: 'Groq' },
      ],
    }, origin);
  }

  // Route: /api/routes (list all available routes)
  if (path === '/api/routes' || path === '/routes') {
    return sendResponse(200, {
      routes: [
        { path: '/api/hermes', method: 'POST', description: 'Main API endpoint' },
        { path: '/api/sync', method: 'POST', description: 'Vault sync' },
        { path: '/api/vault', method: 'GET', description: 'Vault data' },
        { path: '/api/automations', method: 'GET', description: 'Automation list' },
        { path: '/api/models', method: 'GET', description: 'AI models' },
        { path: '/health', method: 'GET', description: 'Health check' },
      ],
    }, origin);
  }

  // 404 for unknown routes
  return sendError(404, `Route not found: ${path}`, origin);
});
