import { applyCors, checkDashboardApiKey, maskError, buildEnvelope, dryRunPayload, parseJsonSafe } from '../lib/sellable-auth.js';

export default async function handler(req, res) {
  applyCors(req, res);
  if (req.method === 'OPTIONS') return res.status(200).end();

  const action = String(req.query?.action || req.body?.action || 'dry-run').trim().toLowerCase();

  if (!['dry-run', 'run'].includes(action)) {
    return res.status(400).json(buildEnvelope({ ok: false, action: 'cron', status: 'error', error: `Unsupported action: ${action}` }));
  }

  if (!checkDashboardApiKey(req)) {
    return res.status(401).json(buildEnvelope({ ok: false, action: 'cron', status: 'error', error: 'Unauthorized' }));
  }

  const job = String(req.query?.job || req.body?.job || 'daily-sellable-report').trim().toLowerCase();
  const allowedJobs = new Set([
    'daily-sellable-report',
    'revenue-automation',
    'seo-automation',
    'monthly-revenue-review',
    'sellable-health',
  ]);

  if (!allowedJobs.has(job)) {
    return res.status(400).json(buildEnvelope({ ok: false, action: 'cron', status: 'error', error: `Unknown cron job: ${job}` }));
  }

  const result = {
    job,
    action,
    executedAt: new Date().toISOString(),
    triggeredBy: action === 'dry-run' ? 'manual_dry_run' : 'vercel_cron',
  };

  if (action === 'dry-run') {
    return res.status(200).json(buildEnvelope({ ok: true, action: 'cron', status: 'drilled', data: result, meta: { dryRun: true } }));
  }

  return res.status(200).json(buildEnvelope({ ok: true, action: 'cron', status: 'completed', data: result }));
}
