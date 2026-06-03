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
  'sheets',
  'notion-webhook',
  'test-env',
  'hermes',
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
  'sheets',
  'test-env',
]);

const POST_ONLY_ACTIONS = new Set([
  'automation.sync',
  'automation.run',
  'notion-webhook',
  'hermes',
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
    // NOTE: member_count is restricted by Facebook and requires app review.
    // We fetch name only; member_count comes from Google Sheets.
    // Using v21.0 — current stable Graph API version as of 2025.
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

async function fetchBrevoStats() {
  const apiKey = process.env.BREVO_API_KEY;
  const listId = process.env.BREVO_LIST_ID;

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
      'Content-Type': 'application/json',
      'api-key': apiKey.trim(),
    };

    // Fetch contacts count from list
    const listUrl = listId
      ? `https://api.brevo.com/v3/contacts/lists/${listId}/contacts?limit=1&offset=0`
      : 'https://api.brevo.com/v3/contacts?limit=1&offset=0';

    const contactsRes = await fetch(listUrl, { headers });
    const contactsData = await parseJsonSafe(contactsRes, {});

    console.log('[Brevo] Contacts response status:', contactsRes.status);
    console.log('[Brevo] Contacts response body:', JSON.stringify(contactsData));

    if (!contactsRes.ok) {
      const errorMsg = contactsData?.message || 'Brevo contacts request failed';
      console.error('[Brevo] Contacts error:', errorMsg, '| status:', contactsRes.status);
      throw new Error(errorMsg);
    }

    const totalSubscribers = contactsData?.count || contactsData?.contacts?.length || 0;

    // Fetch campaign stats
    const campaignsRes = await fetch('https://api.brevo.com/v3/emailCampaigns?limit=5&offset=0', {
      headers,
    });

    const campaignsData = await parseJsonSafe(campaignsRes, {});

    console.log('[Brevo] Campaigns response status:', campaignsRes.status);
    console.log('[Brevo] Campaigns response body:', JSON.stringify(campaignsData));

    if (!campaignsRes.ok) {
      const errorMsg = campaignsData?.message || 'Brevo campaigns request failed';
      console.error('[Brevo] Campaigns error:', errorMsg, '| status:', campaignsRes.status);
      throw new Error(errorMsg);
    }

    const campaigns = Array.isArray(campaignsData?.campaigns) ? campaignsData.campaigns : [];

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
          return sum + (sent > 0 ? (clicked / sent) * 100 : 0);
        }, 0) / withStats.length
      : 0;

    console.log('[Brevo] Stats obtained successfully');

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
    console.error('[Brevo] fetchBrevoStats failed:', e.message);
    return {
      totalSubscribers: 0,
      emailOpenRate: '0.0%',
      emailClickRate: '0.0%',
      emailReplyRate: 'N/A',
      emailRevenuePerCampaign: '$0',
      topCampaigns: [],
      error: maskErrorDetails(e, 'Brevo API'),
      debug: process.env.NODE_ENV !== 'production' ? e.message || 'Brevo fetch failed' : null,
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
  // Extract relevant data from Notion webhook payload
  const { database_id, action, id: pageId } = payload || {};

  // Only trigger for specific databases and actions
  const commandCenterDb = process.env.NOTION_COMMAND_CENTER_DB_ID;
  const ideasDb = process.env.NOTION_IDEAS_DB_ID;

  const isRelevantDb = database_id === commandCenterDb || database_id === ideasDb;
  const isRelevantAction = action === 'created' || action === 'updated';

  if (!isRelevantDb || !isRelevantAction) {
    return { processed: false, reason: 'Not a relevant database/action' };
  }

  // Check if status changed to 'Pending' or new entry was created
  const page = payload?.page?.properties;
  const status = page?.Status?.select?.name || page?.status?.select?.name;

  if (action === 'created' || status === 'Pending') {
    // Log the trigger
    console.log(`[Antigravity] Triggered by Notion event: ${action} on ${database_id}`);

    // Fetch full page details to get command/idea data
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
          // TODO: Process pageData and send to Antigravity API
          // When you have Antigravity API key, call it here
          const antigravityApiKey = process.env.ANTIGRAVITY_API_KEY;
          if (antigravityApiKey) {
            // Example: POST to Antigravity webhook or API
            // const agUrl = new URL('https://api.antigravity.so/v1/workflows/trigger');
            // await fetch(agUrl.toString(), {
            //   method: 'POST',
            //   headers: { 'Authorization': `Bearer ${antigravityApiKey}`, 'Content-Type': 'application/json' },
            //   body: JSON.stringify({ pageId, database_id, action, pageData }),
            // });
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

  if (checks.notionError) {
    alerts.push({
      type: 'warning',
      source: 'Notion',
      message: checks.notionError,
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
    brevoApiKeySet: !!process.env.BREVO_API_KEY,
    brevoListIdSet: !!process.env.BREVO_LIST_ID,
    model: (process.env.MODEL || 'llama-3.3-70b-versatile').trim(),
    sheetsWebhookUrlSet: !!process.env.SHEETS_WEBHOOK_URL,
    groqApiKeySet: !!process.env.GROQ_API_KEY,
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

  // Handle Notion webhook for Antigravity triggers
  if (action === 'notion-webhook') {
    const webhookSecret = process.env.NOTION_WEBHOOK_SECRET;
    
    if (!webhookSecret) {
      console.error('[Antigravity] Notion webhook secret not configured');
      return res.status(500).json({ 
        error: 'Notion webhook secret not configured',
        action: 'notion-webhook'
      });
    }

    // Notion webhooks use POST
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
      // Dynamically check connection status
      const hasNotionKey = !!process.env.NOTION_API_KEY;
      const hasAnyNotionDb = !!(process.env.NOTION_IDEAS_DB_ID || process.env.NOTION_CONTENT_DB_ID || process.env.NOTION_AUTOMATIONS_DB_ID);
      const notionConnected = hasNotionKey && hasAnyNotionDb;

      const hasAntigravityKey = !!process.env.ANTIGRAVITY_API_KEY;
      const hasCommandCenterDb = !!process.env.NOTION_COMMAND_CENTER_DB_ID;
      const hasWebhookSecret = !!process.env.NOTION_WEBHOOK_SECRET;
      const antigravityConnected = hasAntigravityKey && hasCommandCenterDb && hasWebhookSecret;

      return res.status(200).json({
        generatedAt: new Date().toISOString(),
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
          notion: notionConnected ? 'connected' : 'not_connected',
          antigravity: antigravityConnected ? 'connected' : 'not_connected',
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

    if (action === 'hermes') {
      // Hermes AI assistant endpoint - accepts dashboard snapshot and user message, returns AI reply
      if (!checkDashboardApiKey(req)) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      try {
        const body = await req.json();
        const message = body?.message;

        if (!message || typeof message !== 'string') {
          return res.status(400).json({ error: 'Missing or invalid message field' });
        }

        // Use Groq to generate a response
        const groqApiKey = process.env.GROQ_API_KEY;
        const model = (process.env.MODEL || 'llama-3.3-70b-versatile').trim();

        if (!groqApiKey) {
          // Fallback response if Groq is not configured
          return res.status(200).json({
            reply: 'Hermes is ready but AI model is not configured. Please set GROQ_API_KEY to enable AI responses.',
          });
        }

        const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${groqApiKey.trim()}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model,
            messages: [
              {
                role: "system",
                content: "You are Hermes, the DigitallyDefined business partner. Respond using plain text only. No markdown, no formatting, no lists, no symbols. Use simple sentences. You help me grow the digital assets I already have. You evaluate my assets based on leverage, traffic potential, monetization potential, speed of execution, and long term compounding value. You help me choose which assets to build first so I can show Gen X women real proof. You understand that digital assets include websites, rank and rent sites, niche content sites, email lists, digital products, templates, content hubs, and automation systems. You help me decide which ones have the highest return with the least friction. You always think in terms of working smarter, not harder. You focus on leverage, automation, and compounding results. You help me build assets that grow over time and become examples for Gen X women who need to see what is possible. You understand that Gen X women trust results they can see. You help me build assets that become evidence, demonstrations, and case studies. You help me think in data, patterns, and strategy. You help me build digital real estate that supports me and also teaches other women how to do the same."
              },
              { role: 'user', content: message },
            ],
            temperature: 0.35,
            max_tokens: 650,
          }),
        });

        const data = await parseJsonSafe(res, {});

        if (!res.ok) {
          const errorMsg = data?.error?.message || 'Groq API error';
          console.error('[Hermes] Groq API error:', errorMsg);
          return res.status(500).json({
            error: 'AI service error',
            reply: 'Sorry, I encountered an error processing your request. Please try again.',
          });
        }

        const reply = data?.choices?.[0]?.message?.content || 'I could not generate a response.';

        return res.status(200).json({ reply });
      } catch (err) {
        console.error('[Hermes] Error:', err);
        return res.status(500).json({
          error: 'Hermes request failed',
          reply: 'Sorry, I encountered an error. Please try again.',
        });
      }
    }

    if (action === 'automation.events') {
      return res.status(200).json({
        status: 'success',
        events: [{ id: 'evt-001', type: 'sync', timestamp: Date.now() }],
      });
    }

    if (action === 'sheets') {
      if (!checkDashboardApiKey(req)) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      const sheetsUrl = process.env.SHEETS_WEBHOOK_URL;
      if (!sheetsUrl) {
        return res.status(500).json({ error: 'Sheets webhook URL not configured' });
      }

      try {
        const url = new URL(sheetsUrl);
        url.searchParams.set('action', 'dashboard');
        url.searchParams.set('t', String(Date.now()));

        const response = await fetch(url.toString(), {
          headers: { 'Cache-Control': 'no-store' },
        });

        if (!response.ok) {
          throw new Error(`Sheets returned ${response.status}`);
        }

        const data = await parseJsonSafe(response, {});
        return res.status(200).json(data);
      } catch (error) {
        console.error('Sheets proxy error:', error);
        return res.status(500).json({
          error: 'Sheets fetch failed',
          details: process.env.NODE_ENV !== 'production' ? error.message : 'An internal error occurred.',
        });
      }
    }

    if (action === 'dashboard') {
      if (!checkDashboardApiKey(req)) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      const [fbData, brevoData, sheetsResult, notionResult] = await Promise.all([
        fetchFacebookGroup(),
        fetchBrevoStats(),
        fetchSheetsData(),
        fetchNotionData(),
      ]);

      const spData = brevoData;
      const sheetsData = sheetsResult.data;
      const notionData = notionResult.data;

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
        revenue,
        communityGrowth,
      });

      const alerts = buildAlerts({
        facebookError: fbData?.error,
        emailError: spData?.error,
        sheetsError: sheetsResult?.error,
        notionError: notionResult?.error,
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
            brevo: spData?.debug || null,
            sheets: sheetsResult?.debug || null,
            notion: notionResult?.debug || null,
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
        notion: notionData,
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
      details: process.env.NODE_ENV !== 'production'
        ? err?.message || 'Unknown error'
        : 'An internal error occurred.',
    });
  }
}