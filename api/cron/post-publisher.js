import {
  FOLLOWUP_DAYS,
  DAY_META,
  buildIndicator,
  buildMessage,
} from '../lib/followup-messages.js';
import { enrichContext
import { storeRoadmap } from './roadmaps/store.js';
import { appendLog, isDuplicate } from '../lib/cron-dedup-logger.js';

const ALLOWED_POST_TYPES = new Set([
  'instagram',
  'threads',
  'facebook',
  'community',
  'engagement-prompt',
  'weekly-wins',
]);

const DEFAULT_POST_TEMPLATES = {
  instagram: [
    'daily-micro',
    'daily-tool-promo',
    'daily-principle',
    'weekly-community-prompt',
    'monthly-niche-challenge',
  ],
  threads: [
    'daily-principle',
    'weekly-niche-check',
    'daily-tool-promo',
    'weekly-community-prompt',
  ],
  facebook: [
    'weekly-community-prompt',
    'weekly-wins',
    'monthly-portfolio-review',
    'daily-principle',
  ],
  community: [
    'weekly-community-prompt',
    'weekly-wins',
    'weekly-niche-check',
    'monthly-niche-challenge',
  ],
  'engagement-prompt': [
    'weekly-community-prompt',
    'weekly-niche-check',
  ],
  'weekly-wins': [
    'weekly-wins',
    'monthly-portfolio-review',
  ],
};

function parseBody(req) {
  const raw = typeof req.body === 'string' ? req.body : null;
  if (!raw) return {};
  try { return JSON.parse(raw || '{}'); } catch { return {}; }
}

function parsePostType(req) {
  const segments = String(req.url || req.path || '').split('/').map((s) => s.trim()).filter(Boolean);
  const last = segments[segments.length - 1] || '';
  return ALLOWED_POST_TYPES.has(last.toLowerCase()) ? last.toLowerCase() : null;
}

function normalizePostEntry(body, postType) {
  const ctx = enrichContext(body);
  const entry = {
    source: ctx.source || 'cron',
    postType,
    resultKey: ctx.resultKey || null,
    templateIds: Array.isArray(ctx.templates) ? ctx.templates : [],
    postText: ctx.postText || '',
    contentSummary: ctx.contentSummary || null,
    tags: Array.isArray(body.tags) ? body.tags : [],
    status: 'pending',
    createdAt: new Date().toISOString(),
  };
  if (postType) entry.tags.push(`post-${postType}`);
  entry.tags.push('cron-scaffold');
  return { entry, ctx };
}

function validateTemplate(entry) {
  const allowed = entry.templateIds.filter((id) => {
    if (!id) return false;
    if (ALLOWED_POST_TYPES.has(id)) return false;
    return true;
  });
  return allowed.length > 0 ? allowed : ['daily-micro'];
}

function applyCors(req, res) {
  const origin = req.headers.origin || 'https://digitallydefined.online';
  res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-api-key');
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Vary', 'Origin');
}

function checkApiKey(req, res) {
  const expected = String(process.env.DASHBOARD_API_KEY || process.env.VITE_DASHBOARD_API_KEY || '').trim();
  if (!expected) return true;
  const provided = String(req.headers['x-api-key'] || req.headers['authorization'] || '').trim();
  return provided === expected;
}

async function buildListResponse(postType, body) {
  const ctx = enrichContext(body);
  const suggested = DEFAULT_POST_TEMPLATES[postType] || ['daily-micro'];
  return {
    ok: true,
    postType,
    suggestedTemplates: suggested,
    availableTemplates: suggested,
    context: {
      source: ctx.source,
      resultKey: ctx.resultKey,
      scorecardTier: ctx.scorecardTier,
      calculatorInsight: ctx.calculatorInsight,
      pillarSummary: ctx.pillarSummary,
      niche: ctx.niche,
      tool: ctx.tool,
    },
    postText: ctx.postText || '',
  };
}

async function buildPostResponse(entry, ctx) {
  const saved = await storeRoadmap(entry);
  return {
    ok: true,
    id: saved?.id || null,
    postType: entry.postType,
    status: entry.status,
    templateIds: entry.templateIds,
    postText: entry.postText,
    contentSummary: entry.contentSummary,
    context: {
      source: ctx.source,
      resultKey: ctx.resultKey,
      scorecardTier: ctx.scorecardTier,
      calculatorInsight: ctx.calculatorInsight,
      pillarSummary: ctx.pillarSummary,
      niche: ctx.niche,
      tool: ctx.tool,
    },
    tags: entry.tags,
    ts: new Date().toISOString(),
  };
}

export default async function handler(req, res) {
  applyCors(req, res);
  if (req.method === 'OPTIONS') return res.status(200).end();

  const postType = parsePostType(req);

  if (req.method === 'GET') {
    const body = parseBody(req);
    const response = await buildListResponse(postType, body);
    return res.status(200).json(response);
  }

  if (req.method === 'POST') {
    if (!checkApiKey(req, res)) {
      return res.status(401).json({ error: 'Unauthorized - Invalid or missing API key' });
    }

    const body = parseBody(req);
    if (!postType) {
      return res.status(400).json({ error: 'Missing post type in URL path. Use /api/cron/post-instagram, /post-threads, /post-facebook, /post-community, /post-engagement-prompt, or /post-weekly-wins.' });
    }

    const { entry, ctx } = normalizePostEntry(body, postType);
    entry.templateIds = validateTemplate(entry);
    const response = await buildPostResponse(entry, ctx);
    return res.status(200).json(response);
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
