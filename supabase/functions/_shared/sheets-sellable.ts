/**
 * lib/sheets-sellable.js
 *
 * Wave 5 Google Sheets helper: append and update rows for analytics/revenue sync.
 * Strictly dry-run only until live activation is explicitly authorized.
 */

const DRY_RUN_KEY = 'SELLABLE_DRY_RUN';
const LIVE_KEY = 'SELLABLE_LIVE_APPROVAL';
const APPROVAL_PHASE = 'phase19';

function dryRunEnabled() {
  const flag = Deno.env.get(DRY_RUN_KEY);
  return flag === undefined ? true : flag === 'true';
}

function isLiveExecutionAllowed() {
  return Deno.env.get(LIVE_KEY) === APPROVAL_PHASE;
}

function maskError(err) {
  if (!err || typeof err !== 'object') return 'Unknown error';
  const msg = typeof err.message === 'string' ? err.message : String(err);
  return msg.length > 120 ? `${msg.slice(0, 117)}...` : msg;
}

function buildEnvelope({ ok = true, action, status = 'success', data = null, error = null, meta = {} } = {}) {
  return {
    ok,
    action,
    status,
    data,
    error: error ? maskError(error) : null,
    meta: {
      ...meta,
      dryRun: dryRunEnabled(),
      liveApproved: isLiveExecutionAllowed(),
    },
    timestamp: new Date().toISOString(),
  };
}

const GOOGLE_SHEETS_ENV = {
  SHEETS_WEBHOOK_URL: Deno.env.get('SHEETS_WEBHOOK_URL') || null,
  GOOGLE_CLIENT_ID: Deno.env.get('GOOGLE_CLIENT_ID') || null,
  GOOGLE_CLIENT_SECRET: Deno.env.get('GOOGLE_CLIENT_SECRET') || null,
  GOOGLE_REFRESH_TOKEN: Deno.env.get('GOOGLE_REFRESH_TOKEN') || null,
};

function validateSheetsEnv() {
  const hasWebhook = !!GOOGLE_SHEETS_ENV.SHEETS_WEBHOOK_URL;
  const hasOAuth = !!(
    GOOGLE_SHEETS_ENV.GOOGLE_CLIENT_ID &&
    GOOGLE_SHEETS_ENV.GOOGLE_CLIENT_SECRET &&
    GOOGLE_SHEETS_ENV.GOOGLE_REFRESH_TOKEN
  );

  const complete = hasWebhook || hasOAuth;
  if (!complete) {
    return {
      complete: false,
      missing: ['SHEETS_WEBHOOK_URL or Google OAuth credentials'],
      masked: ['SHEETS_WEBHOOK_URL=[REDACTED]', 'GOOGLE_CLIENT_ID=[REDACTED]'],
    };
  }

  return {
    complete: true,
    missing: [],
    masked: [],
    mode: hasWebhook ? 'webhook' : 'oauth',
  };
}

export function getSheetsReadiness({ spreadsheetId = '', sheet = 'Sheet1' } = {}) {
  const env = validateSheetsEnv();
  if (!env.complete && !dryRunEnabled()) {
    return buildEnvelope({
      ok: false,
      action: 'sheets.readiness',
      status: 'error',
      error: `Missing Google Sheets config: ${env.masked.join(', ')}`,
      meta: { spreadsheetId: spreadsheetId || null, sheet },
    });
  }

  return buildEnvelope({
    ok: true,
    action: 'sheets.readiness',
    status: dryRunEnabled() ? 'dry_run' : 'live_ready',
    data: {
      mode: env.mode || 'dry-run',
      spreadsheetId: spreadsheetId || null,
      sheet,
      configured: env.complete,
      connections: env.complete ? 1 : 0,
    },
    meta: { spreadsheetId: spreadsheetId || null, sheet },
  });
}

export function simulateAppendRow({ spreadsheetId = '', sheet = 'Sheet1', row = {} } = {}) {
  if (typeof row !== 'object' || row === null) {
    return buildEnvelope({
      ok: false,
      action: 'sheets.append',
      status: 'validation_failed',
      error: 'Row payload must be an object.',
      meta: { spreadsheetId, sheet },
    });
  }

  return buildEnvelope({
    ok: true,
    action: 'sheets.append',
    status: 'completed',
    data: {
      spreadsheetId: spreadsheetId || 'dry-run-sheet-id',
      sheet,
      row,
      appended: true,
      simulated: true,
    },
    meta: { simulated: true },
  });
}

export function simulateUpdateRow({ spreadsheetId = '', sheet = 'Sheet1', rowIndex = 0, row = {} } = {}) {
  if (typeof row !== 'object' || row === null) {
    return buildEnvelope({
      ok: false,
      action: 'sheets.update',
      status: 'validation_failed',
      error: 'Row payload must be an object.',
      meta: { spreadsheetId, sheet, rowIndex },
    });
  }

  return buildEnvelope({
    ok: true,
    action: 'sheets.update',
    status: 'completed',
    data: {
      spreadsheetId: spreadsheetId || 'dry-run-sheet-id',
      sheet,
      rowIndex: Number(rowIndex) || 0,
      row,
      updated: true,
      simulated: true,
    },
    meta: { simulated: true },
  });
}

export function handleSheetsRequest(req) {
  const action = String(req?.action || '').trim().toLowerCase();
  const payload = req?.payload || req?.data || {};

  if (action === 'sheets.readiness') {
    return getSheetsReadiness(payload);
  }
  if (action === 'sheets.append') {
    return simulateAppendRow(payload);
  }
  if (action === 'sheets.update') {
    return simulateUpdateRow(payload);
  }

  return buildEnvelope({
    ok: false,
    action: 'sheets',
    status: 'validation_failed',
    error: `Unknown sheets action: ${action}`,
    meta: { validActions: ['sheets.readiness', 'sheets.append', 'sheets.update'] },
  });
}

// Test harness
function runTests() {
  const results = [];
  function assert(name, condition) {
    const pass = !!condition;
    results.push({ name, pass, status: pass ? 'PASS' : 'FAIL' });
    console.log(`  ${pass ? '✅' : '❌'} ${name}`);
  }

  console.log('\n=== sheets-sellable test harness ===\n');

  console.log('1. Env validation');
  const env = validateSheetsEnv();
  assert('validateSheetsEnv returns object', typeof env === 'object');
  assert('validateSheetsEnv has complete flag', typeof env.complete === 'boolean');

  console.log('\n2. Readiness');
  const readiness = getSheetsReadiness();
  assert('getSheetsReadiness returns envelope', typeof readiness === 'object');
  assert('getSheetsReadiness indicates dry-run when no credentials', readiness.status === 'dry_run');

  console.log('\n3. Dry-run appends');
  const append = simulateAppendRow({ sheet: 'Revenue', row: { date: '2026-07-12', amount: 49 } });
  assert('simulateAppendRow returns envelope', !!append && append.ok === true);
  assert('simulateAppendRow is simulated', append.data?.simulated === true);
  assert('simulateAppendRow preserves sheet metadata', append.data?.sheet === 'Revenue');

  console.log('\n4. Dry-run updates');
  const update = simulateUpdateRow({ sheet: 'Revenue', rowIndex: 2, row: { amount: 99 } });
  assert('simulateUpdateRow returns envelope', !!update && update.ok === true);
  assert('simulateUpdateRow preserves rowIndex', update.data?.rowIndex === 2);

  console.log('\n5. Validation');
  assert('null row fails append', !simulateAppendRow({ row: null }).ok);
  assert('unknown action falls back to error', !handleSheetsRequest({ action: 'unknown' }).ok);

  console.log('\n6. Envelope contract');
  const envelope = getSheetsReadiness();
  assert('envelope has dryRun flag', typeof envelope.meta?.dryRun === 'boolean');
  assert('envelope has liveApproved flag', typeof envelope.meta?.liveApproved === 'boolean');
  assert('envelope has timestamp', typeof envelope.timestamp === 'string');

  console.log('\n=== Results ===');
  const passed = results.filter(r => r.pass).length;
  const failed = results.filter(r => !r.pass).length;
  console.log(`Passed: ${passed}/${results.length}`);
  if (failed > 0) {
    console.log('Failed:', results.filter(r => !r.pass).map(r => r.name).join(', '));
    process.exitCode = 1;
  }
  console.log('');
}

if (process.argv[1] && new URL(process.argv[1]).pathname.endsWith('sheets-sellable.js')) {
  runTests();
}
