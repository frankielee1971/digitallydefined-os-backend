import { applyCors, checkDashboardApiKey, maskError, buildEnvelope, dryRunPayload, requireDryRunGuard } from '../lib/sellable-auth.js';

export default async function handler(req, res) {
  applyCors(req, res);
  if (req.method === 'OPTIONS') return res.status(200).end();

  const guard = requireDryRunGuard(req, res, 'sellable-products');
  if (guard) return guard;

  if (!checkDashboardApiKey(req)) {
    return res.status(401).json(buildEnvelope({ ok: false, action: 'sellable-products', status: 'error', error: 'Unauthorized' }));
  }

  if (req.method !== 'POST') {
    return res.status(405).json(buildEnvelope({ ok: false, action: 'sellable-products', status: 'error', error: 'Method not allowed - use POST' }));
  }

  try {
    const body = typeof req.body === 'object' && req.body !== null ? req.body : {};
    const mode = String(body.mode || 'approval').trim().toLowerCase();
    const product = body.product || null;

    if (!product) {
      return res.status(400).json(buildEnvelope({ ok: false, action: 'sellable-products', status: 'error', error: 'Missing product payload' }));
    }

    const productId = String(product.id || product.productId || '').trim();
    if (!productId) {
      return res.status(400).json(buildEnvelope({ ok: false, action: 'sellable-products', status: 'error', error: 'Missing product id' }));
    }

    const payload = {
      productId,
      title: product.title || null,
      status: product.status || 'draft',
      version: product.version || '1.0.0',
      price: product.price || null,
      currency: product.currency || 'USD',
      tags: Array.isArray(product.tags) ? product.tags : [],
      links: product.links || null,
      updatedAt: new Date().toISOString(),
    };

    if (mode === 'dry-run') {
      return res.status(200).json(buildEnvelope({
        ok: true,
        action: 'sellable-products',
        status: 'reviewed',
        data: payload,
        meta: { dryRun: true, mode },
      }));
    }

    return res.status(200).json(buildEnvelope({
      ok: true,
      action: 'sellable-products',
      status: 'updated',
      data: payload,
      meta: { dryRun: true, mode, note: 'Live external write remains disabled until explicit approval.' },
    }));
  } catch (err) {
    console.error('[sellable-products] failed:', err);
    return res.status(500).json(buildEnvelope({ ok: false, action: 'sellable-products', status: 'error', error: 'Product pipeline failed', debug: err?.message || 'Unknown error' }));
  }
}
