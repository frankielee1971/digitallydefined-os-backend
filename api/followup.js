/**
 * Endpoint surface:
 *   GET  /api/followup          -> list days + brief
 *   POST /api/followup          -> trigger follow-up pipeline entry
 *   GET  /api/followup/{day}    -> day brief
 *   POST /api/followup/{day}    -> trigger follow-up for day
 */

import { storeRoadmap, listRoadmaps, getRoadmapById } from './roadmaps/store.js';
import {
  FOLLOWUP_DAYS,
  DAY_META,
  buildIndicator,
  buildMessage,
} from '../lib/followup-messages.js';

const ALLOWED_DAYS = new Set(FOLLOWUP_DAYS);
const requiredEnv = () => ({ sendgridKey: process.env.SENDGRID_API_KEY || '', sendgridListId: process.env.SENDGRID_LIST_ID || '', sendgridTemplateId: process.env.SENDGRID_TEMPLATE_ID || '' });

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
  if (!expected) return false;
  const provided = String(req.headers['x-api-key'] || req.headers['authorization'] || '').trim();
  return provided === expected;
}

function parseBody(req) {
  const raw = typeof req.body === 'string' ? req.body : null;
  if (!raw) return {};
  try {
    return JSON.parse(raw || '{}');
  } catch {
    return {};
  }
}

function getDay(req) {
  const segments = String(req.url || '').split('/').map((s) => s.trim()).filter(Boolean);
  const last = segments[segments.length - 1] || '';
  return ALLOWED_DAYS.has(last.toLowerCase()) ? last.toLowerCase() : null;
}

function normalizeEntry(body, day) {
  const entry = {
    source: body.source || 'followup',
    resultKey: body.resultKey || null,
    email: body.email || null,
    name: body.name || null,
    roadmap: body.roadmap || null,
    tags: Array.isArray(body.tags) ? body.tags : [],
    stage: body.stage || 'followup',
    followupDay: day,
    dayIndicator: buildIndicator({ day }),
    message: buildMessage({
      resultKey: body.resultKey,
      tags: Array.isArray(body.tags) ? body.tags : [],
      profile: { name: body.name },
      roadmap: body.roadmap,
    }),
  };

  if (day) entry.tags.push(`followup-${day}`);
  entry.tags.push('roadmap-engaged');
  return entry;
}

export default async function handler(req, res) {
  applyCors(req, res);
  if (req.method === 'OPTIONS') return res.status(200).end();

  if (req.method === 'GET') {
    const day = getDay(req);
    if (day) {
      const meta = DAY_META[day];
      const indicator = buildIndicator({ day });
      return res.status(200).json({ ok: true, day, meta, indicator });
    }

    return res.status(200).json({
      ok: true,
      days: FOLLOWUP_DAYS.map((d) => ({ day: d, ...DAY_META[d], indicator: buildIndicator({ day: d }) })),
    });
  }

  if (req.method === 'POST') {
    const authorized = checkApiKey(req, res);
    const body = parseBody(req);

    if (!authorized) {
      console.warn('[followup] unauthorized POST');
      return res.status(401).json({ error: 'Unauthorized - Invalid or missing API key' });
    }

    const required = requiredEnv();
    const emailApiReady = required.sendgridKey;

    const day = getDay(req);
    const entry = normalizeEntry(body, day);

    let stored = null;
    try {
      stored = await storeRoadmap({ ...entry, channel: 'email' });
    } catch (err) {
      console.error('[followup] store failed', err);
      return res.status(500).json({ error: `Roadmap storage failed: ${err.message || err}` });
    }

    const response = {
      ok: true,
      id: stored?.id || null,
      day: entry.followupDay,
      channel: 'email',
      tags: entry.tags,
      emailApiReady,
      message: emailApiReady ? 'prepared_for_dispatch' : 'stored_pending_email_provider',
      roadmapEngaged: true,
      followupDispatched: emailApiReady,
      ts: new Date().toISOString(),
    };

    return res.status(200).json(response);
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
