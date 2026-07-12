import { applyCors, checkDashboardApiKey, maskError, buildEnvelope, dryRunPayload, requireDryRunGuard } from '../lib/sellable-auth.js';

export default async function handler(req, res) {
  applyCors(req, res);
  if (req.method === 'OPTIONS') return res.status(200).end();

  const guard = requireDryRunGuard(req, res, 'gumroad');
  if (guard) return guard;

  if (!checkDashboardApiKey(req)) {
    return res.status(401).json(buildEnvelope({ ok: false, action: 'gumroad', status: 'error', error: 'Unauthorized' }));
  }

  if (req.method !== 'POST') {
    return res.status(405).json(buildEnvelope({ ok: false, action: 'gumroad', status: 'error', error: 'Method not allowed - use POST' }));
  }

  try {
    const body = typeof req.body === 'object' && req.body !== null ? req.body : {};
    const operation = String(body.operation || '').trim().toLowerCase();
    const productId = String(body.productId || '').trim();
    const payload = body.payload || null;

    if (!operation) return res.status(400).json(buildEnvelope({ ok: false, action: 'gumroad', status: 'error', error: 'Missing operation' }));
    if (!productId && operation !== 'list') return res.status(400).json(buildEnvelope({ ok: false, action: 'gumroad', status: 'error', error: 'Missing productId' }));

    const allowed = new Set(['get', 'update_price', 'list']);
    if (!allowed.has(operation)) {
      return res.status(400).json(buildEnvelope({ ok: false, action: 'gumroad', status: 'error', error: `Unsupported operation: ${operation}` }));
    }

    return res.status(200).json(buildEnvelope({
      ok: true,
      action: 'gumroad',
      status: 'reviewed',
      data: { operation, productId: productId || null, payload: payload || null },
      meta: { dryRun: true, simulated: true },
    }));
  } catch (err) {
    console.error('[gumroad] failed:', err);
    return res.status(500).json(buildEnvelope({ ok: false, action: 'gumroad', status: 'error', error: 'Gumroad operation failed', debug: err?.message || 'Unknown error' }));
  }
}
