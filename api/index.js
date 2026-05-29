// /api/index.js
// Hardened unified API handler for Vercel with method validation, env test route, rate limiting, and masked external errors

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
const rateLimitStore = globalThis.__digitallyDefinedRateLimitStore || new Map();
globalThis.__digitallyDefinedRateLimitStore = rateLimitStore;

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
  const bucket = rateLimitStore.get(ip);

  if (!bucket || now > bucket.resetAt) {
    const freshBucket = {
      count: 1,
      resetAt: now + RATE_LIMIT_WINDOW_MS,
    };
    rateLimitStore.set(ip, freshBucket);
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
    // NOTE: member_count is restricted by Facebook and requires app review.
    // We fetch name and privacy only; member_count comes from Google Sheets.
    const url = new URL(`https://graph.facebook.com/v18.0/${groupId}`);
    url.searchParams.set('fields', 'name,privacy');
    url.searchParams.set('access_token', token.trim());

    const res = await fetch(url.toString());
    const data = await parseJsonSafe(res, {});

    if (!res.ok) {
      const fbError = data?.error?.message || 'Facebook API error';
      console.error('[Facebook] API error:', fbError, '| code:', data?.error?.code, '| type:', data?.error?.type);
      throw new Error(fbError);
    }

    return {
      name: data?.name || null,
      member_count: 0, // populated from Sheets
      error: null,
      debug: null,
    };
  } catch (e) {
    console.error('[Facebook] fetchFacebookGroup failed:', e.message);
    return {
      name: null,
      member_count: 0,
      error: maskErrorDetails(e, 'Facebook API'),
      debug: process.env.NODE_ENV !== 'production' ? e.message || 'Facebook fetch failed' : null,
    };
  }
}

async function fetchSendPulseToken() {
  const userId = process.env.SENDPULSE_API_USER_ID;
  const secret = process.env.SENDPULSE_API_SECRET;
  if (!userId || !secret) return { token: null, error: 'SendPulse credentials not set', debug: null };

  try {
    const body = JSON.stringify({
      grant_type: 'client_credentials',
      client_id: userId.trim(),
      client_secret: secret.trim(),
    });

    console.log('[SendPulse] Requesting token, client_id length:', userId.trim().length);

    const res = await fetch('https://api.sendpulse.com/oauth/access_token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
    });

    const data = await parseJsonSafe(res, {});

    if (!res.ok) {
      const spError = data?.error_description || data?.error || 'SendPulse token request failed';
      console.error('[SendPulse] Token error:', spError, '| status:', res.status, '| raw:', JSON.stringify(data));
      throw new Error(spError);
    }

    console.log('[SendPulse] Token obtained successfully');
    return { token: data?.access_token || null, error: null, debug: null };
  } catch (e) {
    console.error('[SendPulse] fetchSendPulseToken failed:', e.message);
    return {
      token: null,
      error: maskErrorDetails(e, 'SendPulse auth'),
      debug: process.env.NODE_ENV !== 'production' ? e.message || 'SendPulse token failed' : null,
    };
  }
}

function unwrapArrayPayload(payload) {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.data)) return payload.data;
  if (Array.isArray(payload?.result)) return payload.result;
  return [];
}

async function fetchSendPulseStats(token) {
  try {
    const headers = { Authorization: `Bearer ${token}` };

    const [listsRes, campaignsRes] = await Promise.all([
      fetch('https://api.sendpulse.com/addressbooks?limit=10&offset=0', { headers }),
      fetch('https://api.sendpulse.com/campaigns?limit=5&offset=0', { headers }),
    ]);

    const listsJson = listsRes.ok ? await parseJsonSafe(listsRes, []) : [];
    const campaignsJson = campaignsRes.ok ? await parseJsonSafe(campaignsRes, []) : [];

    if (!listsRes.ok) {
      throw new Error(listsJson?.error || listsJson?.message || 'SendPulse addressbooks failed');
    }
    if (!campaignsRes.ok) {
      throw new Error(campaignsJson?.error || campaignsJson?.message || 'SendPulse campaigns failed');
    }

    const lists = unwrapArrayPayload(listsJson);
    const campaigns = unwrapArrayPayload(campaignsJson);

    const totalSubscribers = lists.reduce(
      (sum, list) => sum + safeNumber(list?.all_email_qty, 0),
      0
    );

    const withStats = campaigns.filter((c) => safeNumber(c?.statistics?.sent, 0) > 0);

    const normalizedCampaigns = campaigns.slice(0, 5).map((c) => {
      const sent = safeNumber(c?.statistics?.sent, 0);
      const opened = safeNumber(c?.statistics?.opened, 0);
      const clicked = safeNumber(c?.statistics?.clicked, 0);
      return {
        name: c?.name || c?.subject || 'Campaign',
        openRate: sent > 0 ? formatPct((opened / sent) * 100) : '0.0%',
        clickRate: sent > 0 ? formatPct((clicked / sent) * 100) : '0.0%',
        revenue: '$0',
      };
    });

    const avgOpenRate = withStats.length
      ? withStats.reduce((sum, c) => {
          const sent = safeNumber(c?.statistics?.sent, 0);
          const opened = safeNumber(c?.statistics?.opened, 0);
          return sum + (sent > 0 ? (opened / sent) * 100 : 0);
        }, 0) / withStats.length
      : 0;

    const avgClickRate = withStats.length
      ? withStats.reduce((sum, c) => {
          const sent = safeNumber(c?.statistics?.sent, 0);
          const clicked = safeNumber(c?.statistics?.clicked, 0);
          return sum + (sent > 0 ? (clicked / sent) * 100 : 0)
        }, 0) / withStats.length
      : 0;

    return {
      totalSubscribers,
      emailOpenRate: formatPct(avgOpenRate),
      emailClickRate: formatPct(avgClickRate),
      emailReplyRate: 'N/A',
      emailRevenuePerCampaign: '$0',
      topCampaigns: normalizedCampaigns,
      error: null,
      debug: null,
    };
  } catch (e) {
    return {
      totalSubscribers: 0,
      emailOpenRate: '0.0%',
      emailClickRate: '0.0%',
      emailReplyRate: 'N/A',
      emailRevenuePerCampaign: '$0',
      topCampaigns: [],
      error: maskErrorDetails(e, 'SendPulse API'),
      debug: process.env.NODE_ENV !== 'production' ? e.message || 'SendPulse fetch failed' : null,
    };
  }
}

async function fetchSheetsData() {
  const sheetsUrl = process.env.SHEETS_WEBHOOK_URL;
  if (!sheetsUrl) return { data: null, error: 'Sheets webhook not set', debug: null };

  try {
    const url = new URL(sheetsUrl);
    url.searchParams.set('action', 'dashboard');
    url.searchParams.set('t', String(Date.now()));

    const res = await fetch(url.toString(), {
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

async function fetchAIBrief(context) {
  const apiKey = process.env.GROQ_API_KEY;
  const model = (process.env.MODEL || 'llama-3.3-70b-versatile').trim();

  if (!apiKey) {
    return {
      working: ['AI brief unavailable — GROQ_API_KEY not set.'],
      slipping: [],
      nextActions: [],
      error: 'Groq API key not set',
      debug: null,
    };
  }

  const prompt = `You are analyzing a digital business dashboard for DigitallyDefined — a faceless digital asset business targeting Gen X women.\nCurrent stats:\n- Community members: ${context.communityCount}\n- Community growth: ${context.communityGrowth}\n- Email subscribers: ${context.emailSubscribers}\n- Email open rate: ${context.emailOpenRate}\n- Email click rate: ${context.emailClickRate}\n- Top performing asset: ${context.topAsset}\n- Revenue this period: ${context.revenue}\nRespond ONLY with a JSON object in this exact format (no markdown, no extra text):\n{\n  "working": ["one sentence max per item, 2-3 items"],\n  "slipping": ["one sentence max per item, 1-2 items"],\n  "nextActions": ["one sentence max per item, 1-2 items"]\n}`;

  try {
    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey.trim()}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        response_format: { type: 'json_object' },
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    const data = await parseJsonSafe(res, {});
    if (!res.ok) {
      throw new Error(data?.error?.message || 'Groq API error');
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

    return {
      working: Array.isArray(parsed?.working) ? parsed.working : [],
      slipping: Array.isArray(parsed?.slipping) ? parsed.slipping : [],
      nextActions: Array.isArray(parsed?.nextActions) ? parsed.nextActions : [],
      error: null,
      debug: null,
    };
  } catch (err) {
    return {
      working: ['Community is active and syncing.'],
      slipping: ['AI brief could not be generated right now.'],
      nextActions: ['Verify Groq credentials and model settings if this persists.'],
      error: maskErrorDetails(err, 'Groq API'),
      debug: process.env.NODE_ENV !== 'production' ? err.message || 'Groq request failed' : null,
    };
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
      source: 'SendPulse',
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

  if (!checks.groqSet) {
    alerts.push({
      type: 'info',
      source: 'AI Brief',
      message: 'GROQ_API_KEY not set — AI Command Brief is using fallback text.',
    });
  } else if (checks.aiError) {
    alerts.push({
      type: 'info',
      source: 'AI Brief',
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
  return {
    dashboardApiKeySet: !!process.env.DASHBOARD_API_KEY,
    facebookGroupIdSet: !!process.env.FACEBOOK_GROUP_ID,
    facebookAccessTokenSet: !!process.env.FACEBOOK_ACCESS_TOKEN,
    sendPulseUserIdSet: !!process.env.SENDPULSE_API_USER_ID,
    sendPulseSecretSet: !!process.env.SENDPULSE_API_SECRET,
    sheetsWebhookUrlSet: !!process.env.SHEETS_WEBHOOK_URL,
    groqApiKeySet: !!process.env.GROQ_API_KEY,
    model: (process.env.MODEL || 'llama-3.3-70b-versatile').trim(),
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

      const [fbData, spTokenResult, sheetsResult] = await Promise.all([
        fetchFacebookGroup(),
        fetchSendPulseToken(),
        fetchSheetsData(),
      ]);

      const spData = spTokenResult.token
        ? await fetchSendPulseStats(spTokenResult.token)
        : {
            totalSubscribers: 0,
            emailOpenRate: '0.0%',
            emailClickRate: '0.0%',
            emailReplyRate: 'N/A',
            emailRevenuePerCampaign: '$0',
            topCampaigns: [],
            error: spTokenResult.error,
            debug: spTokenResult.debug,
          };

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
        emailSubscribers: spData.totalSubscribers,
        emailOpenRate: spData.emailOpenRate,
        emailClickRate: spData.emailClickRate,
        topAsset,
        revenue,
        communityGrowth,
      });

      const alerts = buildAlerts({
        facebookError: fbData?.error,
        emailError: spData?.error,
        sheetsError: sheetsResult?.error,
        groqSet: !!process.env.GROQ_API_KEY,
        aiError: aiBrief?.error,
        facebookEnvSet: !!(process.env.FACEBOOK_GROUP_ID && process.env.FACEBOOK_ACCESS_TOKEN),
      });

      const community = Array.isArray(sheetsData?.community) ? sheetsData.community : [];
      const assets = Array.isArray(sheetsData?.assets) ? sheetsData.assets : [];
      const email = sheetsData?.email && typeof sheetsData.email === 'object' ? sheetsData.email : {};
      const topPosts = Array.isArray(sheetsData?.topPosts) ? sheetsData.topPosts : [];
      const campaigns = Array.isArray(sheetsData?.campaigns) && sheetsData.campaigns.length > 0
        ? sheetsData.campaigns
        : spData.topCampaigns;

      const debug = process.env.NODE_ENV !== 'production'
        ? {
            facebook: fbData?.debug || null,
            sendpulse: spData?.debug || spTokenResult?.debug || null,
            sheets: sheetsResult?.debug || null,
            groq: aiBrief?.debug || null,
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
          emailSubscribers: spData.totalSubscribers,
          emailGrowth,
          emailOpenRate: spData.emailOpenRate,
          emailClickRate: spData.emailClickRate,
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
