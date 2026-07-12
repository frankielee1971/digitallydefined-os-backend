// api/linkedin.js
// Wave 5 activation: LinkedIn publisher endpoint
// Delegates to lib/social-publishers.js substrate.

import { handleSocialPublisherRequest } from '../lib/social-publishers.js';
import { applyCors, checkDashboardApiKey, buildEnvelope } from '../lib/sellable-auth.js';

export default async function handler(req, res) {
  applyCors(req, res);
  if (req.method === 'OPTIONS') return res.status(200).end();

  if (!checkDashboardApiKey(req)) {
    return res.status(401).json(buildEnvelope({ ok: false, action: 'linkedin', status: 'error', error: 'Unauthorized' }));
  }

  if (req.method !== 'POST') {
    return res.status(405).json(buildEnvelope({ ok: false, action: 'linkedin', status: 'error', error: 'Method not allowed - use POST' }));
  }

  try {
    const body = typeof req.body === 'object' && req.body !== null ? req.body : {};
    const result = handleSocialPublisherRequest({
      action: body.action || 'publisher.readiness',
      payload: { ...body, publisherName: 'linkedin' },
    });

    return res.status(200).json(result);
  } catch (err) {
    console.error('[linkedin] failed:', err);
    return res.status(500).json(buildEnvelope({
      ok: false,
      action: 'linkedin',
      status: 'error',
      error: 'LinkedIn publisher failed',
      debug: err?.message || 'Unknown error',
    }));
  }
}
