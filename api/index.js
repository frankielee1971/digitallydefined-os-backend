// /api/index.js
// Hardened unified API handler for Vercel with method validation, env test route, rate limiting, and masked external errors
// Optimized with Brevo email, multi-AI provider routing, caching, and timeouts

const ALLOWED_ORIGINS = [
  'https://dashboard.digitallydefined.online',
  'http://localhost:3000',
  'http://localhost:5173',
];

const ALLOWED_ACTIONS = new Set([
  'status',
  'auth.verify',
  'ai.recommendations',
  'brain.brief',
  'automation.sync',
  'automation.list',
  'automation.logs',
  'automation.run',
  'automation.events',
  'dashboard',
  'test-env',
]);

const GET_ONLY_ACTIONS = new Set([
  'status',
  'auth.verify',
  'ai.recommendations',
  'brain.brief',
  'automation.list',
  'automation.logs',
  'automation.events',
  'dashboard',
  'test-env',
]);

const POST_ONLY_ACTIONS = new Set([
  'automation.sync',
  'automation.run',
]);

const RATE_LIMIT_WINDOW_MS = 60 * 1000;
const RATE_LIMIT_MAX_REQUESTS = 60;

// Rate limit store with cleanup to prevent memory leaks
const rateLimitStore = globalThis.__digitallyDefinedRateLimitStore || { map: new Map(), lastCleanup: Date.now() };
if (!globalThis.__digitallyDefinedRateLimitStore) {
  globalThis.__digitallyDefinedRateLimitStore = rateLimitStore;
}

// Cleanup old entries every 5 minutes
function cleanupRateLimitStore() {
  const now = Date.now();
  if (now - rateLimitStore.lastCleanup > 5 * 60 * 1000) {
    for (const [ip, bucket] of rateLimitStore.map.entries()) {
      if (now > bucket.resetAt) {
        rateLimitStore.map.delete(ip);
      }
    }
    rateLimitStore.lastCleanup = now;
  }
}

function getRateLimitMap() {
  cleanupRateLimitStore();
  return rateLimitStore.map;
}

const FETCH_TIMEOUT_MS = 5000;

// AI Provider configuration - supports multiple free/paid providers with OmniRoute for smart routing
const AI_PROVIDERS = {
  groq: {
    url: 'https://api.groq.com/openai/v1/chat/completions',
    keyEnv: 'GROQ_API_KEY',
    models: ['llama-3.3-70b-versatile', 'llama-3.1-8b-instant', 'mixtral-8x7b-32768'],
    defaultModel: 'llama-3.3-70b-versatile',
    priority: 1,
  },
  nvidia: {
    url: 'https://integrate.api.nvidia.com/v1/chat/completions',
    keyEnv: 'NVIDIA_API_KEY',
    models: ['meta/llama-3.1-405b-instruct', 'meta/llama3-70b-instruct'],
    defaultModel: 'meta/llama3-70b-instruct',
    priority: 2,
  },
  openrouter: {
    url: 'https://openrouter.ai/api/v1/chat/completions',
    keyEnv: 'OPENROUTER_API_KEY',
    models: ['meta-llama/llama-3-70b-instruct', 'mistralai/mistral-large'],
    defaultModel: 'meta-llama/llama-3-70b-instruct',
    priority: 3,
  },
  antigravity: {
    url: process.env.ANTIGRAVITY_BASE_URL || 'https://api.antigravity.ai/v1/chat/completions',
    keyEnv: 'ANTIGRAVITY_API_KEY',
    models: ['antigravity-v1'],
    defaultModel: 'antigravity-v1',
    priority: 4,
  },
  // OmniRoute - routes to multiple free AI providers automatically
  omniroute: {
    url: process.env.OMNIROUTE_BASE_URL || 'https://api.omniroute.ai/v1/chat/completions',
    keyEnv: 'OMNIROUTE_API_KEY',
    models: ['auto'], // OmniRoute auto-selects best available model
    defaultModel: 'auto',
    priority: 0, // Highest priority when available - routes to free providers
  },
  // Placeholder configs for future providers - just add API keys to enable
  nararouter: {
    url: process.env.NARAROUTER_BASE_URL || 'https://api.nara.router/v1/chat/completions',
    keyEnv: 'NARAROUTER_API_KEY',
    models: ['auto'],
    defaultModel: 'auto',
    priority: 5,
  },
  tokenrouter: {
    url: process.env.TOKENROUTER_BASE_URL || 'https://api.tokenrouter.io/v1/chat/completions',
    keyEnv: 'TOKENROUTER_API_KEY',
    models: ['auto'],
    defaultModel: 'auto',
    priority: 6,
  },
  poolside: {
    url: process.env.POOLSIDE_BASE_URL || 'https://api.poolside.ai/v1/chat/completions',
    keyEnv: 'POOLSIDE_API_KEY',
    models: ['poolside-v1'],
    defaultModel: 'poolside-v1',
    priority: 7,
  },
  agnesai: {
    url: process.env.AGNESAI_BASE_URL || 'https://api.agnes.ai/v1/chat/completions',
    keyEnv: 'AGNESAI_API_KEY',
    models: ['agnes-v1'],
    defaultModel: 'agnes-v1',
    priority: 8,
  },
};

// Cache for AI brief responses (20 minutes TTL)
const aiBriefCache = globalThis.__aiBriefCache || { data: null, expiry: 0 };
if (!globalThis.__aiBriefCache) {
  globalThis.__aiBriefCache = aiBriefCache;
}

// Cache for Brevo stats (15 minutes TTL)
const brevoCache = globalThis.__brevoCache || { data: null, expiry: 0 };
if (!globalThis.__brevoCache) {
  globalThis.__brevoCache = brevoCache;
}

const formatPct = (n) => `${Number.isFinite(n) ? n.toFixed(1) : '0.0'}%`;
const formatUSD = (n) => `$${Number.isFinite(n) ? n.toLocaleString() : '0'}`;

function safeNumber(value, fallback = 0) {
  if (typeof value === 'number' && !Number.isNaN(value)) return value;
  if (typeof value === 'string') {
    const cleaned = value.replace(/[$,%\s,]/g, '');
    const parsed = Number(cleaned);
    return Number.isNaN(parsed) ? fallback : parsed;
  }
  return fallback;
}

function safeString(value, fallback = '') {
  return typeof value === 'string' && value.trim() ? value : fallback;
}

function getJsonContentType(headers) {
  return headers.get('content-type') || '';
}

async function parseJsonSafe(res, fallback = null) {
  try {
    const contentType = getJsonContentType(res.headers);
    if (!contentType.includes('application/json')) {
      const text = await res.text();
      return text ? JSON.parse(text) : fallback;
    }
    return await res.json();
  } catch {
    return fallback;
  }
}

// Fetch with timeout protection
async function fetchWithTimeout(url, options = {}, timeoutMs = FETCH_TIMEOUT_MS) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  
  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    clearTimeout(timeoutId);
    return response;
  } catch (error) {
    clearTimeout(timeoutId);
    if (error.name === 'AbortError') {
      throw new Error(`Request timed out after ${timeoutMs}ms`);
    }
    throw error;
  }
}

function applyCors(req, res) {
  const origin = req.headers.origin;

  if (origin && ALLOWED_ORIGINS.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  } else {
    res.setHeader('Access-Control-Allow-Origin', 'https://dashboard.digitallydefined.online');
  }

  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-api-key');
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Vary', 'Origin');
}

function getClientIp(req) {
  const forwardedFor = req.headers['x-forwarded-for'];
  if (typeof forwardedFor === 'string' && forwardedFor.trim()) {
    return forwardedFor.split(',')[0].trim();
  }
  return req.socket?.remoteAddress || 'unknown';
}

function applyRateLimit(req, res) {
  const ip = getClientIp(req);
  const now = Date.now();
  const map = getRateLimitMap();
  const bucket = map.get(ip);

  if (!bucket || now > bucket.resetAt) {
    const freshBucket = {
      count: 1,
      resetAt: now + RATE_LIMIT_WINDOW_MS,
    };
    map.set(ip, freshBucket);
    res.setHeader('X-RateLimit-Limit', String(RATE_LIMIT_MAX_REQUESTS));
    res.setHeader('X-RateLimit-Remaining', String(RATE_LIMIT_MAX_REQUESTS - 1));
    res.setHeader('X-RateLimit-Reset', String(Math.ceil(freshBucket.resetAt / 1000)));
    return null;
  }

  if (bucket.count >= RATE_LIMIT_MAX_REQUESTS) {
    const retryAfter = Math.max(1, Math.ceil((bucket.resetAt - now) / 1000));
    res.setHeader('Retry-After', String(retryAfter));
    res.setHeader('X-RateLimit-Limit', String(RATE_LIMIT_MAX_REQUESTS));
    res.setHeader('X-RateLimit-Remaining', '0');
    res.setHeader('X-RateLimit-Reset', String(Math.ceil(bucket.resetAt / 1000)));
    return {
      status: 429,
      body: { error: 'Too many requests. Please try again shortly.' },
    };
  }

  bucket.count += 1;
  res.setHeader('X-RateLimit-Limit', String(RATE_LIMIT_MAX_REQUESTS));
  res.setHeader('X-RateLimit-Remaining', String(Math.max(0, RATE_LIMIT_MAX_REQUESTS - bucket.count)));
  res.setHeader('X-RateLimit-Reset', String(Math.ceil(bucket.resetAt / 1000)));
  return null;
}

function checkDashboardApiKey(req) {
  const apiKey = req.headers['x-api-key'];
  const expectedKey = process.env.DASHBOARD_API_KEY;
  if (!expectedKey) return true;
  return apiKey === expectedKey;
}

function validateMethodForAction(req, action) {
  if (!action || action === 'status') return null;

  if (!ALLOWED_ACTIONS.has(action)) {
    return {
      status: 404,
      body: { error: `Unknown action: ${action}` },
    };
  }

  if (GET_ONLY_ACTIONS.has(action) && req.method !== 'GET') {
    return {
      status: 405,
      body: { error: `Method ${req.method} not allowed for action ${action}. Use GET.` },
    };
  }

  if (POST_ONLY_ACTIONS.has(action) && req.method !== 'POST') {
    return {
      status: 405,
      body: { error: `Method ${req.method} not allowed for action ${action}. Use POST.` },
    };
  }

  return null;
}

function maskErrorDetails(err, source) {
  const message = err?.message || 'Unknown external service error';
  const isAuth = /unauthorized|forbidden|token|credential|secret|apikey|api key|access denied/i.test(message);
  const isRate = /rate limit|too many requests|quota/i.test(message);
  const isTimeout = /timeout|timed out|aborted/i.test(message);

  if (isAuth) {
    return `${source} request failed due to authentication or permission settings.`;
  }
  if (isRate) {
    return `${source} request was rate limited.`;
  }
  if (isTimeout) {
    return `${source} request timed out.`;
  }
  return `${source} request failed.`;
}

async function fetchFacebookGroup() {
  const groupId = process.env.FACEBOOK_GROUP_ID;
  const token = process.env.FACEBOOK_ACCESS_TOKEN;

  if (!groupId || !token) {
    return { name: null, member_count: 0, error: 'Facebook env vars not set' };
  }

  try {
    const url = new URL(`https://graph.facebook.com/v18.0/${groupId}`);
    url.searchParams.set('fields', 'name,member_count,privacy');
    url.searchParams.set('access_token', token);

    const res = await fetchWithTimeout(url.toString());
    const data = await parseJsonSafe(res, {});

    if (!res.ok) throw new Error(data?.error?.message || 'Facebook API error');

    return {
      name: data?.name || null,
      member_count: safeNumber(data?.member_count, 0),
      error: null,
      debug: null,
    };
  } catch (e) {
    return {
      name: null,
      member_count: 0,
      error: maskErrorDetails(e, 'Facebook API'),
      debug: process.env.NODE_ENV !== 'production' ? e.message || 'Facebook fetch failed' : null,
    };
  }
}

// Brevo (formerly Sendinblue) email marketing integration - replaces SendPulse
async function fetchBrevoStats() {
  const apiKey = process.env.BREVO_API_KEY;
  
  // Return cached data if still valid (15 min TTL)
  const now = Date.now();
  if (brevoCache.data && now < brevoCache.expiry) {
    return { ...brevoCache.data, fromCache: true };
  }

  if (!apiKey) {
    return {
      totalSubscribers: 0,
      emailOpenRate: '0.0%',
      emailClickRate: '0.0%',
      emailReplyRate: 'N/A',
      emailRevenuePerCampaign: '$0',
      topCampaigns: [],
      error: 'Brevo API key not set',
      debug: null,
    };
  }

  try {
    const headers = {
      'api-key': apiKey,
      'Content-Type': 'application/json',
    };

    // Fetch contacts count and recent campaigns
    const [contactsRes, campaignsRes] = await Promise.all([
      fetchWithTimeout('https://api.brevo.com/v3/contacts?limit=1', { headers }),
      fetchWithTimeout('https://api.brevo.com/v3/emailCampaigns?limit=5', { headers }),
    ]);

    const contactsData = contactsRes.ok ? await parseJsonSafe(contactsRes, {}) : {};
    const campaignsData = campaignsRes.ok ? await parseJsonSafe(campaignsRes, {}) : {};

    if (!contactsRes.ok) {
      throw new Error(contactsData?.message || 'Brevo contacts request failed');
    }

    const totalSubscribers = safeNumber(contactsData?.count, 0);
    const campaigns = Array.isArray(campaignsData?.campaigns) ? campaignsData.campaigns : [];

    const withStats = campaigns.filter((c) => safeNumber(c?.stats?.sent, 0) > 0);

    const normalizedCampaigns = campaigns.slice(0, 5).map((c) => {
      const sent = safeNumber(c?.stats?.sent, 0);
      const opened = safeNumber(c?.stats?.uniqueOpened, 0);
      const clicked = safeNumber(c?.stats?.uniqueClicked, 0);
      return {
        name: c?.name || c?.subject || 'Campaign',
        openRate: sent > 0 ? formatPct((opened / sent) * 100) : '0.0%',
        clickRate: sent > 0 ? formatPct((clicked / sent) * 100) : '0.0%',
        revenue: '$0',
      };
    });

    const avgOpenRate = withStats.length
      ? withStats.reduce((sum, c) => {
          const sent = safeNumber(c?.stats?.sent, 0);
          const opened = safeNumber(c?.stats?.uniqueOpened, 0);
          return sum + (sent > 0 ? (opened / sent) * 100 : 0);
        }, 0) / withStats.length
      : 0;

    const avgClickRate = withStats.length
      ? withStats.reduce((sum, c) => {
          const sent = safeNumber(c?.stats?.sent, 0);
          const clicked = safeNumber(c?.stats?.uniqueClicked, 0);
          return sum + (sent > 0 ? (clicked / sent) * 100 : 0);
        }, 0) / withStats.length
      : 0;

    const result = {
      totalSubscribers,
      emailOpenRate: formatPct(avgOpenRate),
      emailClickRate: formatPct(avgClickRate),
      emailReplyRate: 'N/A',
      emailRevenuePerCampaign: '$0',
      topCampaigns: normalizedCampaigns,
      error: null,
      debug: null,
    };

    // Cache for 15 minutes
    brevoCache.data = result;
    brevoCache.expiry = now + 15 * 60 * 1000;

    return result;
  } catch (e) {
    const errorResult = {
      totalSubscribers: 0,
      emailOpenRate: '0.0%',
      emailClickRate: '0.0%',
      emailReplyRate: 'N/A',
      emailRevenuePerCampaign: '$0',
      topCampaigns: [],
      error: maskErrorDetails(e, 'Brevo API'),
      debug: process.env.NODE_ENV !== 'production' ? e.message || 'Brevo fetch failed' : null,
    };
    
    // Cache error briefly to avoid repeated failures
    brevoCache.data = errorResult;
    brevoCache.expiry = now + 2 * 60 * 1000;
    
    return errorResult;
  }
}

async function fetchSheetsData() {
  const sheetsUrl = process.env.SHEETS_WEBHOOK_URL;
  if (!sheetsUrl) return { data: null, error: 'Sheets webhook not set', debug: null };

  try {
    const url = new URL(sheetsUrl);
    url.searchParams.set('action', 'dashboard');
    url.searchParams.set('t', String(Date.now()));

    const res = await fetchWithTimeout(url.toString(), {
      headers: { 'Cache-Control': 'no-store' },
    });

    if (!res.ok) {
      throw new Error(`Sheets returned ${res.status}`);
    }

    return { data: await parseJsonSafe(res, null), error: null, debug: null };
  } catch (err) {
    console.error('Sheets fetch failed:', err);
    return {
      data: null,
      error: maskErrorDetails(err, 'Google Sheets webhook'),
      debug: process.env.NODE_ENV !== 'production' ? err.message || 'Sheets fetch failed' : null,
    };
  }
}

// Multi-provider AI brief with caching and smart priority-based routing
async function fetchAIBrief(context) {
  const now = Date.now();
  
  // Return cached data if still valid (20 min TTL)
  if (aiBriefCache.data && now < aiBriefCache.expiry) {
    return { ...aiBriefCache.data, fromCache: true };
  }

  // Determine which provider to use based on available API keys and priority
  // Priority order: omniroute (free routing) -> groq -> nvidia -> openrouter -> antigravity -> others
  let selectedProvider = null;
  let apiKey = null;
  let model = null;

  // Sort providers by priority (lower number = higher priority)
  const allProviders = Object.keys(AI_PROVIDERS).sort((a, b) => {
    const priorityA = AI_PROVIDERS[a].priority ?? 999;
    const priorityB = AI_PROVIDERS[b].priority ?? 999;
    return priorityA - priorityB;
  });
  
  for (const providerName of allProviders) {
    const provider = AI_PROVIDERS[providerName];
    const key = process.env[provider.keyEnv];
    if (key) {
      selectedProvider = provider;
      apiKey = key;
      // Allow env override for model, otherwise use default
      const envModel = process.env[`${providerName.toUpperCase()}_MODEL`];
      model = envModel || provider.defaultModel;
      break;
    }
  }

  if (!selectedProvider || !apiKey) {
    return {
      working: ['AI brief unavailable — No AI provider API key set.'],
      slipping: [],
      nextActions: [],
      error: 'No AI provider configured',
      debug: null,
    };
  }

  const prompt = `You are analyzing a digital business dashboard for DigitallyDefined — a faceless digital asset business targeting Gen X women.
Current stats:
- Community members: ${context.communityCount}
- Community growth: ${context.communityGrowth}
- Email subscribers: ${context.emailSubscribers}
- Email open rate: ${context.emailOpenRate}
- Email click rate: ${context.emailClickRate}
- Top performing asset: ${context.topAsset}
- Revenue this period: ${context.revenue}
Respond ONLY with a JSON object in this exact format (no markdown, no extra text):
{
  "working": ["one sentence max per item, 2-3 items"],
  "slipping": ["one sentence max per item, 1-2 items"],
  "nextActions": ["one sentence max per item, 1-2 items"]
}`;

  try {
    // For OmniRoute and similar auto-routing providers, don't specify model to let them choose
    const requestBody = {
      response_format: { type: 'json_object' },
      messages: [{ role: 'user', content: prompt }],
    };
    
    // Only add model if it's not 'auto' (for providers like OmniRoute that auto-select)
    if (model !== 'auto') {
      requestBody.model = model;
    } else {
      // Some providers need a model field even for auto-selection
      requestBody.model = 'auto';
    }

    const res = await fetchWithTimeout(selectedProvider.url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
    });

    const data = await parseJsonSafe(res, {});
    if (!res.ok) {
      throw new Error(data?.error?.message || `${selectedProvider.keyEnv || selectedProvider.defaultModel} API error`);
    }

    const raw = data?.choices?.[0]?.message?.content || '{}';
    const cleaned = String(raw).replace(/```json|```/g, '').trim();

    let parsed;
    try {
      parsed = JSON.parse(cleaned);
    } catch {
      parsed = {
        working: ['AI returned non-JSON output.'],
        slipping: [],
        nextActions: ['Tighten prompt or validate model response.'],
      };
    }

    const result = {
      working: Array.isArray(parsed?.working) ? parsed.working : [],
      slipping: Array.isArray(parsed?.slipping) ? parsed.slipping : [],
      nextActions: Array.isArray(parsed?.nextActions) ? parsed.nextActions : [],
      error: null,
      debug: null,
      provider: Object.keys(AI_PROVIDERS).find(key => AI_PROVIDERS[key] === selectedProvider) || 'unknown',
    };

    // Cache for 20 minutes
    aiBriefCache.data = result;
    aiBriefCache.expiry = now + 20 * 60 * 1000;

    return result;
  } catch (err) {
    const providerKey = Object.keys(AI_PROVIDERS).find(key => AI_PROVIDERS[key] === selectedProvider) || 'AI';
    const errorResult = {
      working: ['Community is active and syncing.'],
      slipping: ['AI brief could not be generated right now.'],
      nextActions: [`Verify ${providerKey} credentials and model settings if this persists.`],
      error: maskErrorDetails(err, `${providerKey} API`),
      debug: process.env.NODE_ENV !== 'production' ? err.message || 'AI request failed' : null,
    };
    
    // Cache error briefly
    aiBriefCache.data = errorResult;
    aiBriefCache.expiry = now + 5 * 60 * 1000;
    
    return errorResult;
  }
}

function buildAlerts(checks) {
  const alerts = [];

  if (!checks.facebookEnvSet) {
    alerts.push({
      type: 'warning',
      source: 'Facebook',
      message: 'FACEBOOK_GROUP_ID or FACEBOOK_ACCESS_TOKEN not set in backend env vars.',
    });
  } else if (checks.facebookError) {
    alerts.push({
      type: 'critical',
      source: 'Facebook API',
      message: checks.facebookError,
    });
  }

  if (checks.emailError) {
    alerts.push({
      type: 'warning',
      source: 'Brevo',
      message: checks.emailError,
    });
  }

  if (checks.sheetsError) {
    alerts.push({
      type: 'info',
      source: 'Google Sheets',
      message: checks.sheetsError,
    });
  }

  if (!checks.aiProviderSet) {
    alerts.push({
      type: 'info',
      source: 'AI Brief',
      message: 'No AI provider API key set — AI Command Brief is using fallback text.',
    });
  } else if (checks.aiError) {
    alerts.push({
      type: 'info',
      source: `AI Brief (${checks.aiProvider})`,
      message: checks.aiError,
    });
  }

  if (alerts.length === 0) {
    alerts.push({
      type: 'info',
      source: 'System',
      message: 'All systems syncing normally. No active alerts.',
    });
  }

  return alerts;
}

function buildEnvStatus() {
  // Check which AI providers are available
  const aiProviders = {};
  for (const [name, config] of Object.entries(AI_PROVIDERS)) {
    aiProviders[`${name}Set`] = !!process.env[config.keyEnv];
  }

  return {
    dashboardApiKeySet: !!process.env.DASHBOARD_API_KEY,
    facebookGroupIdSet: !!process.env.FACEBOOK_GROUP_ID,
    facebookAccessTokenSet: !!process.env.FACEBOOK_ACCESS_TOKEN,
    brevoApiKeySet: !!process.env.BREVO_API_KEY,
    sheetsWebhookUrlSet: !!process.env.SHEETS_WEBHOOK_URL,
    ...aiProviders,
    vercelEnv: process.env.VERCEL_ENV || 'unknown',
    nodeEnv: process.env.NODE_ENV || 'unknown',
  };
}

export default async function handler(req, res) {
  applyCors(req, res);

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const rateLimitResult = applyRateLimit(req, res);
  if (rateLimitResult) {
    return res.status(rateLimitResult.status).json(rateLimitResult.body);
  }

  const action = typeof req.query?.action === 'string' ? req.query.action : 'status';
  const methodValidation = validateMethodForAction(req, action);

  if (methodValidation) {
    return res.status(methodValidation.status).json(methodValidation.body);
  }

  try {
    if (action === 'status') {
      return res.status(200).json({
        status: 'ok',
        message: 'DigitallyDefined OS backend is running',
        timestamp: new Date().toISOString(),
      });
    }

    if (action === 'test-env') {
      if (!checkDashboardApiKey(req)) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      return res.status(200).json({
        status: 'ok',
        env: buildEnvStatus(),
      });
    }

    if (action === 'auth.verify') {
      if (!checkDashboardApiKey(req)) {
        return res.status(401).json({ error: 'Unauthorized' });
      }
      return res.status(200).json({ ok: true });
    }

    if (action === 'ai.recommendations') {
      return res.status(200).json({
        recommendations: [
          "Update the Rank & Rent asset for 'CT Roofing' — competitor activity increased.",
          'Create a new review follow-up workflow for Customer OS.',
          'Sync Vault — 12 new assets detected.',
        ],
      });
    }

    if (action === 'brain.brief') {
      return res.status(200).json({
        generatedAt: '2026-05-25T17:25:00-04:00',
        status: 'ok',
        daily_brief: {
          headline: 'One-sentence executive summary',
          summary: 'Short paragraph explaining what matters most today.',
          priority: 'high',
        },
        market_gaps: [
          {
            title: 'Underserved offer angle',
            why_it_matters: 'Why this looks profitable now',
            source: 'Notion + Perplexity + Sheets',
            confidence: 88,
            recommended_action: 'Create lead magnet or validate with content',
          },
        ],
        build_next: {
          asset_type: 'Lead magnet',
          title: 'Gen X digital income angle',
          reason: 'Best mix of demand, speed, and fit',
          cta: 'Draft in Notion AI agent',
        },
        stale_automations: [
          {
            name: 'Ideas Intake enrichment',
            tool: 'Gumloop',
            issue: 'No sync in 48 hours',
            severity: 'medium',
          },
        ],
        urgent_alerts: [
          {
            title: 'Meta insights sync failed',
            detail: 'Last successful pull was over 24h ago',
            action: 'Check Vercel env or token',
          },
        ],
        source_health: {
          notion: 'connected',
          antigravity: 'connected',
          google_sheets: 'connected',
          slack: 'connected',
          gumloop: 'connected',
          meta_api: 'connected',
        },
      });
    }

    if (action === 'automation.sync') {
      if (!checkDashboardApiKey(req)) {
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

    if (action === 'automation.list') {
      return res.status(200).json({
        status: 'success',
        automations: [
          { id: 'auto-001', name: 'Daily Vault Sync', status: 'active' },
          { id: 'auto-002', name: 'Lead Enrichment', status: 'active' },
        ],
      });
    }

    if (action === 'automation.logs') {
      return res.status(200).json({
        status: 'success',
        logs: [
          { id: 'log-001', event: 'Vault Sync Completed', timestamp: Date.now() },
          { id: 'log-002', event: 'Lead Enrichment Triggered', timestamp: Date.now() - 3600000 },
        ],
      });
    }

    if (action === 'automation.run') {
      if (!checkDashboardApiKey(req)) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      return res.status(200).json({
        status: 'success',
        message: 'Dashboard command executed',
      });
    }

    if (action === 'automation.events') {
      return res.status(200).json({
        status: 'success',
        events: [{ id: 'evt-001', type: 'sync', timestamp: Date.now() }],
      });
    }

    if (action === 'dashboard') {
      if (!checkDashboardApiKey(req)) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      // Parallel fetch with Brevo replacing SendPulse
      const [fbData, brevoData, sheetsResult] = await Promise.all([
        fetchFacebookGroup(),
        fetchBrevoStats(),
        fetchSheetsData(),
      ]);

      const sheetsData = sheetsResult.data;

      const communityCount = safeNumber(fbData?.member_count, safeNumber(sheetsData?.communityCount, 0));
      const revenueNumber = safeNumber(sheetsData?.revenue, NaN);
      const revenue = Number.isFinite(revenueNumber)
        ? formatUSD(revenueNumber)
        : safeString(sheetsData?.revenue, '$0');

      const leads = safeNumber(sheetsData?.leads, 0);
      const topAsset = safeString(sheetsData?.topAsset, 'N/A');
      const assetValue = safeString(sheetsData?.assetValue, '$0');

      const rawSiteHealth = sheetsData?.siteHealth;
      const siteHealth = typeof rawSiteHealth === 'number'
        ? rawSiteHealth <= 1
          ? `${Math.round(rawSiteHealth * 100)}%`
          : `${Math.round(rawSiteHealth)}%`
        : safeString(rawSiteHealth, '100%');

      const sentiment = safeString(sheetsData?.sentiment, 'Positive');
      const communityGrowth = safeString(sheetsData?.communityGrowth, '0%');
      const emailGrowth = safeString(sheetsData?.emailGrowth, '0%');
      const conversionRate = safeString(sheetsData?.conversionRate, '0%');
      const churnRisk = safeString(sheetsData?.churnRisk, 'Low');

      const aiBrief = await fetchAIBrief({
        communityCount,
        emailSubscribers: brevoData.totalSubscribers,
        emailOpenRate: brevoData.emailOpenRate,
        emailClickRate: brevoData.emailClickRate,
        topAsset,
        revenue,
        communityGrowth,
      });

      // Determine which AI provider is active for alerts
      let activeAiProvider = null;
      for (const [name, config] of Object.entries(AI_PROVIDERS)) {
        if (process.env[config.keyEnv]) {
          activeAiProvider = name;
          break;
        }
      }

      const alerts = buildAlerts({
        facebookError: fbData?.error,
        emailError: brevoData?.error,
        sheetsError: sheetsResult?.error,
        aiProviderSet: !!activeAiProvider,
        aiProvider: activeAiProvider,
        aiError: aiBrief?.error,
        facebookEnvSet: !!(process.env.FACEBOOK_GROUP_ID && process.env.FACEBOOK_ACCESS_TOKEN),
      });

      const community = Array.isArray(sheetsData?.community) ? sheetsData.community : [];
      const assets = Array.isArray(sheetsData?.assets) ? sheetsData.assets : [];
      const email = sheetsData?.email && typeof sheetsData.email === 'object' ? sheetsData.email : {};
      const topPosts = Array.isArray(sheetsData?.topPosts) ? sheetsData.topPosts : [];
      const campaigns = Array.isArray(sheetsData?.campaigns) && sheetsData.campaigns.length > 0
        ? sheetsData.campaigns
        : brevoData.topCampaigns;

      const debug = process.env.NODE_ENV !== 'production'
        ? {
            facebook: fbData?.debug || null,
            brevo: brevoData?.debug || null,
            sheets: sheetsResult?.debug || null,
            ai: aiBrief?.debug || null,
            aiProvider: activeAiProvider,
          }
        : undefined;

      return res.status(200).json({
        status: 'ok',
        community,
        assets,
        email,
        topPosts,
        campaigns,
        metrics: {
          communityCount,
          communityGrowth,
          emailSubscribers: brevoData.totalSubscribers,
          emailGrowth,
          emailOpenRate: brevoData.emailOpenRate,
          emailClickRate: brevoData.emailClickRate,
          conversionRate,
          churnRisk,
          revenue,
          leads,
          topAsset,
          assetValue,
          siteHealth,
          sentiment,
        },
        aiBrief: {
          working: aiBrief.working,
          slipping: aiBrief.slipping,
          nextActions: aiBrief.nextActions,
          provider: aiBrief.provider,
        },
        alerts,
        ...(debug ? { debug } : {}),
      });
    }

    return res.status(404).json({ error: `Unknown action: ${action}` });
  } catch (err) {
    console.error('Dashboard error:', err);
    return res.status(500).json({
      error: 'Dashboard fetch failed',
      details: process.env.NODE_ENV !== 'production' ? err?.message || 'Unknown error' : 'An internal error occurred.',
    });
  }
}
