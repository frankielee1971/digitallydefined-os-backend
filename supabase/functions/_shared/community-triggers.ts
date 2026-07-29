/**
 * lib/community-triggers.js
 *
 * Community/audience trigger definitions and lightweight handler for
 * DigitallyDefined sellable automation:
 * - Event/shape validation for configured community triggers
 * - Dry-run safe simulation of trigger evaluation
 * - Readiness and capability listing for Wave 2-5 activations
 *
 * Constraints:
 * - Dry-run by default.
 * - No live social API calls here; those belong in Wave 3+ publisher modules.
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
const COMMUNITY_ENV = {
  BREVO_LIST_ID: Deno.env.get('BREVO_LIST_ID') || Deno.env.get('SELLABLE_BREVO_LIST_ID') || null,
  SELLABLE_FROM_EMAIL: Deno.env.get('SELLABLE_FROM_EMAIL') || null,
  NOTION_TOKEN: Deno.env.get('NOTION_TOKEN') || null,
  SUPABASE_URL: Deno.env.get('SUPABASE_URL') || null,
  SUPABASE_ANON_KEY: Deno.env.get('SUPABASE_ANON_KEY') || null,
  TELEGRAM_BOT_TOKEN: Deno.env.get('TELEGRAM_BOT_TOKEN') || null,
  SLACK_BOT_TOKEN: Deno.env.get('SLACK_BOT_TOKEN') || null,
  FACEBOOK_PAGE_ID: Deno.env.get('FACEBOOK_PAGE_ID') || null,
  INSTAGRAM_BUSINESS_ACCOUNT_ID: Deno.env.get('INSTAGRAM_BUSINESS_ACCOUNT_ID') || null,
  THREADS_USER_ID: Deno.env.get('THREADS_USER_ID') || null,
};

// -------------------------------
// Trigger definition schema
// -------------------------------
// Trigger categories map to Phase 19 waves.
export const COMMUNITY_TRIGGER_CATEGORIES = {
  onboarding: 'Wave 2 / Core automation',
  publishing: 'Wave 3 / Social publishers',
  community: 'Wave 4 / Community helpers',
  growth: 'Wave 5 / Growth integrations',
  storage: 'Wave 1 / Notion substrate',
};

// Sellable trigger definitions: name, category, source, description.
// These are configuration contracts, not executable integrations.
export const COMMUNITY_TRIGGERS = [
  { name: 'new_brevo_contact', category: 'onboarding', source: 'brevo', description: 'New contact added to onboarding list.' },
  { name: 'new_buyer_sale', category: 'onboarding', source: 'gumroad', description: 'New Gumroad sale event.' },
  { name: 'new_digital_product', category: 'storage', source: 'notion', description: 'New digital product recorded.' },
  { name: 'new_idea_added', category: 'storage', source: 'notion', description: 'New idea added to Ideas & Intake.' },
  { name: 'new_notion_page', category: 'storage', source: 'notion', description: 'Any new Notion page event.' },
  { name: 'facebook_comment', category: 'publishing', source: 'facebook', description: 'New comment on a managed post/page.' },
  { name: 'instagram_comment', category: 'publishing', source: 'instagram', description: 'New comment on an Instagram post.' },
  { name: 'threads_reply', category: 'publishing', source: 'threads', description: 'New reply on a Threads post.' },
  { name: 'slack_channel_event', category: 'community', source: 'slack', description: 'Channel event for community helpers.' },
  { name: 'telegram_update', category: 'community', source: 'telegram', description: 'Inbound Telegram update event.' },
  { name: 'supabase_broadcast', category: 'community', source: 'supabase', description: 'Realtime broadcast event for community state.' },
  { name: 'linkedin_event', category: 'growth', source: 'linkedin', description: 'LinkedIn engagement/update event.' },
  { name: 'tiktok_event', category: 'growth', source: 'tiktok', description: 'TikTok engagement/video event.' },
  { name: 'youtube_event', category: 'growth', source: 'youtube', description: 'YouTube Shorts engagement event.' },
  { name: 'pinterest_event', category: 'growth', source: 'pinterest', description: 'Pinterest pin/board event.' },
  { name: 'google_sheets_change', category: 'growth', source: 'google_sheets', description: 'Spreadsheet change event for growth tracking.' },
];

// -------------------------------
// Envelope + dry-run contract
// -------------------------------
function ensureEnvelope({ ok = true, action, status = 'success', data = null, error = null, meta = {} }) {
  return buildEnvelope({ ok, action, status, data, error, meta });
}

// -------------------------------
// Validation
// -------------------------------
export function validateCommunityTriggerPayload(payload = {}) {
  if (payload === null || payload === undefined || typeof payload !== 'object') {
    return { valid: false, error: 'Payload must be an object.' };
  }
  if (!safeStringify(payload)) {
    return { valid: false, error: 'Payload is not JSON safe.' };
  }
  const name = String(payload.triggerName || payload.name || '').trim();
  if (!name) {
    return { valid: false, error: 'Payload is missing triggerName.' };
  }
  const matched = COMMUNITY_TRIGGERS.find(t => t.name === name);
  if (!matched) {
    return { valid: false, error: `Unknown trigger: ${name}`, validTriggers: COMMUNITY_TRIGGERS.map(t => t.name) };
  }
  return { valid: true, trigger: matched };
}

export function validateCommunityEnv() {
  const missing = [];
  if (!COMMUNITY_ENV.BREVO_LIST_ID) missing.push('SELLABLE_BREVO_LIST_ID');
  if (!COMMUNITY_ENV.SELLABLE_FROM_EMAIL) missing.push('SELLABLE_FROM_EMAIL');

  return {
    complete: missing.length === 0,
    missing,
    masked: missing.map(k => `${k}=${maskError(new Error('missing'))}`),
  };
}

// -------------------------------
// Dry-run simulators
// -------------------------------
export function simulateEvaluateTrigger({ triggerName = '', source = '', params = {} } = {}) {
  const matched = COMMUNITY_TRIGGERS.find(t => t.name === triggerName);
  if (!matched) {
    return ensureEnvelope({
      ok: false,
      action: 'community.trigger.evaluate',
      status: 'validation_failed',
      error: `Unknown trigger: ${triggerName}`,
      meta: { validTriggers: COMMUNITY_TRIGGERS.map(t => t.name) },
    });
  }
  return ensureEnvelope({
    action: 'community.trigger.evaluate',
    status: 'completed',
    data: {
      triggerName: matched.name,
      category: matched.category,
      source: matched.source,
      description: matched.description,
      evaluated: true,
      simulationParams: params || {},
      simulated: true,
    },
    meta: { simulated: true },
  });
}

export function simulateCreateTriggerEvent({ triggerName = '', source = '', occurredAt = null } = {}) {
  const matched = COMMUNITY_TRIGGERS.find(t => t.name === triggerName);
  if (!matched) {
    return ensureEnvelope({
      ok: false,
      action: 'community.event.create',
      status: 'validation_failed',
      error: `Unknown trigger: ${triggerName}`,
      meta: { validTriggers: COMMUNITY_TRIGGERS.map(t => t.name) },
    });
  }
  return ensureEnvelope({
    action: 'community.event.create',
    status: 'completed',
    data: {
      eventId: `dry-event-${Date.now()}`,
      triggerName: matched.name,
      category: matched.category,
      source: matched.source,
      occurredAt: occurredAt || new Date().toISOString(),
      simulated: true,
    },
    meta: { simulated: true },
  });
}

// -------------------------------
// Readiness / capability listing
// -------------------------------
export function getCommunityTriggersReadiness() {
  const env = validateCommunityEnv();
  if (!env.complete) {
    return ensureEnvelope({
      ok: false,
      action: 'community-triggers.readiness',
      status: 'error',
      error: maskError(new Error(`Missing community env vars: ${env.masked.join(', ')}`)),
    });
  }
  return ensureEnvelope({
    ok: true,
    action: 'community-triggers.readiness',
    status: dryRunEnabled() ? 'dry_run' : 'live_ready',
    data: {
      triggerCount: COMMUNITY_TRIGGERS.length,
      categories: Object.keys(COMMUNITY_TRIGGER_CATEGORIES),
      waveMapping: COMMUNITY_TRIGGER_CATEGORIES,
      dryRun: dryRunEnabled(),
      liveApproved: isLiveExecutionAllowed(),
    },
  });
}

export function listCommunityTriggers(options = {}) {
  const category = String(options.category || '').trim().toLowerCase();
  const source = String(options.source || '').trim().toLowerCase();
  let items = COMMUNITY_TRIGGERS.slice();
  if (category) items = items.filter(t => String(t.category).toLowerCase() === category);
  if (source) items = items.filter(t => String(t.source).toLowerCase() === source);
  return ensureEnvelope({
    action: 'community-triggers.list',
    status: 'success',
    data: items,
    meta: { simulated: true, category, source },
  });
}

// -------------------------------
// Handler entrypoint
// -------------------------------
export function handleCommunityTriggerRequest(req) {
  const action = String(req?.action || '').trim().toLowerCase();
  const payload = req?.payload || req?.data || {};

  if (action === 'dry_run' || action === 'community-triggers.readiness') {
    return getCommunityTriggersReadiness();
  }
  if (action === 'community-triggers.list') {
    return listCommunityTriggers(payload);
  }
  if (action === 'community.trigger.evaluate') {
    return simulateEvaluateTrigger(payload);
  }
  if (action === 'community.event.create') {
    return simulateCreateTriggerEvent(payload);
  }

  return dryRunPayload('Community Triggers');
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

  console.log('\n=== community-triggers test harness ===\n');

  console.log('1. Trigger registry');
  assert('COMMUNITY_TRIGGERS is array', Array.isArray(COMMUNITY_TRIGGERS));
  assert('COMMUNITY_TRIGGERS has expected names', COMMUNITY_TRIGGERS.some(t => t.name === 'new_brevo_contact'));
  assert('COMMUNITY_TRIGGER_CATEGORIES has expected keys', 'onboarding' in COMMUNITY_TRIGGER_CATEGORIES);

  console.log('\n2. Env validation');
  const env = validateCommunityEnv();
  assert('validateCommunityEnv returns object', typeof env === 'object');
  assert('validateCommunityEnv has complete', typeof env.complete === 'boolean');
  assert('validateCommunityEnv masked strings are present', env.masked.length > 0);

  console.log('\n3. Readiness and listings');
  const readiness = getCommunityTriggersReadiness();
  assert('getCommunityTriggersReadiness returns envelope', typeof readiness === 'object');
  assert('getCommunityTriggersReadiness has dryRun/liveApproved meta', readiness.meta?.dryRun !== undefined);

  const listAll = listCommunityTriggers();
  assert('listCommunityTriggers returns envelope', !!listAll && listAll.ok === true);
  assert('listCommunityTriggers returns all triggers by default', listAll.data?.length === COMMUNITY_TRIGGERS.length);

  const listFiltered = listCommunityTriggers({ category: 'Wave 2 / Core automation' });
  assert('listCommunityTriggers filters category', listFiltered.data?.every(item => item.category === 'Wave 2 / Core automation'));

  console.log('\n4. Validation shapes');
  assert('valid trigger payload passes', validateCommunityTriggerPayload({ triggerName: 'new_brevo_contact' }).valid);
  assert('invalid trigger payload fails', !validateCommunityTriggerPayload(null).valid);
  assert('unknown trigger name fails', !validateCommunityTriggerPayload({ triggerName: 'missing' }).valid);

  console.log('\n5. Dry-run simulators');
  const evaluated = simulateEvaluateTrigger({ triggerName: 'new_buyer_sale', params: { saleId: '123' } });
  assert('simulateEvaluateTrigger returns envelope', !!evaluated && evaluated.ok === true);
  assert('simulateEvaluateTrigger preserves trigger metadata', evaluated.data?.source === 'gumroad');

  const created = simulateCreateTriggerEvent({ triggerName: 'new_brevo_contact' });
  assert('simulateCreateTriggerEvent returns envelope', !!created && created.ok === true);
  assert('simulateCreateTriggerEvent includes simulated event id', typeof created.data?.eventId === 'string');

  console.log('\n6. Handler entrypoint');
  const handler = handleCommunityTriggerRequest({ action: 'community-triggers.readiness' });
  assert('handler returns readiness in dry-run', handler.meta?.dryRun === true);
  assert('handler unknown action falls back to dry-run', handleCommunityTriggerRequest({ action: 'unknown' }).action === 'dry_run');

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

if (process.argv[1] && new URL(process.argv[1]).pathname.endsWith('community-triggers.js')) {
  runTests();
}
