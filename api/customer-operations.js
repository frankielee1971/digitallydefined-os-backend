import { applyCors, checkDashboardApiKey, maskError, buildEnvelope, dryRunPayload } from '../lib/sellable-auth.js';

export default async function handler(req, res) {
  applyCors(req, res);
  if (req.method === 'OPTIONS') return res.status(200).end();

  if (!checkDashboardApiKey(req)) {
    return res.status(401).json(buildEnvelope({ ok: false, action: 'customer-operations', status: 'error', error: 'Unauthorized' }));
  }

  if (req.method !== 'POST') {
    return res.status(405).json(buildEnvelope({ ok: false, action: 'customer-operations', status: 'error', error: 'Method not allowed - use POST' }));
  }

  try {
    const body = typeof req.body === 'object' && req.body !== null ? req.body : {};
    const eventType = String(body.eventType || 'daily').trim().toLowerCase();
    const since = String(body.since || '').trim();

    if (!since) {
      return res.status(400).json(buildEnvelope({ ok: false, action: 'customer-operations', status: 'error', error: 'Missing since timestamp' }));
    }

    const payload = {
      eventType,
      since,
      tags: Array.isArray(body.tags) ? body.tags : body.tags ? [String(body.tags)] : [],
      follow_up_actions: Array.isArray(body.followUpActions) ? body.followUpActions : [],
      chat_summary: body.chatSummary || null,
      processed_at: new Date().toISOString(),
    };

    return res.status(200).json(buildEnvelope({
      ok: true,
      action: 'customer-operations',
      status: 'completed',
      data: payload,
      meta: { dryRun: true },
    }));
  } catch (err) {
    console.error('[customer-operations] failed:', err);
    return res.status(500).json(buildEnvelope({ ok: false, action: 'customer-operations', status: 'error', error: 'Customer operations failed', debug: err?.message || 'Unknown error' }));
  }
}
