// api/sheets.js
// Wave 5 activation: Google Sheets helper endpoint
// Delegates to lib/sheets-sellable.js substrate.

import { handleSheetsRequest } from '../lib/sheets-sellable.js';
import { applyCors, checkDashboardApiKey, buildEnvelope } from '../lib/sellable-auth.js';

export default async function handler(req, res) {
  applyCors(req, res);
  if (req.method === 'OPTIONS') return res.status(200).end();

  if (!checkDashboardApiKey(req)) {
    return res.status(401).json(buildEnvelope({ ok: false, action: 'google_sheets', status: 'error', error: 'Unauthorized' }));
  }

  if (req.method !== 'POST') {
    return res.status(405).json(buildEnvelope({ ok: false, action: 'google_sheets', status: 'error', error: 'Method not allowed - use POST' }));
  }

  try {
    const body = typeof req.body === 'object' && req.body !== null ? req.body : {};
    const action = String(body.action || 'sheets.readiness');
    const result = handleSheetsRequest({ action, payload: body });
    return res.status(200).json(result);
  } catch (err) {
    console.error('[google_sheets] failed:', err);
    return res.status(500).json(buildEnvelope({
      ok: false,
      action: 'google_sheets',
      status: 'error',
      error: 'Google Sheets handler failed',
      debug: err?.message || 'Unknown error',
    }));
  }
}
