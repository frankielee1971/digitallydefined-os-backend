/**
 * lib/notion-schema.js
 *
 * Notion database/page schema definitions + helpers for DigitallyDefined
 * sellable automation: automation logging, sellable products, and customer
 * operations. No internal OS modules are referenced.
 *
 * - Dry-run by default.
 * - Validation limited to shape checks; content/IDs are never logged in production.
 * - Exposes reusable database schemas and lightweight ensure helpers.
 */

import { maskError, buildEnvelope, dryRunPayload, dryRunEnabled, isLiveExecutionAllowed, safeStringify } from './sellable-auth';

// -------------------------------
// Env requirements (documented)
// -------------------------------
const NOTION_ENV = {
  NOTION_TOKEN: Deno.env.get('NOTION_TOKEN') || null,
  NOTION_VERSION: Deno.env.get('NOTION_VERSION') || '2022-06-28',
};

// -------------------------------
// Schemas
// -------------------------------
export const AUTOMATION_LOG_DB_SCHEMA = {
  title: 'Automation Log',
  description: 'DigitallyDefined sellable automation execution log.',
  properties: {
    Action: { title: {} },
    Status: { select: { options: [{ name: 'Queued' }, { name: 'Running' }, { name: 'Succeeded' }, { name: 'Failed' }, { name: 'Dead Letter' }] } },
    Source: { select: { options: [{ name: 'api' }, { name: 'cron' }] } },
    Meta: { rich_text: {} },
    ErrorMasked: { rich_text: {} },
    GeneratedAt: { date: {} },
  },
};

export const SELLABLE_PRODUCTS_DB_SCHEMA = {
  title: 'Sellable Products',
  description: 'Product catalog indexed by sellable system.',
  properties: {
    ProductSlug: { title: {} },
    Name: { rich_text: {} },
    Status: { select: { options: [{ name: 'draft' }, { name: 'published' }, { name: 'archived' }] } },
    Wave: { select: { options: [{ name: 'publishing' }, { name: 'seo' }, { name: 'social' }] } },
    NotionPageId: { rich_text: {} },
    GumroadId: { rich_text: {} },
    Tags: { multi_select: { options: [{ name: 'Free Starter' }, { name: 'Paid Template' }, { name: 'Bundle Buyer' }, { name: 'High-Ticket Buyer' }] } },
    UpdatedAt: { date: {} },
  },
};

export const CUSTOMER_OPERATIONS_DB_SCHEMA = {
  title: 'Customer Operations',
  description: 'Gumroad customer summaries and follow-up actions.',
  properties: {
    SaleId: { title: {} },
    BuyerEmailHash: { rich_text: {} },
    ProductSlug: { rich_text: {} },
    Segment: { select: { options: [{ name: 'Free Starter' }, { name: 'Paid Template' }, { name: 'Bundle Buyer' }, { name: 'High-Ticket Buyer' }, { name: 'Returning Customer' }, { name: 'Warm Lead' }, { name: 'Cold Lead' }] } },
    Action: { rich_text: {} },
    Summary: { rich_text: {} },
    FollowUpStatus: { select: { options: [{ name: 'pending' }, { name: 'sent' }, { name: 'skipped' }] } },
    OccurredAt: { date: {} },
  },
};

// Lightweight registry of sellable automation schemas.
export const NOTION_SCHEMAS = {
  'Automation Log': AUTOMATION_LOG_DB_SCHEMA,
  'Sellable Products': SELLABLE_PRODUCTS_DB_SCHEMA,
  'Customer Operations': CUSTOMER_OPERATIONS_DB_SCHEMA,
};

// -------------------------------
// Envelope + dry-run contract
// -------------------------------
function ensureEnvelope({ ok = true, action, status = 'success', data = null, error = null, meta = {} }) {
  return buildEnvelope({ ok, action, status, data, error, meta });
}

// -------------------------------
// Validation
// -------------------------------
export function validateNotionEnv() {
  const missing = !NOTION_ENV.NOTION_TOKEN ? ['NOTION_TOKEN'] : [];
  return {
    complete: missing.length === 0,
    missing,
    masked: missing.map(k => `${k}=${maskError(new Error('missing'))}`),
  };
}

// Only check shape of a schema payload. Never assume any value is an actual Notion ID.
export function validateNotionSchema(schema) {
  if (!schema || typeof schema !== 'object') {
    return { valid: false, error: 'Schema must be an object.' };
  }
  if (!safeStringify(schema)) {
    return { valid: false, error: 'Schema is not JSON safe.' };
  }
  return { valid: true };
}

// -------------------------------
// Dry-run simulators
// -------------------------------
export function simulateCreateDatabase(name) {
  return ensureEnvelope({
    action: 'notion.database.create',
    status: 'completed',
    data: { name, simulated: true, id: `dry-db-${Date.now()}` },
    meta: { simulated: true },
  });
}

export function simulateUpsertPage(databaseName, properties = {}) {
  return ensureEnvelope({
    action: 'notion.page.upsert',
    status: 'completed',
    data: { databaseName, properties, simulated: true, id: `dry-page-${Date.now()}` },
    meta: { simulated: true },
  });
}

// -------------------------------
// Helpers
// -------------------------------
export function getNotionReadiness() {
  const env = validateNotionEnv();
  if (!env.complete) {
    return ensureEnvelope({
      ok: false,
      action: 'notion.readiness',
      status: 'error',
      error: maskError(new Error(`Missing Notion env vars: ${env.masked.join(', ')}`)),
    });
  }

  return ensureEnvelope({
    ok: true,
    action: 'notion.readiness',
    status: dryRunEnabled() ? 'dry_run' : 'live_ready',
    data: {
      schemas: Object.keys(NOTION_SCHEMAS),
      dryRun: dryRunEnabled(),
      liveApproved: isLiveExecutionAllowed(),
    },
  });
}

// Return schema metadata without performing a live Notion lookup.
export function listSellableNotionDatabases() {
  const names = Object.keys(NOTION_SCHEMAS);
  return ensureEnvelope({
    action: 'notion.databases.list',
    status: 'success',
    data: names.map(name => ({ name, schema: NOTION_SCHEMAS[name] })),
    meta: { simulated: true },
  });
}

// Simulate ensuring a database by name. In live mode this would be replaced by
// actual Notion create/update calls gated by requireDryRunGuard().
export function ensureSellableNotionDatabase(name) {
  if (!(name in NOTION_SCHEMAS)) {
    return ensureEnvelope({
      ok: false,
      action: 'notion.database.ensure',
      status: 'validation_failed',
      error: `Unknown sellable database: ${name}`,
      meta: { validNames: Object.keys(NOTION_SCHEMAS) },
    });
  }

  const schema = NOTION_SCHEMAS[name];
  const validation = validateNotionSchema(schema);
  if (!validation.valid) {
    return ensureEnvelope({
      ok: false,
      action: 'notion.database.ensure',
      status: 'validation_failed',
      error: validation.error,
      meta: { name },
    });
  }

  if (dryRunEnabled() || !isLiveExecutionAllowed()) {
    return simulateCreateDatabase(name);
  }

  return ensureEnvelope({
    action: 'notion.database.ensure',
    status: 'live_ready',
    data: { name, schema, note: 'Live Notion ensure not implemented in this step.' },
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

  console.log('\n=== notion-schema test harness ===\n');

  console.log('1. Env validation');
  const env = validateNotionEnv();
  assert('validateNotionEnv returns object', typeof env === 'object');
  assert('validateNotionEnv has complete', typeof env.complete === 'boolean');

  console.log('\n2. Schema validation');
  assert('valid schema passes', validateNotionSchema(AUTOMATION_LOG_DB_SCHEMA).valid);
  assert('invalid schema fails', !validateNotionSchema(null).valid);

  console.log('\n3. Dry-run simulators');
  const dbSim = simulateCreateDatabase('Automation Log');
  assert('simulateCreateDatabase returns envelope', !!dbSim && dbSim.ok === true);
  assert('simulateCreateDatabase includes simulated=true', dbSim.meta?.simulated === true);

  const pageSim = simulateUpsertPage('Sellable Products', { ProductSlug: 'test' });
  assert('simulateUpsertPage returns envelope', !!pageSim && pageSim.ok === true);
  assert('simulateUpsertPage includes simulated=true', pageSim.data?.simulated === true);

  console.log('\n4. Readiness and listings');
  const readiness = getNotionReadiness();
  assert('getNotionReadiness returns envelope', typeof readiness === 'object');
  assert('getNotionReadiness has dryRun/liveApproved meta', readiness.meta?.dryRun !== undefined);

  const listing = listSellableNotionDatabases();
  assert('listSellableNotionDatabases returns envelope', !!listing && listing.ok === true);
  assert('listSellableNotionDatabases contains Automation Log', listing.data?.some(item => item.name === 'Automation Log'));

  console.log('\n5. Ensure helper guards');
  const ensureBad = ensureSellableNotionDatabase('Missing DB');
  assert('ensureBad returns validation_failed', ensureBad.status === 'validation_failed');

  const ensureOk = ensureSellableNotionDatabase('Automation Log');
  assert('ensureOk returns dry-run simulated envelope by default', ensureOk.data?.simulated === true);

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

if (process.argv[1] && new URL(process.argv[1]).pathname.endsWith('notion-schema.js')) {
  runTests();
}
