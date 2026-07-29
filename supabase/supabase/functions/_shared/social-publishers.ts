/**
 * lib/social-publishers.js
 *
 * Wave 3 publisher substrate for Facebook, Instagram, and Threads.
 * Core behaviors:
 * - dry-run simulators for each publisher
 * - readiness/capability listing
 * - env validation without secret leakage
 * - envelope-compliant responses
 * - local test harness
 *
 * Constraints:
 * - Dry-run by default.
 * - No live social API calls here; those belong in Wave 3 auth or future live wrappers.
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
const PUBLISHER_ENV = {
  FACEBOOK_PAGE_ID: Deno.env.get('FACEBOOK_PAGE_ID') || null,
  FACEBOOK_PAGE_ACCESS_TOKEN: Deno.env.get('FACEBOOK_PAGE_ACCESS_TOKEN') || null,
  INSTAGRAM_BUSINESS_ACCOUNT_ID: Deno.env.get('INSTAGRAM_BUSINESS_ACCOUNT_ID') || null,
  INSTAGRAM_ACCESS_TOKEN: Deno.env.get('INSTAGRAM_ACCESS_TOKEN') || null,
  THREADS_USER_ID: Deno.env.get('THREADS_USER_ID') || null,
  THREADS_ACCESS_TOKEN: Deno.env.get('THREADS_ACCESS_TOKEN') || null,
  LINKEDIN_ACCESS_TOKEN: Deno.env.get('LINKEDIN_ACCESS_TOKEN') || null,
  LINKEDIN_ORGANIZATION_ID: Deno.env.get('LINKEDIN_ORGANIZATION_ID') || null,
  TIKTOK_ACCESS_TOKEN: Deno.env.get('TIKTOK_ACCESS_TOKEN') || null,
  YOUTUBE_API_KEY: Deno.env.get('YOUTUBE_API_KEY') || null,
  YOUTUBE_CHANNEL_ID: Deno.env.get('YOUTUBE_CHANNEL_ID') || null,
  PINTEREST_ACCESS_TOKEN: Deno.env.get('PINTEREST_ACCESS_TOKEN') || null,
  GOOGLE_SHEETS_ID: Deno.env.get('GOOGLE_SHEETS_ID') || null,
  GOOGLE_SHEETS_API_KEY: Deno.env.get('GOOGLE_SHEETS_API_KEY') || null,
};

// -------------------------------
// Publisher definition schema
// -------------------------------
export const PUBLISHER_DEFS = [
  {
    name: 'facebook',
    category: 'publishing',
    source: 'facebook',
    description: 'Facebook Page publisher. Supports dry-run post simulation, readiness check, and capability listing.',
    capabilities: ['publish_post', 'read_page', 'list_posts', 'search_posts'],
    requiredEnv: ['FACEBOOK_PAGE_ID', 'FACEBOOK_PAGE_ACCESS_TOKEN'],
  },
  {
    name: 'instagram',
    category: 'publishing',
    source: 'instagram',
    description: 'Instagram Business Account publisher. Supports dry-run post simulation, readiness check, and capability listing.',
    capabilities: ['publish_post', 'read_media', 'list_media', 'search_media'],
    requiredEnv: ['INSTAGRAM_BUSINESS_ACCOUNT_ID', 'INSTAGRAM_ACCESS_TOKEN'],
  },
  {
    name: 'threads',
    category: 'publishing',
    source: 'threads',
    description: 'Threads publisher. Supports dry-run post simulation, readiness check, and capability listing.',
    capabilities: ['publish_post', 'read_thread', 'list_threads', 'search_threads'],
    requiredEnv: ['THREADS_USER_ID', 'THREADS_ACCESS_TOKEN'],
  },
  {
    name: 'linkedin',
    category: 'publishing',
    source: 'linkedin',
    description: 'LinkedIn publisher. Supports dry-run post simulation, readiness check, and capability listing.',
    capabilities: ['publish_post', 'read_profile', 'list_posts'],
    requiredEnv: ['LINKEDIN_ACCESS_TOKEN', 'LINKEDIN_ORGANIZATION_ID'],
  },
  {
    name: 'tiktok',
    category: 'publishing',
    source: 'tiktok',
    description: 'TikTok publisher. Supports dry-run video/slide simulation, readiness check, and capability listing.',
    capabilities: ['publish_video', 'read_video', 'list_videos'],
    requiredEnv: ['TIKTOK_ACCESS_TOKEN'],
  },
  {
    name: 'youtube',
    category: 'publishing',
    source: 'youtube',
    description: 'YouTube publisher. Supports dry-run Shorts/upload simulation, readiness check, and capability listing.',
    capabilities: ['publish_short', 'read_channel', 'list_videos'],
    requiredEnv: ['YOUTUBE_API_KEY', 'YOUTUBE_CHANNEL_ID'],
  },
  {
    name: 'pinterest',
    category: 'publishing',
    source: 'pinterest',
    description: 'Pinterest publisher. Supports dry-run Pin simulation, readiness check, and capability listing.',
    capabilities: ['publish_pin', 'read_board', 'list_pins'],
    requiredEnv: ['PINTEREST_ACCESS_TOKEN'],
  },
  {
    name: 'google_sheets',
    category: 'publishing',
    source: 'google_sheets',
    description: 'Google Sheets helper. Supports dry-run row append simulation, readiness check, and capability listing.',
    capabilities: ['append_row', 'read_sheet', 'update_row'],
    requiredEnv: ['GOOGLE_SHEETS_ID', 'GOOGLE_SHEETS_API_KEY'],
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
export function validatePublisherPayload(payload = {}) {
  if (payload === null || payload === undefined || typeof payload !== 'object') {
    return { valid: false, error: 'Payload must be an object.' };
  }
  if (!safeStringify(payload)) {
    return { valid: false, error: 'Payload is not JSON safe.' };
  }
  const name = String(payload.publisherName || payload.name || payload.source || '').trim().toLowerCase();
  if (!name) {
    return { valid: false, error: 'Payload is missing publisherName.' };
  }
  const matched = PUBLISHER_DEFS.find(p => p.name === name);
  if (!matched) {
    return {
      valid: false,
      error: `Unknown publisher: ${name}`,
      validPublishers: PUBLISHER_DEFS.map(p => p.name),
      validSources: [...new Set(PUBLISHER_DEFS.map(p => p.source))],
    };
  }
  return { valid: true, publisher: matched };
}

export function validatePublisherEnv() {
  const missingByPublisher = {};
  for (const pub of PUBLISHER_DEFS) {
    const missing = pub.requiredEnv.filter(k => !PUBLISHER_ENV[k]);
    if (missing.length > 0) {
      missingByPublisher[pub.name] = missing;
    }
  }
  const missingLive = Object.entries(missingByPublisher).flatMap(([name, keys]) =>
    keys.map(k => `${name}:${k}`)
  );
  return {
    complete: missingLive.length === 0,
    missingByPublisher,
    missing: missingLive,
    masked: missingLive.map(k => `${k}=${maskError(new Error('missing'))}`),
  };
}

// -------------------------------
// Dry-run simulators
// -------------------------------
export function simulatePublishPost({ publisherName = '', content = '', targetId = null, options = {} } = {}) {
  const matched = PUBLISHER_DEFS.find(p => p.name === String(publisherName).trim().toLowerCase());
  if (!matched) {
    return ensureEnvelope({
      ok: false,
      action: 'publisher.publish',
      status: 'validation_failed',
      error: `Unknown publisher: ${publisherName}`,
      meta: { validPublishers: PUBLISHER_DEFS.map(p => p.name) },
    });
  }
  return ensureEnvelope({
    ok: true,
    action: 'publisher.publish',
    status: 'completed',
    data: {
      publisher: matched.name,
      source: matched.source,
      content: String(content).slice(0, 280),
      targetId: targetId || `${matched.source}-simulated-post-${Date.now()}`,
      postId: `dry-post-${Date.now()}`,
      published: true,
      simulated: true,
    },
    meta: { simulated: true },
  });
}

export function simulateReadPublisher({ publisherName = '', targetId = null } = {}) {
  const matched = PUBLISHER_DEFS.find(p => p.name === String(publisherName).trim().toLowerCase());
  if (!matched) {
    return ensureEnvelope({
      ok: false,
      action: 'publisher.read',
      status: 'validation_failed',
      error: `Unknown publisher: ${publisherName}`,
      meta: { validPublishers: PUBLISHER_DEFS.map(p => p.name) },
    });
  }
  return ensureEnvelope({
    action: 'publisher.read',
    status: 'completed',
    data: {
      publisher: matched.name,
      source: matched.source,
      targetId: targetId || `${matched.source}-simulated-post-${Date.now()}`,
      items: [
        { id: `dry-item-1`, type: 'post', createdAt: new Date().toISOString(), simulated: true },
        { id: `dry-item-2`, type: 'post', createdAt: new Date(Date.now() - 86400000).toISOString(), simulated: true },
      ],
      simulated: true,
    },
    meta: { simulated: true },
  });
}

// -------------------------------
// Readiness / capability listing
// -------------------------------
export function getPublisherReadiness({ publisherName = '' } = {}) {
  const env = validatePublisherEnv();
  if (!env.complete && !dryRunEnabled()) {
    return ensureEnvelope({
      ok: false,
      action: 'publisher.readiness',
      status: 'error',
      error: maskError(new Error(`Missing publisher env vars: ${env.masked.join(', ')}`)),
    });
  }
  const target = String(publisherName).trim().toLowerCase();
  const items = target ? PUBLISHER_DEFS.filter(p => p.name === target) : PUBLISHER_DEFS;

  return ensureEnvelope({
    ok: true,
    action: 'publisher.readiness',
    status: dryRunEnabled() ? 'dry_run' : (env.complete ? 'live_ready' : 'partial'),
    data: {
      publishers: items.map(p => ({
        name: p.name,
        source: p.source,
        capabilities: p.capabilities,
        envConfigured: p.requiredEnv.every(k => !!PUBLISHER_ENV[k]),
      })),
      dryRun: dryRunEnabled(),
      liveApproved: isLiveExecutionAllowed(),
    },
  });
}

export function listPublishers(options = {}) {
  const category = String(options.category || '').trim().toLowerCase();
  const source = String(options.source || '').trim().toLowerCase();
  let items = PUBLISHER_DEFS.slice();
  if (category) items = items.filter(p => String(p.category).toLowerCase() === category);
  if (source) items = items.filter(p => String(p.source).toLowerCase() === source);
  return ensureEnvelope({
    action: 'publishers.list',
    status: 'success',
    data: items,
    meta: { category, source },
  });
}

// -------------------------------
// Handler entrypoint
// -------------------------------
export function handleSocialPublisherRequest(req) {
  const action = String(req?.action || '').trim().toLowerCase();
  const payload = req?.payload || req?.data || {};

  if (action === 'dry_run' || action === 'publisher.readiness') {
    return getPublisherReadiness(payload);
  }
  if (action === 'publishers.list') {
    return listPublishers(payload);
  }
  if (action === 'publisher.publish') {
    return simulatePublishPost(payload);
  }
  if (action === 'publisher.read') {
    return simulateReadPublisher(payload);
  }

  return dryRunPayload('Social Publishers');
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

  console.log('\n=== social-publishers test harness ===\n');

  console.log('1. Publisher registry');
  assert('PUBLISHER_DEFS is array', Array.isArray(PUBLISHER_DEFS));
  assert('PUBLISHER_DEFS has facebook', PUBLISHER_DEFS.some(p => p.name === 'facebook'));
  assert('PUBLISHER_DEFS has instagram', PUBLISHER_DEFS.some(p => p.name === 'instagram'));
  assert('PUBLISHER_DEFS has threads', PUBLISHER_DEFS.some(p => p.name === 'threads'));
  assert('PUBLISHER_DEFS has linkedin', PUBLISHER_DEFS.some(p => p.name === 'linkedin'));
  assert('PUBLISHER_DEFS has tiktok', PUBLISHER_DEFS.some(p => p.name === 'tiktok'));
  assert('PUBLISHER_DEFS has youtube', PUBLISHER_DEFS.some(p => p.name === 'youtube'));
  assert('PUBLISHER_DEFS has pinterest', PUBLISHER_DEFS.some(p => p.name === 'pinterest'));
  assert('PUBLISHER_DEFS has google_sheets', PUBLISHER_DEFS.some(p => p.name === 'google_sheets'));
  assert('PUBLISHER_DEFS has 8 publishers', PUBLISHER_DEFS.length === 8);

  console.log('\n2. Env validation');
  const env = validatePublisherEnv();
  assert('validatePublisherEnv returns object', typeof env === 'object');
  assert('validatePublisherEnv has complete', typeof env.complete === 'boolean');
  assert('validatePublisherEnv masked strings are present', env.masked.length > 0);

  console.log('\n3. Readiness and listings');
  const readiness = getPublisherReadiness();
  assert('getPublisherReadiness returns envelope', typeof readiness === 'object');
  assert('listPublishers returns all by default', listPublishers().data?.length === PUBLISHER_DEFS.length);

  console.log('\n4. Validation shapes');
  assert('valid publisher payload passes', validatePublisherPayload({ publisherName: 'facebook' }).valid);
  assert('invalid publisher payload fails', !validatePublisherPayload(null).valid);
  assert('unknown publisher name fails', !validatePublisherPayload({ publisherName: 'missing' }).valid);

  console.log('\n5. Dry-run simulators');
  const publish = simulatePublishPost({ publisherName: 'facebook', content: 'Hello Wave 3' });
  assert('simulatePublishPost returns envelope', !!publish && publish.ok === true);
  assert('simulatePublishPost preserves publisher metadata', publish.data?.source === 'facebook');

  const read = simulateReadPublisher({ publisherName: 'instagram' });
  assert('simulateReadPublisher returns envelope', !!read && read.ok === true);
  assert('simulateReadPublisher returns simulated items', Array.isArray(read.data?.items) && read.data?.items?.length > 0);

  console.log('\n6. Handler entrypoint');
  const handler = handleSocialPublisherRequest({ action: 'publisher.readiness' });
  assert('handler returns readiness in dry-run', handler.meta?.dryRun === true);
  assert('handler unknown action falls back to dry-run', handleSocialPublisherRequest({ action: 'unknown' }).meta?.dryRun === true);

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

if (process.argv[1] && new URL(process.argv[1]).pathname.endsWith('social-publishers.js')) {
  runTests();
}
