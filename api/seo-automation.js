import { applyCors, checkDashboardApiKey, maskError, buildEnvelope, dryRunPayload, requireDryRunGuard } from '../lib/sellable-auth.js';

export default async function handler(req, res) {
  applyCors(req, res);
  if (req.method === 'OPTIONS') return res.status(200).end();

  const guard = requireDryRunGuard(req, res, 'seo-automation');
  if (guard) return guard;

  if (!checkDashboardApiKey(req)) {
    return res.status(401).json(buildEnvelope({ ok: false, action: 'seo-automation', status: 'error', error: 'Unauthorized' }));
  }

  if (req.method !== 'POST') {
    return res.status(405).json(buildEnvelope({ ok: false, action: 'seo-automation', status: 'error', error: 'Method not allowed - use POST' }));
  }

  try {
    const body = typeof req.body === 'object' && req.body !== null ? req.body : {};
    const clusters = Array.isArray(body.clusters) ? body.clusters : [];
    const weekStart = String(body.weekStart || '').trim();

    if (!weekStart) {
      return res.status(400).json(buildEnvelope({ ok: false, action: 'seo-automation', status: 'error', error: 'Missing weekStart' }));
    }

    const contentPlan = clusters.map((cluster, index) => ({
      id: `seo-${weekStart}-${index + 1}`,
      weekStart,
      cluster: String(cluster.cluster || cluster.keyword || '').trim() || null,
      title: cluster.title || null,
      slug: cluster.slug || null,
      meta_description: cluster.metaDescription || null,
      tags: Array.isArray(cluster.tags) ? cluster.tags : [],
      linked_product_ids: Array.isArray(cluster.linkedProductIds) ? cluster.linkedProductIds : [],
      status: 'pending_review',
    }));

    return res.status(200).json(buildEnvelope({
      ok: true,
      action: 'seo-automation',
      status: 'reviewed',
      data: { weekStart, clusters: contentPlan, count: contentPlan.length },
      meta: { dryRun: true },
    }));
  } catch (err) {
    console.error('[seo-automation] failed:', err);
    return res.status(500).json(buildEnvelope({ ok: false, action: 'seo-automation', status: 'error', error: 'SEO automation failed', debug: err?.message || 'Unknown error' }));
  }
}
