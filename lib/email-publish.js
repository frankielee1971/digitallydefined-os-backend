/**
 * lib/email-publish.js
 *
 * Email/publishing substrate for DigitallyDefined sellable automation:
 * - Brevo email platform env validation + dry-run simulators
 * - Publisher integration simulators (Facebook, Instagram, Threads)
 * - Shared dry-run, CORS, masking, and envelope helpers
 *
 * Constraints:
 * - Dry-run by default.
 * - No internal OS modules referenced.
 * - No hardcoded credentials.
 * - Designed for buy-safe sellable routes only.
 */

import {
  dryRunEnabled,
  isLiveExecutionAllowed,
  requireDryRunGuard,
  maskError,
  buildEnvelope,
  dryRunPayload,
  safeStringify,
} from './sellable-auth.js';

// -------------------------------
// Env requirements (documented)
// -------------------------------
export const EMAIL_PUBLISH_ENV = {
  brevoApiKey: process.env.BREVO_API_KEY || null,
  brevoListId: process.env.BREVO_LIST_ID || null,
  fromEmail: process.env.BREVO_FROM_EMAIL || process.env.SELLABLE_FROM_EMAIL || null,
  fromName: process.env.BREVO_FROM_NAME || process.env.SELLABLE_FROM_NAME || 'DigitallyDefined',
  onboardingDays: Number(process.env.SELLABLE_ONBOARDING_DAYS || 30),
};

// -------------------------------
// Envelope + dry-run contract
// -------------------------------
function ensureEnvelope({ ok = true, action, status = 'success', data = null, error = null, meta = {} }) {
  return buildEnvelope({ ok, action, status, data, error, meta });
}

function simulateEnvelope(action, extra = {}) {
  return ensureEnvelope({
    action,
    status: 'completed',
    data: { simulated: true, id: `dry-${action.replace(/\./g, '-')}-${Date.now()}`, ...extra },
    meta: { simulated: true },
  });
}

// -------------------------------
// Validation
// -------------------------------
export function validateEmailPublishEnv() {
  const missing = [];
  if (!EMAIL_PUBLISH_ENV.brevoApiKey) missing.push('BREVO_API_KEY');
  if (!EMAIL_PUBLISH_ENV.fromEmail) missing.push('SELLABLE_FROM_EMAIL');
  if (!EMAIL_PUBLISH_ENV.brevoListId) missing.push('BREVO_LIST_ID');

  return {
    complete: missing.length === 0,
    missing,
    masked: missing.map(k => `${k}=${maskError(new Error('missing'))}`),
  };
}

export function validatePublisherPayload(payload) {
  if (payload === null || payload === undefined || typeof payload !== 'object') {
    return { valid: false, error: 'Payload must be an object.' };
  }
  if (!safeStringify(payload)) {
    return { valid: false, error: 'Payload is not JSON safe.' };
  }
  return { valid: true };
}

// -------------------------------
// Dry-run simulators
// -------------------------------
export function simulateBrevoSendCampaign({ name = 'Unnamed campaign', listId = null, subject = '', html = '' } = {}) {
  return simulateEnvelope('email.brevo.sendCampaign', {
    campaignName: name,
    listId: listId || EMAIL_PUBLISH_ENV.brevoListId,
    subject,
    previewHtml: (html || '').slice(0, 120),
  });
}

export function simulateBrevoSendTransactional({ to = '', subject = '', html = '' } = {}) {
  return simulateEnvelope('email.brevo.sendTransactional', {
    to,
    subject,
    previewHtml: (html || '').slice(0, 120),
  });
}

export function simulateBrevoListContacts({ listId = null, limit = 10 } = {}) {
  return simulateEnvelope('email.brevo.listContacts', {
    listId: listId || EMAIL_PUBLISH_ENV.brevoListId,
    limit,
    contacts: Array.from({ length: Math.min(limit, 5) }, (_, idx) => ({
      email: `buyer-${idx + 1}@example.local`,
      segment: ['Warm Lead', 'Paid Template', 'Bundle Buyer'][idx % 3],
    })),
  });
}

export function simulateBrevoUpsertContact({ email = '', attributes = {}, listIds = [] } = {}) {
  return simulateEnvelope('email.brevo.upsertContact', {
    email: email || 'buyer@example.local',
    attributes,
    listIds: listIds.length ? listIds : [EMAIL_PUBLISH_ENV.brevoListId].filter(Boolean),
  });
}

export function simulatePublisherPublish({ provider = 'facebook', content = '', pageId = '' } = {}) {
  const supported = ['facebook', 'instagram', 'threads'];
  if (!supported.includes(provider)) {
    return ensureEnvelope({
      ok: false,
      action: `publisher.${provider}.publish`,
      status: 'validation_failed',
      error: `Unsupported publisher: ${provider}. Supported: ${supported.join(', ')}`,
      meta: { supportedProviders: supported },
    });
  }
  return simulateEnvelope(`publisher.${provider}.publish`, {
    provider,
    contentLength: String(content || '').length,
    pageId,
  });
}

// -------------------------------
// Browse helpers
// -------------------------------
export function getEmailPublishReadiness() {
  const env = validateEmailPublishEnv();
  if (!env.complete) {
    return ensureEnvelope({
      ok: false,
      action: 'email-publish.readiness',
      status: 'error',
      error: maskError(new Error(`Missing email/publish env vars: ${env.masked.join(', ')}`)),
    });
  }
  return ensureEnvelope({
    ok: true,
    action: 'email-publish.readiness',
    status: dryRunEnabled() ? 'dry_run' : 'live_ready',
    data: {
      brevoConfigured: Boolean(EMAIL_PUBLISH_ENV.brevoApiKey),
      fromEmail: EMAIL_PUBLISH_ENV.fromEmail,
      listId: EMAIL_PUBLISH_ENV.brevoListId,
      supportedPublishers: ['facebook', 'instagram', 'threads'],
      dryRun: dryRunEnabled(),
      liveApproved: isLiveExecutionAllowed(),
    },
  });
}

export function listEmailPublishCapabilities() {
  return ensureEnvelope({
    action: 'email-publish.capabilities',
    status: 'success',
    data: {
      email: ['brevo.sendCampaign', 'brevo.sendTransactional', 'brevo.listContacts', 'brevo.upsertContact'],
      publishing: ['publisher.facebook.publish', 'publisher.instagram.publish', 'publisher.threads.publish'],
    },
    meta: { simulated: true },
  });
}

// -------------------------------
// Wired handler entrypoint
// -------------------------------
export function handleEmailPublishRequest(req) {
  const action = String(req?.action || '').trim().toLowerCase();
  const payload = req?.payload || req?.data || {};

  if (!dryRunEnabled() && isLiveExecutionAllowed()) {
    // Live execution path is intentionally left unimplemented in Wave 1 Step 3.
    return ensureEnvelope({
      ok: false,
      action,
      status: 'live_not_implemented',
      error: 'Live email/publish execution is not implemented in Wave 1 Step 3.',
      meta: { dryRun: false, liveApproved: true },
    });
  }

  switch (action) {
    case 'dry_run':
    case 'email-publish.readiness':
      return getEmailPublishReadiness();
    case 'email.brevo.sendCampaign':
      return simulateBrevoSendCampaign(payload);
    case 'email.brevo.sendTransactional':
      return simulateBrevoSendTransactional(payload);
    case 'email.brevo.listContacts':
      return simulateBrevoListContacts(payload);
    case 'email.brevo.upsertContact':
      return simulateBrevoUpsertContact(payload);
    case 'publisher.facebook.publish':
    case 'publisher.instagram.publish':
    case 'publisher.threads.publish': {
      const provider = String(action).split('.')[1];
      return simulatePublisherPublish({ provider, ...payload });
    }
    case 'email-publish.capabilities':
      return listEmailPublishCapabilities();
    case 'dry-run':
    default:
      return dryRunPayload('Email/Publish');
  }
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

  console.log('\n=== email-publish test harness ===\n');

  console.log('1. Env validation');
  const env = validateEmailPublishEnv();
  assert('validateEmailPublishEnv returns object', typeof env === 'object');
  assert('validateEmailPublishEnv has complete', typeof env.complete === 'boolean');
  assert('validateEmailPublishEnv has masked error strings', env.masked.every(m => typeof m === 'string'));

  console.log('\n2. Readiness and capabilities');
  const readiness = getEmailPublishReadiness();
  assert('getEmailPublishReadiness returns envelope', typeof readiness === 'object');
  assert('getEmailPublishReadiness has dryRun/liveApproved meta', readiness.meta?.dryRun !== undefined);

  const capabilities = listEmailPublishCapabilities();
  assert('listEmailPublishCapabilities returns envelope', !!capabilities && capabilities.ok === true);
  assert('listEmailPublishCapabilities has email + publishing entries', capabilities.data?.email?.length > 0 && capabilities.data?.publishing?.length > 0);

  console.log('\n3. Dry-run simulators');
  const campaign = simulateBrevoSendCampaign({ name: 'Onboarding 7-day', listId: 'list-1' });
  assert('simulateBrevoSendCampaign returns envelope', !!campaign && campaign.ok === true);
  assert('simulateBrevoSendCampaign is simulated', campaign.data?.simulated === true);

  const transactional = simulateBrevoSendTransactional({ to: 'buyer@example.local', subject: 'Welcome' });
  assert('simulateBrevoSendTransactional returns envelope', !!transactional && transactional.ok === true);

  const contacts = simulateBrevoListContacts({ listId: 'list-1', limit: 3 });
  assert('simulateBrevoListContacts returns contacts array', Array.isArray(contacts.data?.contacts));

  const upsert = simulateBrevoUpsertContact({ email: 'buyer@example.local', listIds: ['list-1'] });
  assert('simulateBrevoUpsertContact returns envelope', !!upsert && upsert.ok === true);

  const fb = simulatePublisherPublish({ provider: 'facebook', pageId: 'page-1' });
  assert('simulatePublisherPublish facebook returns envelope', !!fb && fb.ok === true);
  assert('simulatePublisherPublish unknown provider fails', !simulatePublisherPublish({ provider: 'unknown' }).ok);

  console.log('\n4. Handler entrypoint');
  const handlerDryRun = handleEmailPublishRequest({ action: 'email-publish.readiness' });
  assert('handler returns readonly envelope in dry-run mode', !!handlerDryRun && handlerDryRun.meta?.dryRun === true);
  assert('handler unknown action falls back to dry-run payload', handleEmailPublishRequest({ action: 'unknown' }).action === 'dry_run');

  console.log('\n5. Validation shapes');
  assert('valid payload passes', validatePublisherPayload({ hello: 'world' }).valid);
  assert('invalid payload fails', !validatePublisherPayload(null).valid);

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

if (process.argv[1] && new URL(process.argv[1]).pathname.endsWith('email-publish.js')) {
  runTests();
}
