// api/brevo.js
// Wave 2 activation: Brevo email automation endpoint
// Uses lib/email-publish.js substrate for dry-run simulators,
// readiness checks, and live-execution gating.

import { handleEmailPublishRequest } from '../lib/email-publish.js';
import { applyCors, checkDashboardApiKey, buildEnvelope, dryRunPayload } from '../lib/sellable-auth.js';

export default async function handler(req, res) {
  applyCors(req, res);
  if (req.method === 'OPTIONS') return res.status(200).end();

  if (!checkDashboardApiKey(req)) {
    return res.status(401).json(buildEnvelope({ ok: false, action: 'brevo', status: 'error', error: 'Unauthorized' }));
  }

  if (req.method !== 'POST') {
    return res.status(405).json(buildEnvelope({ ok: false, action: 'brevo', status: 'error', error: 'Method not allowed - use POST' }));
  }

  try {
    const body = typeof req.body === 'object' && req.body !== null ? req.body : {};
    const result = handleEmailPublishRequest({
      action: body.action || 'email-publish.readiness',
      payload: body,
    });

    return res.status(200).json(result);
  } catch (err) {
    console.error('[brevo] failed:', err);
    return res.status(500).json(buildEnvelope({
      ok: false,
      action: 'brevo',
      status: 'error',
      error: 'Brevo operation failed',
      debug: err?.message || 'Unknown error',
    }));
  }
}
