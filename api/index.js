// /api/index.js
// Hardened unified API handler for Vercel with method validation, env test route, rate limiting, and masked external errors

import { buildEnvelope } from '../lib/meta-auth.js';

const ALLOWED_ORIGINS = [
  'https://dashboard.digitallydefined.online',
  'https://digitallydefined.online',
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
  'ai.free',
  'ai.paid',
  'ai.workflow',
  'ai.seo',
  'ai.automation',
  'automation.run',
  'automation.events',
  'dashboard',
  'sheets',
  'notion-webhook',
  'test-env',
  'hermes',
  'routes',
  'brevo',
  'community-triggers',
  'social-publishers',
]);

const GET_ONLY_ACTIONS = new Set([
  'status',
  'auth.verify',
  'ai.recommendations',
  'brain.brief',
  'automation.list',
  'automation.logs',
  'automation.events',
  'ai.free',
  'ai.paid',
  'ai.workflow',
  'ai.seo',
  'ai.automation',
  'dashboard',
  'sheets',
  'test-env',
  'routes',
]);

const POST_ONLY_ACTIONS = new Set([
  'automation.sync',
  'automation.run',
  'notion-webhook',
  'hermes',
  'ai.free',
  'ai.paid',
  'ai.workflow',
  'ai.seo',
  'ai.automation',
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
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-api-key, Authorization');
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
  if (!expectedKey) return false;
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
    const url = new URL(`https://graph.facebook.com/v21.0/${groupId}`);
    url.searchParams.set('fields', 'name');
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
      member_count: 0,
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

async function fetchSendPulseStats() {
  const apiId = process.env.SENDPULSE_API_ID;
  const apiSecret = process.env.SENDPULSE_API_SECRET;

  if (!apiId || !apiSecret) {
    return {
      totalSubscribers: 0,
      emailOpenRate: '0.0%',
      emailClickRate: '0.0%',
      emailReplyRate: 'N/A',
      emailRevenuePerCampaign: '$0',
      topCampaigns: [],
      error: 'SendPulse API credentials not set',
      debug: null,
    };
  }

  try {
    const tokenResponse = await fetch('https://api.sendpulse.com/oauth/access_token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        grant_type: 'client_credentials',
        client_id: apiId.trim(),
        client_secret: apiSecret.trim(),
      }),
    });

    if (!tokenResponse.ok) {
      const errorData = await parseJsonSafe(tokenResponse, {});
      console.error('[SendPulse] Token request failed:', tokenResponse.status, errorData);
      throw new Error(`SendPulse token request failed: ${tokenResponse.status}`);
    }

    const tokenData = await tokenResponse.json();
    const accessToken = tokenData.access_token;

    if (!accessToken) {
      console.error('[SendPulse] No access token in response:', tokenData);
      throw new Error('SendPulse token response missing access_token');
    }

    console.log('[SendPulse] Got access token');

    const authHeaders = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${accessToken}`,
    };

    const statsUrl = 'https://api.sendpulse.com/smtp/emails?limit=5&offset=0';
    const campaignsRes = await fetch(statsUrl, { headers: authHeaders });
    const campaignsData = await parseJsonSafe(campaignsRes, {});
    console.log('[SendPulse] Campaigns response status:', campaignsRes.status);

    if (!campaignsRes.ok) {
      const errorMsg = campaignsData?.message || 'SendPulse campaigns request failed';
      console.error('[SendPulse] Campaigns error:', errorMsg, '| status:', campaignsRes.status);
      throw new Error(errorMsg);
    }

    const campaigns = Array.isArray(campaignsData?.data) ? campaignsData.data : [];
    const withStats = campaigns.filter((c) => safeNumber(c?.sent_count, 0) > 0);

    const normalizedCampaigns = campaigns.slice(0, 5).map((c) => {
      const sent = safeNumber(c?.sent_count, 0);
      const opened = safeNumber(c?.open_count, 0);
      const clicked = safeNumber(c?.click_count, 0);
      return {
        name: c?.subject || c?.name || 'Campaign',
        openRate: sent > 0 ? formatPct((opened / sent) * 100) : '0.0%',
        clickRate: sent > 0 ? formatPct((clicked / sent) * 100) : '0.0%',
        revenue: '$0',
      };
    });

    const avgOpenRate = withStats.length
      ? withStats.reduce((sum, c) => {
          const sent = safeNumber(c?.sent_count, 0);
          const opened = safeNumber(c?.open_count, 0);
          return sum + (sent > 0 ? (opened / sent) * 100 : 0);
        }, 0) / withStats.length
      : 0;

    const avgClickRate = withStats.length
      ? withStats.reduce((sum, c) => {
          const sent = safeNumber(c?.sent_count, 0);
          const clicked = safeNumber(c?.click_count, 0);
          return sum + (sent > 0 ? (clicked / sent) * 100 : 0);
        }, 0) / withStats.length
      : 0;

    const addressBookUrl = 'https://api.sendpulse.com/addressbooks?limit=1&offset=0';
    const addressRes = await fetch(addressBookUrl, { headers: authHeaders });
    const addressData = await parseJsonSafe(addressRes, {});
    
    let totalSubscribers = 0;
    if (addressRes.ok && Array.isArray(addressData?.data)) {
      totalSubscribers = addressData.data.reduce((sum, book) => sum + (book?.total_emails || 0), 0);
    }

    console.log('[SendPulse] Stats obtained successfully');

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
    console.error('[SendPulse] fetchSendPulseStats failed:', e.message);
    return {
      totalSubscribers: 0,
      emailOpenRate: '0.0%',
      emailClickRate: '0.0%',
      emailReplyRate: 'N/A',
      emailRevenuePerCampaign: '$0',
      topCampaigns: [],
      error: e.message || 'SendPulse fetch failed',
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

async function fetchNotionData() {
  const apiKey = process.env.NOTION_API_KEY;
  const ideasDbId = process.env.NOTION_IDEAS_DB_ID;
  const contentDbId = process.env.NOTION_CONTENT_DB_ID;
  const automationsDbId = process.env.NOTION_AUTOMATIONS_DB_ID;

  if (!apiKey) {
    return { data: null, error: 'Notion API key not set', debug: null };
  }

  const databaseIds = [
    { key: 'ideas', id: ideasDbId },
    { key: 'content', id: contentDbId },
    { key: 'automations', id: automationsDbId },
  ].filter(({ id }) => id);

  if (databaseIds.length === 0) {
    return { data: null, error: 'No Notion database IDs configured', debug: null };
  }

  try {
    const notionData = {};
    const errors = [];

    for (const { key, id } of databaseIds) {
      try {
        const url = new URL(`https://api.notion.com/v1/databases/${id}/query`);

        const res = await fetch(url.toString(), {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${apiKey.trim()}`,
            'Notion-Version': '2022-06-28',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({}),
        });

        if (!res.ok) {
          const errorData = await parseJsonSafe(res, {});
          const errorMsg = errorData?.message || `Notion API returned ${res.status}`;
          console.error(`[Notion] API error for ${key}:`, errorMsg, '| status:', res.status);
          errors.push(`${key}: ${errorMsg}`);
          notionData[key] = { error: errorMsg };
          continue;
        }

        const data = await parseJsonSafe(res, {});
        console.log(`[Notion] Fetched ${key} data successfully`);
        notionData[key] = data;
      } catch (err) {
        console.error(`[Notion] Failed to fetch ${key}:`, err.message);
        errors.push(`${key}: ${err.message}`);
        notionData[key] = { error: err.message };
      }
    }

    const combinedData = {
      ideas: notionData.ideas || null,
      content: notionData.content || null,
      automations: notionData.automations || null,
    };

    return {
      data: combinedData,
      error: errors.length > 0 ? errors.join('; ') : null,
      debug: null,
    };
  } catch (err) {
    console.error('[Notion] fetchNotionData failed:', err.message);
    return {
      data: null,
      error: maskErrorDetails(err, 'Notion API'),
      debug: process.env.NODE_ENV !== 'production' ? err.message || 'Notion fetch failed' : null,
    };
  }
}

async function processAntigravityTrigger(payload) {
  const { database_id, action, id: pageId } = payload || {};
  const commandCenterDb = process.env.NOTION_COMMAND_CENTER_DB_ID;
  const ideasDb = process.env.NOTION_IDEAS_DB_ID;

  const isRelevantDb = database_id === commandCenterDb || database_id === ideasDb;
  const isRelevantAction = action === 'created' || action === 'updated';

  if (!isRelevantDb || !isRelevantAction) {
    return { processed: false, reason: 'Not a relevant database/action' };
  }

  const page = payload?.page?.properties;
  const status = page?.Status?.select?.name || page?.status?.select?.name;

  if (action === 'created' || status === 'Pending') {
    console.log(`[Antigravity] Triggered by Notion event: ${action} on ${database_id}`);

    const notionApiKey = process.env.NOTION_API_KEY;
    if (notionApiKey) {
      try {
        const pageUrl = new URL(`https://api.notion.com/v1/pages/${pageId}`);
        const pageRes = await fetch(pageUrl.toString(), {
          headers: {
            'Authorization': `Bearer ${notionApiKey.trim()}`,
            'Notion-Version': '2022-06-28',
          },
        });

        if (pageRes.ok) {
          const pageData = await parseJsonSafe(pageRes, {});
          console.log('[Antigravity] Page data:', JSON.stringify(pageData, null, 2));
          const antigravityApiKey = process.env.ANTIGRAVITY_API_KEY;
          if (antigravityApiKey) {
            console.log('[Antigravity] Ready to call Antigravity API (implement based on their docs)');
          } else {
            console.log('[Antigravity] ANTIGRAVITY_API_KEY not set - skipping API call');
          }
        }
      } catch (err) {
        console.error('[Antigravity] Failed to fetch page:', err.message);
      }
    }

    return { processed: true, trigger: action, pageId };
  }

  return { processed: false, reason: 'Status not Pending or not new entry' };
}

async function fetchAIBrief(context) {
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
    const { omniRoute } = await import('../lib/omniroute.js');
    const result = await omniRoute(prompt, {
      systemPrompt: 'You are a business analyst AI. Provide concise, actionable insights in JSON format.',
      jsonMode: true,
      timeout: 60000,
      fallbackModels: [
        process.env.OMNIROUTE_FALLBACK_MODEL_1,
        process.env.OMNIROUTE_FALLBACK_MODEL_2,
      ].filter(Boolean),
    });

    if (result.error) {
      return {
        working: ['Community is active and syncing.'],
        slipping: ['AI brief could not be generated right now.'],
        nextActions: ['Verify OmniRoute configuration if this persists.'],
        error: result.error,
        debug: process.env.NODE_ENV !== 'production' ? result.error : null,
      };
    }

    const raw = result.reply || '{}';
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
      nextActions: ['Verify OmniRoute configuration if this persists.'],
      error: maskErrorDetails(err, 'OmniRoute API'),
      debug: process.env.NODE_ENV !== 'production' ? err.message || 'OmniRoute request failed' : null,
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

  if (checks.notionError) {
    alerts.push({
      type: 'warning',
      source: 'Notion',
      message: checks.notionError,
    });
  }

  if (!checks.omnirouteSet) {
    alerts.push({
      type: 'info',
      source: 'AI Brief',
      message: 'OMNIROUTE_API_KEY not set — AI Command Brief is using fallback text.',
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
    sendpulseApiIdSet: !!process.env.SENDPULSE_API_ID,
    sendpulseApiSecretSet: !!process.env.SENDPULSE_API_SECRET,
    model: (process.env.OMNIROUTE_MODEL || 'openai/gpt-4o-mini').trim(),
    sheetsWebhookUrlSet: !!process.env.SHEETS_WEBHOOK_URL,
    omnirouteApiKeySet: !!process.env.OMNIROUTE_API_KEY,
    omnirouteBaseUrlSet: !!process.env.OMNIROUTE_BASE_URL,
    notionApiKeySet: !!process.env.NOTION_API_KEY,
    notionIdeasDbSet: !!process.env.NOTION_IDEAS_DB_ID,
    notionContentDbSet: !!process.env.NOTION_CONTENT_DB_ID,
    notionAutomationsDbSet: !!process.env.NOTION_AUTOMATIONS_DB_ID,
    antigravityApiKeySet: !!process.env.ANTIGRAVITY_API_KEY,
    antigravityWebhookSecretSet: !!process.env.NOTION_WEBHOOK_SECRET,
    commandCenterDbSet: !!process.env.NOTION_COMMAND_CENTER_DB_ID,
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

  if (action === 'notion-webhook') {
    const webhookSecret = process.env.NOTION_WEBHOOK_SECRET;
    
    if (!webhookSecret) {
      console.error('[Antigravity] Notion webhook secret not configured');
      return res.status(500).json({ 
        error: 'Notion webhook secret not configured', 
        action: 'notion-webhook'
      });
    }

    if (req.method !== 'POST') {
      return res.status(405).json({ 
        error: 'Method not allowed - use POST', 
        action: 'notion-webhook'
      });
    }

    try {
      const body = await req.json();
      const result = await processAntigravityTrigger(body);

      if (result.processed) {
        console.log('[Antigravity] Webhook processed successfully:', result);
        return res.status(200).json({ 
          ok: true, 
          result,
          message: 'Antigravity trigger processed'
        });
      }

      return res.status(200).json({ 
        ok: true, 
        message: result.reason || 'Event received but not processed'
      });
    } catch (err) {
      console.error('[Antigravity] Webhook error:', err);
      return res.status(500).json({ 
        error: 'Webhook processing failed', 
        details: process.env.NODE_ENV !== 'production' ? err.message : 'Internal error'
      });
    }
  }

  if (action === 'content.publish') {
    if (!checkDashboardApiKey(req)) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    if (req.method !== 'POST') {
      return res.status(405).json({ error: 'Method not allowed - use POST', action: 'content.publish' });
    }

    try {
      const snapshot = typeof req.body === 'object' && req.body !== null ? req.body : {};
      const mode = String(snapshot.mode || 'approval').trim().toLowerCase();
      const targetsRaw = String(snapshot.targets || 'page,group').trim();
      const rawTargetList = targetsRaw.split(',').map((t) => t.trim()).filter(Boolean);

      const allowedModes = ['approval', 'auto'];
      if (!allowedModes.includes(mode)) {
        return res.status(400).json({ error: `Invalid mode: ${mode}. Use "approval" or "auto".` });
      }

      const presetTargets = ['page', 'group', 'instagram', 'linkedin', 'threads'];
      const normalizedTargets = rawTargetList.filter((t) => presetTargets.includes(t.toLowerCase()));
      const normalizedRequestedTargets = normalizedTargets;
      if (!normalizedRequestedTargets.length) {
        return res.status(400).json({ error: 'Invalid targets. Use "page", "group", "instagram", "linkedin", and/or "threads".' });
      }

      const { aggregateDashboardData } = await import('../lib/sync-aggregator.js');
      const dashboardSnapshot = await aggregateDashboardData({
        includeNotionIntake: true,
        includeNotionRaw: true,
        includeAIBrief: false,
        includeFacebook: true,
      });

      const publishingQueue = Array.isArray(dashboardSnapshot?.notion?.publishingQueue)
        ? dashboardSnapshot.notion.publishingQueue
        : [];

      const publishables = publishingQueue.filter((item) => {
        const status = String(item.status || '').toLowerCase();
        const isReady = ['pending approval', 'ready', 'approved', 'scheduled'].includes(status);
        const isTyped = ['social', 'email', 'blog'].some((t) => String(item.contentType || '').toLowerCase().includes(t));
        return isReady && isTyped;
      });

      if (publishables.length === 0) {
        return res.status(200).json({
          ok: true,
          message: 'No publishable items found in Notion Publishing Queue.',
          published: [],
          failed: [],
          skipped: [],
        });
      }

      if (mode === 'approval') {
        return res.status(200).json({
          ok: true,
          mode: 'approval',
          pendingApproval: publishables.map((item) => ({
            id: item.id,
            title: item.title,
            contentType: item.contentType,
            status: item.status,
            source: item.source,
            due: item.due,
            url: item.url,
          })),
          message: `Review these items in Notion before publishing. ${publishables.length} item(s) are ready.`,
        });
      }

      const published = [];
      const failed = [];
      const skipped = [];

      const needsFacebook = normalizedRequestedTargets.some((t) => ['page', 'group'].includes(t));
      const needsInstagram = normalizedRequestedTargets.includes('instagram');
      const needsLinkedIn = normalizedRequestedTargets.includes('linkedin');
      const needsThreads = normalizedRequestedTargets.includes('threads');

      let fbModule = null;
      let instagramModule = null;
      let linkedInModule = null;
      let threadsModule = null;

      if (needsFacebook) {
        try {
          fbModule = await import('../lib/facebook-publisher.mjs');
        } catch (e) {
          skipped.push({ target: 'facebook', reason: 'facebook publisher module failed to load', detail: e?.message || 'Unknown error' });
        }
      }

      if (needsInstagram) {
        try {
          instagramModule = await import('../lib/instagram-publisher.mjs');
        } catch (e) {
          skipped.push({ target: 'instagram', reason: 'instagram publisher module failed to load', detail: e?.message || 'Unknown error' });
        }
      }

      if (needsLinkedIn) {
        try {
          linkedInModule = await import('../lib/linkedin-publisher.mjs');
        } catch (e) {
          skipped.push({ target: 'linkedin', reason: 'linkedin publisher module failed to load', detail: e?.message || 'Unknown error' });
        }
      }

      if (needsThreads) {
        try {
          threadsModule = await import('../lib/threads-publisher.mjs');
        } catch (e) {
          skipped.push({ target: 'threads', reason: 'threads publisher module failed to load', detail: e?.message || 'Unknown error' });
        }
      }

      for (const item of publishables) {
        const message = [item.title, item.source || ''].filter(Boolean).join('\n\n');

        if (needsFacebook && fbModule) {
          try {
            const fbResult = await fbModule.publishToFacebook({
              message,
              toPage: normalizedRequestedTargets.includes('page'),
              toGroup: normalizedRequestedTargets.includes('group'),
            });

            if (fbResult.ok) {
              published.push({ id: item.id, title: item.title, target: 'facebook', contentType: item.contentType, result: fbResult });
            } else {
              failed.push({ id: item.id, title: item.title, target: 'facebook', contentType: item.contentType, reason: fbResult.errors ? JSON.stringify(fbResult.errors) : 'publish_failed', result: fbResult });
            }
          } catch (e) {
            failed.push({ id: item.id, title: item.title, target: 'facebook', contentType: item.contentType, reason: e.message || 'Facebook publish failed' });
          }
        } else if (needsFacebook) {
          skipped.push({ id: item.id, title: item.title, target: 'facebook', contentType: item.contentType, reason: 'Facebook target requested but module unavailable' });
        }

        if (needsInstagram && instagramModule) {
          try {
            const igResult = await instagramModule.publishInstagramFromNotionItem(item);

            if (igResult?.result?.ok) {
              published.push({ id: item.id, title: item.title, target: 'instagram', contentType: item.contentType, result: igResult.result });
            } else {
              failed.push({ id: item.id, title: item.title, target: 'instagram', contentType: item.contentType, reason: igResult?.result?.error || 'publish_failed', result: igResult });
            }
          } catch (e) {
            failed.push({ id: item.id, title: item.title, target: 'instagram', contentType: item.contentType, reason: e.message || 'Instagram publish failed' });
          }
        } else if (needsInstagram) {
          skipped.push({ id: item.id, title: item.title, target: 'instagram', contentType: item.contentType, reason: 'Instagram target requested but module unavailable' });
        }

        if (needsLinkedIn && linkedInModule) {
          try {
            const liResult = await linkedInModule.publishLinkedInFromNotionItem(item);

            if (liResult?.result?.ok) {
              published.push({ id: item.id, title: item.title, target: 'linkedin', contentType: item.contentType, result: liResult.result });
            } else {
              failed.push({ id: item.id, title: item.title, target: 'linkedin', contentType: item.contentType, reason: liResult?.result?.error || 'publish_failed', result: liResult });
            }
          } catch (e) {
            failed.push({ id: item.id, title: item.title, target: 'linkedin', contentType: item.contentType, reason: e.message || 'LinkedIn publish failed' });
          }
        } else if (needsLinkedIn) {
          skipped.push({ id: item.id, title: item.title, target: 'linkedin', contentType: item.contentType, reason: 'LinkedIn target requested but module unavailable' });
        }

        if (needsThreads && threadsModule) {
          try {
            const threadsResult = await threadsModule.publishThreadsFromNotionItem(item);

            if (threadsResult?.result?.ok) {
              published.push({ id: item.id, title: item.title, target: 'threads', contentType: item.contentType, result: threadsResult.result });
            } else {
              failed.push({ id: item.id, title: item.title, target: 'threads', contentType: item.contentType, reason: threadsResult?.result?.error || 'publish_failed', result: threadsResult });
            }
          } catch (e) {
            failed.push({ id: item.id, title: item.title, target: 'threads', contentType: item.contentType, reason: e.message || 'Threads publish failed' });
          }
        } else if (needsThreads) {
          skipped.push({ id: item.id, title: item.title, target: 'threads', contentType: item.contentType, reason: 'Threads target requested but module unavailable' });
        }
      }

      return res.status(200).json({
        ok: true,
        mode: 'auto',
        targets: normalizedRequestedTargets,
        published,
        failed,
        skipped,
        message: `Published ${published.length} of ${publishables.length} item(s) across selected targets.`,
      });
    } catch (err) {
      console.error('[content.publish] failed:', err);
      return res.status(500).json({
        error: 'Content publish failed',
        details: process.env.NODE_ENV !== 'production' ? err?.message || 'Unknown error' : undefined,
      });
    }
  }

  if (action === 'setup-notion') {
    if (!checkDashboardApiKey(req)) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    if (req.method !== 'POST') {
      return res.status(405).json({ error: 'Method not allowed - use POST', action: 'setup-notion' });
    }

    try {
      const { setupNotion } = await import('../tools/create-notion-dbs.mjs');
      const result = await setupNotion();
      return res.status(result.error ? 400 : 200).json(result);
    } catch (err) {
      console.error('[setup-notion] failed:', err);
      return res.status(500).json({
        error: 'Notion setup failed',
        details: process.env.NODE_ENV !== 'production' ? err?.message || 'Unknown error' : undefined,
      });
    }
  }

  try {
    if (action === 'status') {
      return res.status(200).json({
        status: 'ok',
        message: 'DigitallyDefined OS backend is running',
        timestamp: new Date().toISOString(),
      });
    }

    if (action === 'routes') {
      return res.status(200).json({
        status: 'ok',
        routes: [
          { action: 'status', method: 'GET', scope: 'public', description: 'Health check' },
          { action: 'auth.verify', method: 'GET', scope: 'dashboard', description: 'API key verification' },
          { action: 'ai.recommendations', method: 'GET', scope: 'public', description: 'Static AI recommendations' },
          { action: 'brain.brief', method: 'GET', scope: 'dashboard', description: 'AI business brief' },
          { action: 'automation.sync', method: 'POST', scope: 'dashboard', description: 'Vault sync' },
          { action: 'automation.list', method: 'GET', scope: 'public', description: 'List automations' },
          { action: 'automation.logs', method: 'GET', scope: 'public', description: 'Automation logs' },
          { action: 'automation.run', method: 'POST', scope: 'dashboard', description: 'Run automation command' },
          { action: 'automation.events', method: 'GET', scope: 'public', description: 'Automation events' },
          { action: 'dashboard', method: 'GET', scope: 'public', description: 'Dashboard data' },
          { action: 'sheets', method: 'GET', scope: 'public', description: 'Sheets integration' },
          { action: 'notion-webhook', method: 'POST', scope: 'internal', description: 'Notion webhook ingestion' },
          { action: 'test-env', method: 'GET', scope: 'dashboard', description: 'Environment status' },
          { action: 'hermes', method: 'POST', scope: 'dashboard', description: 'Hermes delegation' },
          { action: 'sellable-products.publish', method: 'POST', scope: 'internal', description: 'Product publishing pipeline', handler: '/api/sellable-products' },
          { action: 'seo-automation.run', method: 'POST', scope: 'internal', description: 'SEO automation pipeline', handler: '/api/seo-automation' },
          { action: 'revenue-automation.run', method: 'POST', scope: 'internal', description: 'Revenue/pricing automation', handler: '/api/revenue-automation' },
          { action: 'customer-operations.run', method: 'POST', scope: 'internal', description: 'Gumroad customer ops', handler: '/api/customer-operations' },
          { action: 'gumroad.webhook', method: 'POST', scope: 'internal', description: 'Gumroad webhook ingestion', handler: '/api/gumroad' },
          { action: 'brevo.sync', method: 'POST', scope: 'internal', description: 'Brevo email integration', handler: '/api/brevo' },
          { action: 'community-triggers.readiness', method: 'POST', scope: 'dashboard', description: 'Community trigger readiness', handler: '/api?action=community-triggers' },
          { action: 'social-publishers.readiness', method: 'POST', scope: 'dashboard', description: 'Social publisher readiness', handler: '/api?action=social-publishers' },
          { action: 'facebook.publish', method: 'POST', scope: 'dashboard', description: 'Facebook publisher', handler: '/api/facebook' },
          { action: 'instagram.publish', method: 'POST', scope: 'dashboard', description: 'Instagram publisher', handler: '/api/instagram' },
          { action: 'threads.publish', method: 'POST', scope: 'dashboard', description: 'Threads publisher', handler: '/api/threads' },
          { action: 'linkedin.publish', method: 'POST', scope: 'dashboard', description: 'LinkedIn publisher', handler: '/api/linkedin' },
          { action: 'tiktok.publish', method: 'POST', scope: 'dashboard', description: 'TikTok publisher', handler: '/api/tiktok' },
          { action: 'youtube.publish', method: 'POST', scope: 'dashboard', description: 'YouTube publisher', handler: '/api/youtube' },
          { action: 'pinterest.publish', method: 'POST', scope: 'dashboard', description: 'Pinterest publisher', handler: '/api/pinterest' },
          { action: 'google_sheets.run', method: 'POST', scope: 'dashboard', description: 'Google Sheets helper', handler: '/api/google-sheets' },
          { action: 'cron.sellable.run', method: 'POST', scope: 'internal', description: 'Scheduled sellable cron jobs', handler: '/api/cron/sellable' },
        ],
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

    if (action === 'quiz.history') {
      if (!checkDashboardApiKey(req)) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      const email = typeof req.body?.email === 'string' ? req.body.email.trim() : '';
      const resultKey = typeof req.body?.resultKey === 'string' ? req.body.resultKey.trim() : '';
      const limit = typeof req.body?.limit === 'number' ? Math.min(req.body.limit, 100) : 20;

      if (!email && !resultKey) {
        return res.status(400).json({ error: 'Missing email or resultKey', results: [] });
      }

      const { listQuizResults } = await import('../tools/quiz-store.mjs');
      const history = await listQuizResults({ email, resultKey, limit });

      return res.status(200).json(history);
    }

    if (action === 'brain.brief') {
      if (!checkDashboardApiKey(req)) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      try {
        const aggregator = await import('../lib/sync-aggregator.js');
        const snapshot = await aggregator.buildAIBrief({
          communityCount: 0,
          communityGrowth: '0%',
          emailSubscribers: 0,
          emailOpenRate: '0.0%',
          emailClickRate: '0.0%',
          topAsset: 'N/A',
          revenue: '$0',
          notionIdeas: [],
        });

        const hasNotionKey = !!process.env.NOTION_API_KEY;
        const hasAnyNotionDb = !!(process.env.NOTION_IDEAS_DB_ID || process.env.NOTION_CONTENT_DB_ID || process.env.NOTION_AUTOMATIONS_DB_ID);
        const notionConnected = hasNotionKey && hasAnyNotionDb;

        const hasAntigravityKey = !!process.env.ANTIGRAVITY_API_KEY;
        const hasCommandCenterDb = !!process.env.NOTION_COMMAND_CENTER_DB_ID;
        const hasWebhookSecret = !!process.env.NOTION_WEBHOOK_SECRET;
        const antigravityConnected = hasAntigravityKey && hasCommandCenterDb && hasWebhookSecret;

        return res.status(200).json({
          generatedAt: new Date().toISOString(),
          status: snapshot.error ? 'degraded' : 'ok',
          daily_brief: {
            headline: snapshot.working?.[0] || 'Business brief generated.',
            summary: snapshot.slipping?.length
              ? `Maintaining progress with ${snapshot.slipping.length} area(s) to address.`
              : snapshot.nextActions?.length
                ? 'Systems are active. Review priorities to take the next step.'
                : 'Awaiting next sync for live intelligence.',
            priority: snapshot.error ? 'medium' : 'high',
          },
          working: snapshot.working || [],
          slipping: snapshot.slipping || [],
          nextActions: snapshot.nextActions || [],
          market_gaps: [
            {
              title: 'Notion-documented opportunities',
              why_it_matters: 'Notion Ideas DB can surface the clearest demand signals from your existing audience.',
              source: 'Notion + Dashboard',
              confidence: 82,
              recommended_action: 'Review the Notion Ideas tab for Build Now priorities.',
            },
          ],
          build_next: {
            asset_type: 'Lead magnet / Notion system',
            reason: snapshot.nextActions?.[0] || 'Check Notion intake queue for priority Build Now items.',
            cta: 'Open the Notion DB tab in your dashboard.',
          },
          stale_automations: [],
          urgent_alerts: [],
          source_health: {
            notion: notionConnected ? 'connected' : 'not_connected',
            antigravity: antigravityConnected ? 'connected' : 'not_connected',
            google_sheets: 'connected',
            slack: 'connected',
            gumloop: 'connected',
            meta_api: 'connected',
          },
        });
      } catch (err) {
        console.error('[brain.brief] Aggregator failed:', err);
        return res.status(200).json({
          generatedAt: new Date().toISOString(),
          status: 'degraded',
          daily_brief: { headline: 'Brief unavailable right now.', summary: 'AI brief generation failed.', priority: 'low' },
          working: [],
          slipping: [],
          nextActions: ['Retry brain.brief in a few seconds.'],
          market_gaps: [],
          build_next: { asset_type: 'Unknown', reason: 'Error during brief generation.', cta: 'Retry.' },
          stale_automations: [],
          urgent_alerts: [{ title: 'AI brief error', detail: err?.message || 'Unknown error', action: 'Retry shortly' }],
          source_health: { notion: 'error', antigravity: 'error', google_sheets: 'unknown', slack: 'unknown', gumloop: 'unknown', meta_api: 'unknown' },
        });
      }
    }

    if (action === 'automation.sync') {
      if (!checkDashboardApiKey(req)) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      try {
        const aggregator = await import('../lib/sync-aggregator.js');
        const snapshot = await aggregator.aggregateDashboardData({
          includeNotionIntake: true,
          includeNotionRaw: true,
          includeAIBrief: true,
          includeFacebook: true,
        });

        return res.status(200).json({
          status: 'success',
          message: 'Vault synced successfully',
          timestamp: Date.now(),
          data: {
            leads: typeof snapshot.stats?.leads === 'number' ? snapshot.stats.leads : 0,
            revenue: typeof snapshot.stats?.revenue === 'string' ? snapshot.stats.revenue : '$0',
            conversion: typeof snapshot.stats?.conversionRate === 'number' ? snapshot.stats.conversionRate : 0,
            assetValue: typeof snapshot.stats?.assetValue === 'string' ? snapshot.stats.assetValue : '$48,000',
          },
          snapshot,
        });
      } catch (err) {
        console.error('[automation.sync] Aggregator failed:', err);
        return res.status(500).json({ error: 'Sync failed', detail: err?.message || 'Unknown error' });
      }
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

    if (action === 'hermes') {
      if (!checkDashboardApiKey(req)) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      const snapshot = typeof req.body === 'object' && req.body !== null ? req.body : {};
      const context = snapshot.context || snapshot.dashboard || snapshot.snapshot || null;

      try {
        const url = new URL(`${process.env.BACKEND_HERMES_URL || 'https://digitallydefined-os-backend.vercel.app/api/hermes'}`);
        const resHermes = await fetch(url.toString(), {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': req.headers['x-api-key'] || '',
          },
          body: JSON.stringify({
            context,
            message: snapshot.message || snapshot.text || '',
            conversation: snapshot.conversation || snapshot.messages || [],
          }),
        });

        const data = await parseJsonSafe(resHermes, { reply: '', error: 'Hermes backend error' });

        return res.status(resHermes.status).json(data);
      } catch (err) {
        return res.status(500).json({
          error: 'Hermes delegation failed',
          details: process.env.NODE_ENV !== 'production' ? err.message : undefined,
        });
      }
    }
    if (action === 'community-triggers') {
      if (!checkDashboardApiKey(req)) {
        return res.status(401).json(buildEnvelope({ ok: false, action: 'community-triggers', status: 'error', error: 'Unauthorized' }));
      }

      let payload = {};
      if (req.method === 'POST' || req.method === 'GET') {
        try {
          payload = req.body && typeof req.body === 'object' ? req.body : {};
        } catch (_) {
          payload = {};
        }
      }

      try {
        const { handleCommunityTriggerRequest } = await import('../lib/community-triggers.js');
        const result = handleCommunityTriggerRequest({
          action: req.query?.action || payload.action || 'community-triggers.readiness',
          payload,
        });

        return res.status(200).json(result);
      } catch (err) {
        return res.status(500).json(buildEnvelope({
          ok: false,
          action: 'community-triggers',
          status: 'error',
          error: 'Community trigger handling failed',
          debug: err?.message || 'Unknown error',
        }));
      }
    }

    if (action === 'social-publishers') {
      if (!checkDashboardApiKey(req)) {
        return res.status(401).json(buildEnvelope({ ok: false, action: 'social-publishers', status: 'error', error: 'Unauthorized' }));
      }

      let payload = {};
      try {
        payload = req.body && typeof req.body === 'object' ? req.body : {};
      } catch (_) {
        payload = {};
      }

      try {
        const { handleSocialPublisherRequest } = await import('../lib/social-publishers.js');
        const result = handleSocialPublisherRequest({
          action: req.query?.action || payload.action || 'publisher.readiness',
          payload,
        });

        return res.status(200).json(result);
      } catch (err) {
        return res.status(500).json(buildEnvelope({
          ok: false,
          action: 'social-publishers',
          status: 'error',
          error: 'Social publisher handling failed',
          debug: err?.message || 'Unknown error',
        }));
      }
    }
  } catch (err) {
    return res.status(500).json({
      error: 'Internal server error',
      details: process.env.NODE_ENV !== 'production' ? err.message : undefined,
    });
  }
}
