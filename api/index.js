// /api/index.js
// Production-ready unified API handler for Vercel

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

    const res = await fetch(url.toString());
    const data = await parseJsonSafe(res, {});

    if (!res.ok) throw new Error(data?.error?.message || 'Facebook API error');

    return {
      name: data?.name || null,
      member_count: safeNumber(data?.member_count, 0),
      error: null,
    };
  } catch (e) {
    return {
      name: null,
      member_count: 0,
      error: e.message || 'Facebook fetch failed',
    };
  }
}

async function fetchSendPulseToken() {
  const userId = process.env.SENDPULSE_API_USER_ID;
  const secret = process.env.SENDPULSE_API_SECRET;
  if (!userId || !secret) return null;

  try {
    const res = await fetch('https://api.sendpulse.com/oauth/access_token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        grant_type: 'client_credentials',
        client_id: userId,
        client_secret: secret,
      }),
    });

    const data = await parseJsonSafe(res, {});
    if (!res.ok) return null;
    return data?.access_token || null;
  } catch {
    return null;
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
          return sum + (sent > 0 ? (clicked / sent) * 100 : 0);
        }, 0) / withStats.length
      : 0;

    return {
      totalSubscribers,
      emailOpenRate: formatPct(avgOpenRate),
      emailClickRate: formatPct(avgClickRate),
      emailReplyRate: 'N/A',
      emailRevenuePerCampaign: '$0',
      topCampaigns: normalizedCampaigns,
      
