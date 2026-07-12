import { applyCors, checkDashboardApiKey, maskError, buildEnvelope, dryRunPayload, requireDryRunGuard } from '../lib/sellable-auth.js';

export default async function handler(req, res) {
  applyCors(req, res);
  if (req.method === 'OPTIONS') return res.status(200).end();

  const guard = requireDryRunGuard(req, res, 'revenue-automation');
  if (guard) return guard;

  if (!checkDashboardApiKey(req)) {
    return res.status(401).json(buildEnvelope({ ok: false, action: 'revenue-automation', status: 'error', error: 'Unauthorized' }));
  }

  if (req.method !== 'POST') {
    return res.status(405).json(buildEnvelope({ ok: false, action: 'revenue-automation', status: 'error', error: 'Method not allowed - use POST' }));
  }

  try {
    const body = typeof req.body === 'object' && req.body !== null ? req.body : {};
    const ruleId = String(body.ruleId || '').trim();
    const mode = String(body.mode || 'review').trim().toLowerCase();
    const apply = String(body.apply || 'false').trim().toLowerCase() === 'true';

    if (!['review', 'apply'].includes(mode)) {
      return res.status(400).json(buildEnvelope({ ok: false, action: 'revenue-automation', status: 'error', error: `Invalid mode: ${mode}` }));
    }

    const fallbackData = {
      recommended_price: null,
      discount_code: body.discountCode || null,
      bundle_ids: Array.isArray(body.bundleIds) ? body.bundleIds : [],
      launch_window: String(body.launchWindow || '').trim() || null,
      reasoning: 'Revenue rule preserved from Notion/API input without live external pricing write.',
    };

    return res.status(200).json(buildEnvelope({
      ok: true,
      action: 'revenue-automation',
      status: dryRunEnabled() || mode === 'review' || !apply ? 'reviewed' : 'applied',
      data: fallbackData,
      meta: { applied: false, ruleId: ruleId || null, mode, dryRun: dryRunEnabled() },
    }));
  } catch (err) {
    console.error('[revenue-automation] failed:', err);
    return res.status(500).json(buildEnvelope({ ok: false, action: 'revenue-automation', status: 'error', error: 'Revenue automation failed', debug: err?.message || 'Unknown error' }));
  }
}
