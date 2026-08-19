/**
 * lib/community-helpers.js
 *
 * Wave 4 community helper substrate for Slack, Telegram, and Supabase.
 * Core behaviors:
 * - dry-run simulators for each helper
 * - readiness/capability listing
 * - env validation without secret leakage
 * - envelope-compliant responses
 * - local test harness
 *
 * Constraints:
 * - Dry-run by default.
 * - No live social API calls here; those belong in future live wrappers.
 * - No internal OS modules referenced.
 * - No hardcoded credentials.
 */

import {
  dryRunEnabled,
  isLiveExecutionAllowed,
  requireDryRunGuard,
  maskError,
  buildEnvelope,
  dryRunPayload,
  safeStringify,
} from './sellable-auth';

// -------------------------------
// Env requirements
// -------------------------------
const HELPER_ENV = {
  SLACK_BOT_TOKEN: Deno.env.get('SLACK_BOT_TOKEN') || null,
  SLACK_CHANNEL_ID: Deno.env.get('SLACK_CHANNEL_ID') || null,
  TELEGRAM_BOT_TOKEN: Deno.env.get('TELEGRAM_BOT_TOKEN') || null,
  TELEGRAM_CHAT_ID: Deno.env.get('TELEGRAM_CHAT_ID') || null,
  SUPABASE_URL: Deno.env.get('SUPABASE_URL') || null,
  SUPABASE_ANON_KEY: Deno.env.get('SUPABASE_ANON_KEY') || null,
};

// -------------------------------
// Helper definition schema
// -------------------------------
export const COMMUNITY_HELPERS = [
  {
    name: 'slack',
    category: 'community',
    source: 'slack',
    description: 'Slack community helper. Supports dry-run message simulation, readiness check, and capability listing.',
    capabilities: ['send_message', 'list_channels', 'read_channel'],
    requiredEnv: ['SLACK_BOT_TOKEN', 'SLACK_CHANNEL_ID'],
  },
  {
    name: 'telegram',
    category: 'community',
    source: 'telegram',
    description: 'Telegram community helper. Supports dry-run message simulation, readiness check, and capability listing.',
    capabilities: ['send_message', 'get_updates', 'get_chat_info'],
    requiredEnv: ['TELEGRAM_BOT_TOKEN', 'TELEGRAM_CHAT_ID'],
  },
  {
    name: 'supabase',
    category: 'community',
    source: 'supabase',
    description: 'Supabase community state helper. Supports dry-run broadcast simulation, readiness check, and capability listing.',
    capabilities: ['broadcast', 'subscribe', 'invoke_function'],
    requiredEnv: ['SUPABASE_URL', 'SUPABASE_ANON_KEY'],
  },
];

// -------------------------------
// Envelope helper
// -------------------------------
function ensureEnvelope({ ok = true, action, status = 'success', data = null, error = null, meta = {} }) {
  return buildEnvelope({ ok, action, status, data, error, meta });
}

// -------------------------------
// Validation
// -------------------------------
export function validateCommunityHelperPayload(payload = {}) {
  if (payload === null || payload === undefined || typeof payload !== 'object') {
    return { valid: false, error: 'Payload must be an object.' };
  }
  if (!safeStringify(payload)) {
    return { valid: false, error: 'Payload is not JSON safe.' };
  }
  const name = String(payload.helperName || payload.name || payload.source || '').trim().toLowerCase();
  if (!name) {
    return { valid: false, error: 'Payload is missing helperName.' };
  }
  const matched = COMMUNITY_HELPERS.find(h => h.name === name);
  if (!matched) {
    return {
      valid: false,
      error: `Unknown helper: ${name}`,
      validHelpers: COMMUNITY_HELPERS.map(h => h.name),
      validSources: [...new Set(COMMUNITY_HELPERS.map(h => h.source))],
    };
  }
  return { valid: true, helper: matched };
}

export function validateCommunityHelperEnv() {
  const missingByHelper = {};
  for (const helper of COMMUNITY_HELPERS) {
    const missing = helper.requiredEnv.filter(k => !HELPER_ENV[k]);
    if (missing.length > 0) {
      missingByHelper[helper.name] = missing;
    }
  }
  const missingLive = Object.entries(missingByHelper).flatMap(([name, keys]) =>
    keys.map(k => `${name}:${k}`)
  );
  return {
    complete: missingLive.length === 0,
    missingByHelper,
    missing: missingLive,
    masked: missingLive.map(k => `${k}=${maskError(new Error('missing'))}`),
  };
}

// -------------------------------
// Dry-run simulators
// -------------------------------
export function simulateSendMessage({ helperName = '', message = '', targetId = null, options = {} } = {}) {
  const matched = COMMUNITY_HELPERS.find(h => h.name === String(helperName).trim().toLowerCase());
  if (!matched) {
    return ensureEnvelope({
      ok: false,
      action: 'community-helper.send_message',
      status: 'validation_failed',
      error: `Unknown helper: ${helperName}`,
      meta: { validHelpers: COMMUNITY_HELPERS.map(h => h.name) },
    });
  }
  return ensureEnvelope({
    ok: true,
    action: 'community-helper.send_message',
    status: 'completed',
    data: {
      helper: matched.name,
      source: matched.source,
      message: String(message || '').slice(0, 280),
      targetId: targetId || `${matched.source}-simulated-channel`,
      messageId: `dry-message-${Date.now()}`,
      sent: true,
      simulated: true,
    },
    meta: { simulated: true },
  });
}

export function simulateReadState({ helperName = '', targetId = null } = {}) {
  const matched = COMMUNITY_HELPERS.find(h => h.name === String(helperName).trim().toLowerCase());
  if (!matched) {
    return ensureEnvelope({
      ok: false,
      action: 'community-helper.read_state',
      status: 'validation_failed',
      error: `Unknown helper: ${helperName}`,
      meta: { validHelpers: COMMUNITY_HELPERS.map(h => h.name) },
    });
  }
  return ensureEnvelope({
    action: 'community-helper.read_state',
    status: 'completed',
    data: {
      helper: matched.name,
      source: matched.source,
      targetId: targetId || `${matched.source}-simulated-channel`,
      items: [
        { id: `dry-item-1`, type: 'message', createdAt: new Date().toISOString(), simulated: true },
        { id: `dry-item-2`, type: 'message', createdAt: new Date(Date.now() - 86400000).toISOString(), simulated: true },
      ],
      simulated: true,
    },
    meta: { simulated: true },
  });
}

// -------------------------------
// Readiness / capability listing
// -------------------------------
export function getCommunityHelperReadiness({ helperName = '' } = {}) {
  const env = validateCommunityHelperEnv();
  if (!env.complete && !dryRunEnabled()) {
    return ensureEnvelope({
      ok: false,
      action: 'community-helper.readiness',
      status: 'error',
      error: maskError(new Error(`Missing community helper env vars: ${env.masked.join(', ')}`)),
    });
  }
  const target = String(helperName).trim().toLowerCase();
  const items = target ? COMMUNITY_HELPERS.filter(h => h.name === target) : COMMUNITY_HELPERS;

  return ensureEnvelope({
    ok: true,
    action: 'community-helper.readiness',
    status: dryRunEnabled() ? 'dry_run' : (env.complete ? 'live_ready' : 'partial'),
    data: {
      helpers: items.map(h => ({
        name: h.name,
        source: h.source,
        capabilities: h.capabilities,
        envConfigured: h.requiredEnv.every(k => !!HELPER_ENV[k]),
      })),
      dryRun: dryRunEnabled(),
      liveApproved: isLiveExecutionAllowed(),
    },
  });
}

export function listCommunityHelpers(options = {}) {
  const category = String(options.category || '').trim().toLowerCase();
  const source = String(options.source || '').trim().toLowerCase();
  let items = COMMUNITY_HELPERS.slice();
  if (category) items = items.filter(h => String(h.category).toLowerCase() === category);
  if (source) items = items.filter(h => String(h.source).toLowerCase() === source);
  return ensureEnvelope({
    action: 'community-helpers.list',
    status: 'success',
    data: items,
    meta: { category, source },
  });
}

// -------------------------------
// Handler entrypoint
// -------------------------------
export function handleCommunityHelperRequest(req) {
  const action = String(req?.action || '').trim().toLowerCase();
  const payload = req?.payload || req?.data || {};

  if (action === 'dry_run' || action === 'community-helper.readiness') {
    return getCommunityHelperReadiness(payload);
  }
  if (action === 'community-helpers.list') {
    return listCommunityHelpers(payload);
  }
  if (action === 'community-helper.send_message') {
    return simulateSendMessage(payload);
  }
  if (action === 'community-helper.read_state') {
    return simulateReadState(payload);
  }

  return dryRunPayload('Community Helpers');
}

// -------------------------------
// Test harness
// -------------------------------
function runTests() {
  const results = [];
  function assert(name, condition) {
    const pass = !!condition;
    results.push({ name, pass, status: pass ? 'PASS' : 'FAIL' });
    console.log(`  ${pass ? '✅' : '❌'} ${name}`);
  }

  console.log('\n=== community-helpers test harness ===\n');

  console.log('1. Helper registry');
  assert('COMMUNITY_HELPERS is array', Array.isArray(COMMUNITY_HELPERS));
  assert('COMMUNITY_HELPERS has slack', COMMUNITY_HELPERS.some(h => h.name === 'slack'));
  assert('COMMUNITY_HELPERS has telegram', COMMUNITY_HELPERS.some(h => h.name === 'telegram'));
  assert('COMMUNITY_HELPERS has supabase', COMMUNITY_HELPERS.some(h => h.name === 'supabase'));

  console.log('\n2. Env validation');
  const env = validateCommunityHelperEnv();
  assert('validateCommunityHelperEnv returns object', typeof env === 'object');
  assert('validateCommunityHelperEnv has complete', typeof env.complete === 'boolean');
  assert('validateCommunityHelperEnv masked strings are present', env.masked.length > 0);

  console.log('\n3. Readiness and listings');
  const readiness = getCommunityHelperReadiness();
  assert('getCommunityHelperReadiness returns envelope', typeof readiness === 'object');
  assert('listCommunityHelpers returns all by default', listCommunityHelpers().data?.length === COMMUNITY_HELPERS.length);

  console.log('\n4. Validation shapes');
  assert('valid helper payload passes', validateCommunityHelperPayload({ helperName: 'slack' }).valid);
  assert('invalid helper payload fails', !validateCommunityHelperPayload(null).valid);
  assert('unknown helper name fails', !validateCommunityHelperPayload({ helperName: 'missing' }).valid);

  console.log('\n5. Dry-run simulators');
  const sent = simulateSendMessage({ helperName: 'telegram', message: 'Hello Wave 4' });
  assert('simulateSendMessage returns envelope', !!sent && sent.ok === true);
  assert('simulateSendMessage preserves helper metadata', sent.data?.source === 'telegram');

  const state = simulateReadState({ helperName: 'supabase' });
  assert('simulateReadState returns envelope', !!state && state.ok === true);
  assert('simulateReadState returns simulated items', Array.isArray(state.data?.items) && state.data?.items?.length > 0);

  console.log('\n6. Handler entrypoint');
  const handler = handleCommunityHelperRequest({ action: 'community-helper.readiness' });
  assert('handler returns readiness in dry-run', handler.meta?.dryRun === true);
  assert('handler unknown action falls back to dry-run', handleCommunityHelperRequest({ action: 'unknown' }).meta?.dryRun === true);

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

if (process.argv[1] && new URL(process.argv[1]).pathname.endsWith('community-helpers.js')) {
  runTests();
}
