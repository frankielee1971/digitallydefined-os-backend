// lib/sellable-auth.js
// Common auth, dry-run flag, CORS, and mask helpers for sellable automation.

const DRY_RUN = String(process.env.SELLABLE_DRY_RUN || 'true').trim().toLowerCase() === 'true';
const LIVE_APPROVAL = String(process.env.SELLABLE_LIVE_APPROVAL || '').trim().toLowerCase();

function dryRunEnabled() {
  return DRY_RUN;
}

function isLiveExecutionAllowed() {
  // Only allow live execution when LIVE_APPROVAL is explicitly set to 'phase19'
  const approved = LIVE_APPROVAL === 'phase19';
  if (approved) {
    return true;
  }
  return false;
}

function requireDryRunGuard(req, res, action) {
  // If dry-run is enabled OR live execution is not explicitly approved, block
  if (dryRunEnabled() || !isLiveExecutionAllowed()) {
    return res.status(403).json(buildEnvelope({
      ok: false,
      action,
      status: 'forbidden',
      error: dryRunEnabled() 
        ? 'Live execution is disabled. Set SELLABLE_DRY_RUN=false to enable.' 
        : 'Live execution is not approved. Set SELLABLE_LIVE_APPROVAL=phase19 to enable.',
      meta: { 
        dryRun: true, 
        liveApproved: false,
        reason: dryRunEnabled() ? 'dry_run_enabled' : 'not_approved'
      }
    }));
  }
  return null; // Live execution allowed
}

function applyCors(req, res) {
  const origin = req.headers.origin;
  const allowed =
    origin &&
    [
      'https://dashboard.digitallydefined.online',
      'https://digitallydefined.online',
      'http://localhost:3000',
      'http://localhost:5173',
    ].includes(origin);

  res.setHeader('Access-Control-Allow-Origin', allowed ? origin : 'https://dashboard.digitallydefined.online');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-api-key, Authorization');
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Vary', 'Origin');
}

function checkDashboardApiKey(req) {
  const provided = String(req.headers['x-api-key'] || req.headers['authorization'] || '').trim();
  const expected = String(process.env.DASHBOARD_API_KEY || process.env.VITE_DASHBOARD_API_KEY || '').trim();
  if (!expected) return false;
  return provided === expected;
}

function maskError(err, source = 'External service') {
  const message = err?.message || 'Unknown error';
  const isAuth = /unauthorized|forbidden|token|credential|secret|apikey|api key|access denied/i.test(message);
  const isRate = /rate limit|too many requests|quota/i.test(message);
  const isTimeout = /timeout|timed out|aborted/i.test(message);

  if (isAuth) return `${source} request failed due to authentication or permission settings.`;
  if (isRate) return `${source} request was rate limited.`;
  if (isTimeout) return `${source} request timed out.`;
  return `${source} request failed.`;
}

async function parseJsonSafe(res, fallback = null) {
  try {
    const contentType = String(res.headers.get('content-type') || '');
    let text;
    if (!contentType.includes('application/json')) {
      text = await res.text();
      return text ? JSON.parse(text) : fallback;
    }
    return await res.json();
  } catch {
    return fallback;
  }
}

function buildEnvelope({ ok = true, action, status = 'success', data = null, error = null, debug = null, meta = {} }) {
  return {
    ok,
    action,
    status,
    data,
    error,
    debug: process.env.NODE_ENV !== 'production' ? debug : null,
    meta: {
      dryRun: dryRunEnabled(),
      liveApproved: isLiveExecutionAllowed(),
      generatedAt: new Date().toISOString(),
      ...meta,
    },
  };
}

function dryRunPayload(prefix = 'Dry-run') {
  return buildEnvelope({
    ok: true,
    action: 'dry_run',
    status: 'drilled',
    data: null,
    error: null,
    meta: { message: `${prefix} mode: no live write or external call was made.` },
  });
}

function safeStringify(value, fallback = '{}') {
  try {
    return JSON.stringify(value);
  } catch {
    return fallback;
  }
}

export { 
  DRY_RUN, 
  dryRunEnabled, 
  isLiveExecutionAllowed, 
  requireDryRunGuard,
  applyCors, 
  checkDashboardApiKey, 
  maskError, 
  parseJsonSafe, 
  buildEnvelope, 
  dryRunPayload, 
  safeStringify 
};
