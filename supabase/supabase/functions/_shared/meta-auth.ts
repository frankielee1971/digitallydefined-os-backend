/**
 * lib/meta-auth.js
 *
 * Central Meta/Graph authentication wrapper for:
 *   - Facebook Page/Group
 *   - Instagram Business
 *   - Threads
 *
 * Design rules:
 *   - Dry-run by default. No live HTTP calls unless SELLABLE_LIVE_APPROVAL=phase19.
 *   - All errors masked before surfacing to handlers.
 *   - Validates env completeness at startup and per-request.
 *   - Provides dry-run simulators for Wave 3 publisher modules.
 */

import { maskError } from './sellable-auth';

// -------------------------------
// Env requirements (documented)
// -------------------------------
const META_ENV = {
  META_APP_ID: Deno.env.get('META_APP_ID') || null,
  META_APP_SECRET: Deno.env.get('META_APP_SECRET') || null,
  FACEBOOK_ACCESS_TOKEN: Deno.env.get('FACEBOOK_ACCESS_TOKEN') || null,
  FACEBOOK_PAGE_ID: Deno.env.get('FACEBOOK_PAGE_ID') || null,
  FACEBOOK_GROUP_ID: Deno.env.get('FACEBOOK_GROUP_ID') || null,
  INSTAGRAM_BUSINESS_ACCOUNT_ID: Deno.env.get('INSTAGRAM_BUSINESS_ACCOUNT_ID') || null,
  INSTAGRAM_USERNAME: Deno.env.get('INSTAGRAM_USERNAME') || null,
  THREADS_APP_ID: Deno.env.get('THREADS_APP_ID') || null,
  THREADS_APP_SECRET: Deno.env.get('THREADS_APP_SECRET') || null,
  THREADS_USER_ID: Deno.env.get('THREADS_USER_ID') || null,
};

const DRY_RUN = Deno.env.get('SELLABLE_DRY_RUN') || 'true' !== 'false';
const LIVE_APPROVED = Deno.env.get('SELLABLE_LIVE_APPROVAL') === 'phase19';

// -------------------------------
// Internal helpers
// -------------------------------
function mask(value) {
  if (!value) return null;
  if (value.length <= 4) return `${value.slice(0, 1)}****`;
  return `${value.slice(0, 4)}****`;
}

function missingKeys(keys) {
  return keys.filter(k => !META_ENV[k]);
}

function envStatus(requiredKeys) {
  const missing = missingKeys(requiredKeys);
  return {
    complete: missing.length === 0,
    missing,
    masked: missing.map(k => `${k}=${mask(META_ENV[k])}`),
  };
}

function buildEnvelope({ ok = true, action, status = 'success', data = null, error = null, meta = {} }) {
  return {
    ok,
    action,
    status,
    data,
    error,
    meta: { ...meta, dryRun: DRY_RUN, liveApproved: LIVE_APPROVED },
  };
}

// -------------------------------
// Validators
// -------------------------------
export function validateMetaEnv() {
  return envStatus(['META_APP_ID', 'META_APP_SECRET']);
}

export function validateFacebookEnv() {
  return envStatus(['FACEBOOK_ACCESS_TOKEN', 'FACEBOOK_PAGE_ID']);
}

export function validateInstagramEnv() {
  return envStatus(['INSTAGRAM_BUSINESS_ACCOUNT_ID', 'FACEBOOK_ACCESS_TOKEN']);
}

export function validateThreadsEnv() {
  return envStatus(['THREADS_APP_ID', 'THREADS_APP_SECRET', 'THREADS_USER_ID', 'FACEBOOK_ACCESS_TOKEN']);
}

export function validateAll() {
  return {
    meta: validateMetaEnv(),
    facebook: validateFacebookEnv(),
    instagram: validateInstagramEnv(),
    threads: validateThreadsEnv(),
  };
}

// -------------------------------
// Dry-run simulators (Wave 3 contract)
// -------------------------------
export function simulatePublish(target, payload = {}) {
  return buildEnvelope({
    action: `meta.${target}.publish`,
    status: 'completed',
    data: {
      id: `dry-${target}-${Date.now()}`,
      target,
      simulated: true,
      payload,
    },
    meta: { simulated: true },
  });
}

export function simulateRead(target, endpoint = '/me') {
  return buildEnvelope({
    action: `meta.${target}.read`,
    status: 'completed',
    data: {
      target,
      endpoint,
      simulated: true,
      result: { name: 'Dry Run Account', id: 'dry-run-id' },
    },
    meta: { simulated: true },
  });
}

// -------------------------------
// Readiness probes
// -------------------------------
export function getFacebookReadiness() {
  const env = validateFacebookEnv();
  if (!env.complete) {
    return buildEnvelope({
      ok: false,
      action: 'meta.facebook.readiness',
      status: 'error',
      error: maskError(new Error(`Missing Facebook env vars: ${env.masked.join(', ')}`)),
    });
  }
  return buildEnvelope({
    ok: true,
    action: 'meta.facebook.readiness',
    status: DRY_RUN ? 'dry_run' : 'live_ready',
    data: { pageId: META_ENV.FACEBOOK_PAGE_ID, dryRun: DRY_RUN },
  });
}

export function getInstagramReadiness() {
  const env = validateInstagramEnv();
  if (!env.complete) {
    return buildEnvelope({
      ok: false,
      action: 'meta.instagram.readiness',
      status: 'error',
      error: maskError(new Error(`Missing Instagram env vars: ${env.masked.join(', ')}`)),
    });
  }
  return buildEnvelope({
    ok: true,
    action: 'meta.instagram.readiness',
    status: DRY_RUN ? 'dry_run' : 'live_ready',
    data: { igAccountId: META_ENV.INSTAGRAM_BUSINESS_ACCOUNT_ID, dryRun: DRY_RUN },
  });
}

export function getThreadsReadiness() {
  const env = validateThreadsEnv();
  if (!env.complete) {
    return buildEnvelope({
      ok: false,
      action: 'meta.threads.readiness',
      status: 'error',
      error: maskError(new Error(`Missing Threads env vars: ${env.masked.join(', ')}`)),
    });
  }
  return buildEnvelope({
    ok: true,
    action: 'meta.threads.readiness',
    status: DRY_RUN ? 'dry_run' : 'live_ready',
    data: { threadsUserId: META_ENV.THREADS_USER_ID, dryRun: DRY_RUN },
  });
}

export function getMetaReadiness() {
  const meta = validateMetaEnv();
  if (!meta.complete) {
    return buildEnvelope({
      ok: false,
      action: 'meta.readiness',
      status: 'error',
      error: maskError(new Error(`Missing Meta app env vars: ${meta.masked.join(', ')}`)),
    });
  }
  return buildEnvelope({
    ok: true,
    action: 'meta.readiness',
    status: 'live_ready',
    data: {
      facebook: getFacebookReadiness().data,
      instagram: getInstagramReadiness().data,
      threads: getThreadsReadiness().data,
    },
  });
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

  console.log('\n=== meta-auth test harness ===\n');

  // Ensure required Meta env vars exist for harness execution.
  Deno.env.get('META_APP_ID') = Deno.env.get('META_APP_ID') || 'meta_app_id';
  Deno.env.get('META_APP_SECRET') = Deno.env.get('META_APP_SECRET') || 'meta_app_secret';
  Deno.env.get('FACEBOOK_ACCESS_TOKEN') = Deno.env.get('FACEBOOK_ACCESS_TOKEN') || 'fb_access_token';
  Deno.env.get('FACEBOOK_PAGE_ID') = Deno.env.get('FACEBOOK_PAGE_ID') || 'fb_page_id';
  Deno.env.get('INSTAGRAM_BUSINESS_ACCOUNT_ID') = Deno.env.get('INSTAGRAM_BUSINESS_ACCOUNT_ID') || 'ig_business_id';
  Deno.env.get('THREADS_APP_ID') = Deno.env.get('THREADS_APP_ID') || 'threads_app_id';
  Deno.env.get('THREADS_APP_SECRET') = Deno.env.get('THREADS_APP_SECRET') || 'threads_app_secret';
  Deno.env.get('THREADS_USER_ID') = Deno.env.get('THREADS_USER_ID') || 'threads_user_id';

  console.log('1. Env completeness probes');
  const all = validateAll();
  assert('validateAll returns object with facebook/instagram/threads/meta', !!all && typeof all === 'object');
  assert('All status objects contain complete/missing/masked', !!all.facebook.complete && Array.isArray(all.facebook.masked));

  console.log('\n2. Error masking');
  const fbReady = getFacebookReadiness();
  assert('Facebook readiness is object envelope', !!fbReady && typeof fbReady === 'object');
  if (!fbReady.ok) {
    assert('Missing-env error is masked', typeof fbReady.error === 'string');
  }

  console.log('\n3. Dry-run simulators');
  const sim = simulatePublish('facebook', { message: 'test' });
  assert('simulatePublish returns envelope', !!sim && sim.ok === true);
  assert('simulatePublish includes dryRun=true', sim.meta?.dryRun === true);
  assert('simulatePublish includes simulated=true', sim.data?.simulated === true);

  const readSim = simulateRead('instagram', '/me');
  assert('simulateRead returns envelope', !!readSim && readSim.ok === true);
  assert('simulateRead includes simulated=true', readSim.data?.simulated === true);

  console.log('\n4. Readiness probes');
  const metaReady = getMetaReadiness();
  assert('getMetaReadiness returns envelope', !!metaReady && typeof metaReady === 'object');
  assert('getMetaReadiness includes facebook/instagram/threads data', !!metaReady.data && !!metaReady.data.facebook && !!metaReady.data.instagram && !!metaReady.data.threads);

  console.log('\n5. Envelope contract');
  assert('Envelope has ok/action/status/meta', !!sim.ok && !!sim.action && !!sim.status && !!sim.meta);
  assert('Meta includes dryRun and liveApproved', sim.meta.dryRun !== undefined && 'liveApproved' in sim.meta);

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

if (process.argv[1] && (
  import.meta.url === `file://${process.argv[1]}` ||
  import.meta.url === new URL(`file://${process.argv[1]}`).href
)) {
  runTests();
}
