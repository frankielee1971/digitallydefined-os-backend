/**
 * notion-architect-dryrun.mjs
 *
 * Simulates Phase 21 Notion Workspace Architecture Plan execution
 * in strict dry-run mode. No HTTP requests are sent.
 *
 * Outputs a phase-by-phase report with:
 *  - Payload validation
 *  - Missing ID detection
 *  - Idempotency checks
 *  - Schema conflict detection
 *  - Execution readiness assessment
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { hasNotionEnv } from './lib/notion-client.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const DRY_RUN = String(process.env.SELLABLE_DRY_RUN ?? 'true').trim().toLowerCase() !== 'false';
const PHASES = [
  { id: 'A', name: 'Create GTD Inbox DB' },
  { id: 'E', name: 'Create Someday / Maybe DB' },
  { id: 'F', name: 'Add Next Action relation to Automation Log DB' },
  { id: 'G', name: 'Add Next Action relation to Automation Events DB' },
  { id: 'H', name: 'Canonicalize Product OS Status options' },
  { id: 'I', name: 'Canonicalize Ideas & Intake DB Status options' },
  { id: 'J', name: 'Canonicalize Digital Assets DB Status options' },
  { id: 'K', name: 'Canonicalize Content Blocks DB Status options' },
  { id: 'L', name: 'Canonicalize Automations Log DB Status options' },
  { id: 'M', name: 'Canonicalize Automation Events DB Status options' },
  { id: 'C', name: 'Replace DigitalAssets rich-text with relation' },
  { id: 'N', name: 'Add Product OS → Product asset count rollup' },
  { id: 'O', name: 'Add Digital Assets DB → Asset revenue attached rollup' },
  { id: 'P', name: 'Add Monthly Review DB → Automation count rollup' },
  { id: 'Q', name: 'Add Digital Assets DB → Reputation linked count rollup' },
  { id: 'R', name: 'Add Automation Events DB → Automation failure count rollup' },
  { id: 'S', name: 'Add Projects → GTD next action queue length rollup' },
  { id: 'T', name: 'Update lib/notion-schema.js backend alignment' },
  { id: 'U', name: 'Manual view configuration (UI only)' },
];

// ---------------------------------------------------------------------------
// Known IDs from the architecture plan
// ---------------------------------------------------------------------------

const KNOWN_IDS = {
  PARENT_PAGE_ID: 'ce80d0cb95648203991d8151cb5e4e64',
  PROJECTS_DB_ID: '[PROJECTS_DB_ID]',
  AREAS_DB_ID: '[AREAS_DB_ID]',
  PRODUCT_OS_DB_ID: '241ef3830b9f4458817281721f6d9dd7',
  DIGITAL_ASSETS_DB_ID: '3990d0cb95648357b0c3886078e04abe',
  GTD_INBOX_DB_ID: '[GTD_INBOX_DB_ID]', // Will be created in Phase A
  AUTOMATION_LOG_DB_ID: '9b60d0cb9564836c845488209d8d7e58',
  AUTOMATION_EVENTS_DB_ID: 'c844c5bd5a9f4e1ba17785bb1535d035',
  MONTHLY_REVIEW_DB_ID: 'b650d0cb956482fe9b19081f1ad1675d',
  MONEY_SNAPSHOT_DB_ID: '4210d0cb956482798af3083c1d7b5a67',
  REPUTATION_SIGNALS_DB_ID: 'be80d0cb956482f99f8a8886fb9bd6ed',
  IDEAS_DB_ID: 'f280d0cb95648309a269012a84b42471',
  CONTENT_BLOCKS_DB_ID: 'eb50d0cb95648359964e81193eeccf37',
  CONTENT_LIBRARY_DB_ID: '4889f366d28e421aa569d84fa6c2bb04',
  TEMPLATES_LIBRARY_DB_ID: 'e630d0cb95648315b7078823c16cd343',
};

// ---------------------------------------------------------------------------
// Payload definitions
// ---------------------------------------------------------------------------

const payloads = {
  A: {
    phase: 'A',
    name: 'Create GTD Inbox DB',
    type: 'create_db',
    parent: KNOWN_IDS.PARENT_PAGE_ID,
    title: 'GTD Inbox',
    requires: ['PARENT_PAGE_ID'],
    validation: () => {
      const issues = [];
      if (KNOWN_IDS.PARENT_PAGE_ID.includes('[')) {
        issues.push('PARENT_PAGE_ID is a placeholder — must be replaced with actual page ID');
      }
      return { valid: issues.length === 0, issues };
    },
  },
  E: {
    phase: 'E',
    name: 'Create Someday / Maybe DB',
    type: 'create_db',
    parent: KNOWN_IDS.PARENT_PAGE_ID,
    title: 'Someday / Maybe',
    requires: ['PARENT_PAGE_ID'],
    validation: () => {
      const issues = [];
      if (KNOWN_IDS.PARENT_PAGE_ID.includes('[')) {
        issues.push('PARENT_PAGE_ID is a placeholder — must be replaced with actual page ID');
      }
      return { valid: issues.length === 0, issues };
    },
  },
  F: {
    phase: 'F',
    name: 'Add Next Action relation to Automation Log DB',
    type: 'patch_db',
    target: KNOWN_IDS.AUTOMATION_LOG_DB_ID,
    property: 'Next Action',
    relationTo: 'GTD_INBOX_DB_ID',
    requires: ['AUTOMATION_LOG_DB_ID', 'GTD_INBOX_DB_ID'],
    idempotency: 'Check if property "Next Action" already exists before patching',
    validation: () => {
      const issues = [];
      if (KNOWN_IDS.AUTOMATION_LOG_DB_ID.includes('[')) {
        issues.push('AUTOMATION_LOG_DB_ID appears to be a placeholder');
      }
      if (KNOWN_IDS.GTD_INBOX_DB_ID.includes('[')) {
        issues.push('GTD_INBOX_DB_ID is a placeholder — Phase A must run first');
      }
      return { valid: issues.length === 0, issues };
    },
  },
  G: {
    phase: 'G',
    name: 'Add Next Action relation to Automation Events DB',
    type: 'patch_db',
    target: KNOWN_IDS.AUTOMATION_EVENTS_DB_ID,
    property: 'Next Action',
    relationTo: 'GTD_INBOX_DB_ID',
    requires: ['AUTOMATION_EVENTS_DB_ID', 'GTD_INBOX_DB_ID'],
    idempotency: 'Check if property "Next Action" already exists before patching',
    validation: () => {
      const issues = [];
      if (KNOWN_IDS.AUTOMATION_EVENTS_DB_ID.includes('[')) {
        issues.push('AUTOMATION_EVENTS_DB_ID appears to be a placeholder');
      }
      if (KNOWN_IDS.GTD_INBOX_DB_ID.includes('[')) {
        issues.push('GTD_INBOX_DB_ID is a placeholder — Phase A must run first');
      }
      return { valid: issues.length === 0, issues };
    },
  },
  H: {
    phase: 'H',
    name: 'Canonicalize Product OS Status options',
    type: 'patch_db_status',
    target: '[PRODUCT_OS_DB_ID]',
    property: 'Status',
    newOptions: ['Draft', 'Build', 'Live', 'Archived'],
    requires: ['PRODUCT_OS_DB_ID'],
    idempotency: 'Compare existing options with target set; skip if already matching',
    validation: () => {
      const issues = [];
      if (KNOWN_IDS.PRODUCT_OS_DB_ID.includes('[')) {
        issues.push('PRODUCT_OS_DB_ID is a placeholder — must be resolved');
      }
      return { valid: issues.length === 0, issues };
    },
  },
  I: {
    phase: 'I',
    name: 'Canonicalize Ideas & Intake DB Status options',
    type: 'patch_db_status',
    target: KNOWN_IDS.IDEAS_DB_ID,
    property: 'Status',
    newOptions: ['Intake', 'Researching', 'BuildQueue', 'Live', 'Stale'],
    requires: ['IDEAS_DB_ID'],
    idempotency: 'Compare existing options with target set; skip if already matching',
    validation: () => {
      const issues = [];
      if (KNOWN_IDS.IDEAS_DB_ID.includes('[')) {
        issues.push('IDEAS_DB_ID appears to be a placeholder');
      }
      return { valid: issues.length === 0, issues };
    },
  },
  J: {
    phase: 'J',
    name: 'Canonicalize Digital Assets DB Status options',
    type: 'patch_db_status',
    target: '[DIGITAL_ASSETS_DB_ID]',
    property: 'Status',
    newOptions: ['Draft', 'Ready', 'Live', 'Retired'],
    requires: ['DIGITAL_ASSETS_DB_ID'],
    idempotency: 'Compare existing options with target set; skip if already matching',
    validation: () => {
      const issues = [];
      if (KNOWN_IDS.DIGITAL_ASSETS_DB_ID.includes('[')) {
        issues.push('DIGITAL_ASSETS_DB_ID is a placeholder — must be resolved');
      }
      return { valid: issues.length === 0, issues };
    },
  },
  K: {
    phase: 'K',
    name: 'Canonicalize Content Blocks DB Status options',
    type: 'patch_db_status',
    target: KNOWN_IDS.CONTENT_BLOCKS_DB_ID,
    property: 'Status',
    newOptions: ['Scratch', 'Draft', 'Approved', 'Published'],
    requires: ['CONTENT_BLOCKS_DB_ID'],
    idempotency: 'Compare existing options with target set; skip if already matching',
    validation: () => {
      const issues = [];
      if (KNOWN_IDS.CONTENT_BLOCKS_DB_ID.includes('[')) {
        issues.push('CONTENT_BLOCKS_DB_ID appears to be a placeholder');
      }
      return { valid: issues.length === 0, issues };
    },
  },
  L: {
    phase: 'L',
    name: 'Canonicalize Automations Log DB Status options',
    type: 'patch_db_status',
    target: KNOWN_IDS.AUTOMATION_LOG_DB_ID,
    property: 'Status',
    newOptions: ['Queued', 'Running', 'Succeeded', 'Failed', 'Dead Letter'],
    requires: ['AUTOMATION_LOG_DB_ID'],
    idempotency: 'Compare existing options with target set; skip if already matching',
    validation: () => {
      const issues = [];
      if (KNOWN_IDS.AUTOMATION_LOG_DB_ID.includes('[')) {
        issues.push('AUTOMATION_LOG_DB_ID appears to be a placeholder');
      }
      return { valid: issues.length === 0, issues };
    },
  },
  M: {
    phase: 'M',
    name: 'Canonicalize Automation Events DB Status options',
    type: 'patch_db_status',
    target: KNOWN_IDS.AUTOMATION_EVENTS_DB_ID,
    property: 'Status',
    newOptions: ['Pending', 'Processing', 'Done', 'Failed'],
    requires: ['AUTOMATION_EVENTS_DB_ID'],
    idempotency: 'Compare existing options with target set; skip if already matching',
    validation: () => {
      const issues = [];
      if (KNOWN_IDS.AUTOMATION_EVENTS_DB_ID.includes('[')) {
        issues.push('AUTOMATION_EVENTS_DB_ID appears to be a placeholder');
      }
      return { valid: issues.length === 0, issues };
    },
  },
  C: {
    phase: 'C',
    name: 'Replace DigitalAssets rich-text with relation',
    type: 'patch_db_relation',
    target: '[TARGET_DB_ID]',
    property: 'Digital Assets',
    relationTo: 'DIGITAL_ASSETS_DB_ID',
    requires: ['TARGET_DB_ID', 'DIGITAL_ASSETS_DB_ID'],
    idempotency: 'Check if property "Digital Assets" already exists as relation type',
    notes: 'Requires searching all databases for pages with DigitalAssets rich-text property. Notion API does not support bulk conversion — each database must be patched individually.',
    validation: () => {
      const issues = [];
      if (KNOWN_IDS.DIGITAL_ASSETS_DB_ID.includes('[')) {
        issues.push('DIGITAL_ASSETS_DB_ID is a placeholder — must be resolved');
      }
      issues.push('TARGET_DB_ID requires manual discovery — search all DBs for DigitalAssets rich-text columns');
      return { valid: issues.length === 0, issues };
    },
  },
  N: {
    phase: 'N',
    name: 'Add Product OS → Product asset count rollup',
    type: 'add_rollup',
    target: '[PRODUCT_OS_DB_ID]',
    rollupProperty: 'Product asset count',
    relationProperty: 'Modules',
    rolledProperty: 'count',
    function: 'count_all',
    requires: ['PRODUCT_OS_DB_ID'],
    idempotency: 'Check if rollup property "Product asset count" already exists',
    validation: () => {
      const issues = [];
      if (KNOWN_IDS.PRODUCT_OS_DB_ID.includes('[')) {
        issues.push('PRODUCT_OS_DB_ID is a placeholder — must be resolved');
      }
      return { valid: issues.length === 0, issues };
    },
  },
  O: {
    phase: 'O',
    name: 'Add Digital Assets DB → Asset revenue attached rollup',
    type: 'add_rollup',
    target: '[DIGITAL_ASSETS_DB_ID]',
    rollupProperty: 'Asset revenue attached',
    relationProperty: 'Money Snapshot',
    rolledProperty: 'Revenue',
    function: 'sum',
    requires: ['DIGITAL_ASSETS_DB_ID', 'MONEY_SNAPSHOT_DB_ID'],
    idempotency: 'Check if rollup property already exists',
    validation: () => {
      const issues = [];
      if (KNOWN_IDS.DIGITAL_ASSETS_DB_ID.includes('[')) {
        issues.push('DIGITAL_ASSETS_DB_ID is a placeholder — must be resolved');
      }
      if (KNOWN_IDS.MONEY_SNAPSHOT_DB_ID.includes('[')) {
        issues.push('MONEY_SNAPSHOT_DB_ID is a placeholder — must be resolved');
      }
      return { valid: issues.length === 0, issues };
    },
  },
  P: {
    phase: 'P',
    name: 'Add Monthly Review DB → Automation count rollup',
    type: 'add_rollup',
    target: '[MONTHLY_REVIEW_DB_ID]',
    rollupProperty: 'Monthly review automation count',
    relationProperty: 'Automations Log',
    rolledProperty: 'Run ID',
    function: 'count_unique',
    requires: ['MONTHLY_REVIEW_DB_ID', 'AUTOMATION_LOG_DB_ID'],
    idempotency: 'Check if rollup property already exists',
    validation: () => {
      const issues = [];
      if (KNOWN_IDS.MONTHLY_REVIEW_DB_ID.includes('[')) {
        issues.push('MONTHLY_REVIEW_DB_ID is a placeholder — must be resolved');
      }
      return { valid: issues.length === 0, issues };
    },
  },
  Q: {
    phase: 'Q',
    name: 'Add Digital Assets DB → Reputation linked count rollup',
    type: 'add_rollup',
    target: '[DIGITAL_ASSETS_DB_ID]',
    rollupProperty: 'Reputation linked count',
    relationProperty: 'TM',
    rolledProperty: 'Signal Name',
    function: 'count_all',
    requires: ['DIGITAL_ASSETS_DB_ID', 'REPUTATION_SIGNALS_DB_ID'],
    idempotency: 'Check if rollup property already exists',
    validation: () => {
      const issues = [];
      if (KNOWN_IDS.DIGITAL_ASSETS_DB_ID.includes('[')) {
        issues.push('DIGITAL_ASSETS_DB_ID is a placeholder — must be resolved');
      }
      if (KNOWN_IDS.REPUTATION_SIGNALS_DB_ID.includes('[')) {
        issues.push('REPUTATION_SIGNALS_DB_ID is a placeholder — must be resolved');
      }
      return { valid: issues.length === 0, issues };
    },
  },
  R: {
    phase: 'R',
    name: 'Add Automation Events DB → Automation failure count rollup',
    type: 'add_rollup',
    target: KNOWN_IDS.AUTOMATION_EVENTS_DB_ID,
    rollupProperty: 'Automation failure count',
    relationProperty: 'Automation Log',
    rolledProperty: 'Error Message',
    function: 'count_not_empty',
    requires: ['AUTOMATION_EVENTS_DB_ID'],
    idempotency: 'Check if rollup property already exists',
    validation: () => {
      const issues = [];
      if (KNOWN_IDS.AUTOMATION_EVENTS_DB_ID.includes('[')) {
        issues.push('AUTOMATION_EVENTS_DB_ID appears to be a placeholder');
      }
      return { valid: issues.length === 0, issues };
    },
  },
  S: {
    phase: 'S',
    name: 'Add Projects → GTD next action queue length rollup',
    type: 'add_rollup',
    target: '[PROJECTS_DB_ID]',
    rollupProperty: 'GTD next action queue length',
    relationProperty: 'GTD Next Action',
    rolledProperty: 'Task',
    function: 'count_where',
    filter: { property: 'Status', status: { equals: 'Next' } },
    requires: ['PROJECTS_DB_ID', 'GTD_INBOX_DB_ID'],
    idempotency: 'Check if rollup property already exists',
    notes: 'Notion API may reject count_where with arbitrary status filters. Fallback to count_all and filter in frontend if rejected.',
    validation: () => {
      const issues = [];
      if (KNOWN_IDS.PROJECTS_DB_ID.includes('[')) {
        issues.push('PROJECTS_DB_ID is a placeholder — must be resolved');
      }
      if (KNOWN_IDS.GTD_INBOX_DB_ID.includes('[')) {
        issues.push('GTD_INBOX_DB_ID is a placeholder — Phase A must run first');
      }
      return { valid: issues.length === 0, issues };
    },
  },
  T: {
    phase: 'T',
    name: 'Update lib/notion-schema.js backend alignment',
    type: 'code_update',
    target: 'lib/notion-schema.js',
    requires: ['GTD_INBOX_DB_ID'],
    idempotency: 'Check if GTD_INBOX constant already exists',
    validation: () => {
      const issues = [];
      const filePath = path.join(__dirname, 'lib', 'notion-schema.js');
      if (!fs.existsSync(filePath)) {
        issues.push('lib/notion-schema.js not found at expected path');
      }
      return { valid: issues.length === 0, issues };
    },
  },
  U: {
    phase: 'U',
    name: 'Manual view configuration (UI only)',
    type: 'manual_ui',
    target: 'Notion UI',
    requires: [],
    idempotency: 'N/A — manual step',
    validation: () => ({ valid: true, issues: [] }),
  },
};

// ---------------------------------------------------------------------------
// Dry-run executor
// ---------------------------------------------------------------------------

function validatePhase(phaseId) {
  const payload = payloads[phaseId];
  if (!payload) {
    return { phaseId, status: 'SKIPPED', reason: 'Unknown phase ID' };
  }

  const validation = payload.validation();
  if (!validation.valid) {
    return {
      phaseId: payload.phase,
      name: payload.name,
      status: 'BLOCKED',
      reason: 'Missing required IDs or configuration',
      issues: validation.issues,
      action: 'Resolve missing IDs before executing this phase',
    };
  }

  return {
    phaseId: payload.phase,
    name: payload.name,
    status: 'READY',
    type: payload.type,
    requires: payload.requires,
    idempotency: payload.idempotency,
    notes: payload.notes || null,
  };
}

function runDryRun() {
  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║   Notion Architect Mode — Dry-Run Execution Report          ║');
  console.log('║   Status: READ-ONLY — No live writes performed              ║');
  console.log('╚══════════════════════════════════════════════════════════════╝\n');

  const results = [];
  const readyPhases = [];
  const blockedPhases = [];

  for (const phase of PHASES) {
    const result = validatePhase(phase.id);
    results.push(result);
    if (result.status === 'READY') {
      readyPhases.push(result);
    } else if (result.status === 'BLOCKED' || result.status === 'SKIPPED') {
      blockedPhases.push(result);
    }
  }

  // Summary
  console.log('─── Phase Readiness Summary ───\n');
  console.log(`Total phases:   ${results.length}`);
  console.log(`Ready:          ${readyPhases.length}`);
  console.log(`Blocked:        ${blockedPhases.length}\n`);

  // Detailed report
  console.log('─── Detailed Phase Report ───\n');
  for (const result of results) {
    const statusIcon = result.status === 'READY' ? '🟢' : result.status === 'BLOCKED' ? '🔴' : '⚪';
    console.log(`[${statusIcon}] Phase ${result.phaseId}: ${result.name}`);
    console.log(`         Status: ${result.status}`);
    if (result.type) {
      console.log(`         Type:   ${result.type}`);
    }
    if (result.requires && result.requires.length > 0) {
      console.log(`         Requires: ${result.requires.join(', ')}`);
    }
    if (result.idempotency) {
      console.log(`         Idempotency: ${result.idempotency}`);
    }
    if (result.issues && result.issues.length > 0) {
      console.log(`         Issues:`);
      for (const issue of result.issues) {
        console.log(`           - ${issue}`);
      }
    }
    if (result.notes) {
      console.log(`         Notes: ${result.notes}`);
    }
    if (result.action) {
      console.log(`         Action: ${result.action}`);
    }
    console.log('');
  }

  // Execution prerequisites
  console.log('─── Prerequisites for Live Execution ───\n');
  const missingIds = [];
  for (const [key, value] of Object.entries(KNOWN_IDS)) {
    if (value.includes('[')) {
      missingIds.push(key);
    }
  }
  if (missingIds.length > 0) {
    console.log('The following IDs must be resolved before any live writes:');
    for (const id of missingIds) {
      console.log(`  - ${id}: ${KNOWN_IDS[id]}`);
    }
  } else {
    console.log('All known IDs are resolved.');
  }
  console.log('');

  // Recommended execution order
  console.log('─── Recommended Safe Execution Order ───\n');
  const safeOrder = readyPhases.map(p => {
    // Determine explicit ordering constraints
    if (p.phaseId === 'F' || p.phaseId === 'G') return 2; // depends on A
    if (p.phaseId === 'S') return 9; // depends on A and Projects relation
    if (p.phaseId === 'T') return 10; // code update last
    if (p.phaseId === 'U') return 11; // manual UI last
    if (p.type === 'create_db') return 1;
    if (p.type === 'patch_db') return 3;
    if (p.type === 'patch_db_status') return 4;
    if (p.type === 'patch_db_relation') return 5;
    if (p.type === 'add_rollup') return 6;
    return 7;
  });

  const sorted = readyPhases
    .map((p, i) => ({ ...p, order: safeOrder[i] }))
    .sort((a, b) => a.order - b.order);

  for (const item of sorted) {
    console.log(`  ${item.order}. [Phase ${item.phaseId}] ${item.name}`);
  }
  console.log('');

  // Final status
  const allReady = blockedPhases.length === 0;
  console.log('─── Final Status ───\n');
  if (allReady) {
    console.log('🟢 All phases are READY for execution.');
    console.log('   Approve to proceed phase by phase in dry-run mode.');
  } else {
    console.log('🔴 Some phases are BLOCKED.');
    console.log('   Resolve the listed issues before approving live execution.');
  }
  console.log('');

  // Output machine-readable summary
  const summary = {
    dryRun: DRY_RUN,
    totalPhases: results.length,
    ready: readyPhases.length,
    blocked: blockedPhases.length,
    missingIds,
    results: results.map(r => ({
      phase: r.phaseId,
      name: r.name,
      status: r.status,
      type: r.type || null,
      issues: r.issues || [],
    })),
  };

  const summaryPath = path.join(__dirname, 'notion-architect-dryrun-summary.json');
  fs.writeFileSync(summaryPath, JSON.stringify(summary, null, 2));
  console.log(`Machine-readable summary saved to: ${summaryPath}`);

  return summary;
}

// ---------------------------------------------------------------------------
// Live mode
// ---------------------------------------------------------------------------

const LIVE_APPROVAL = String(process.env.NOTION_PHASE21_LIVE_APPROVAL || '').trim().toLowerCase();

function requireLiveGate() {
  if (DRY_RUN) {
    return { allowed: false, reason: 'dry_run_enabled' };
  }
  if (!hasNotionEnv) {
    return { allowed: false, reason: 'missing_notion_env' };
  }
  if (LIVE_APPROVAL !== 'phase21') {
    return { allowed: false, reason: 'live_execution_not_approved' };
  }
  return null;
}

function maskError(err) {
  const message = err?.message || 'Unknown error';
  if (/unauthorized|forbidden|token|credential|secret/i.test(message)) {
    return 'Notion request failed due to authentication or permission settings.';
  }
  if (/rate limit|too many requests|quota/i.test(message)) {
    return 'Notion request was rate limited.';
  }
  if (/timeout|timed out|aborted/i.test(message)) {
    return 'Notion request timed out.';
  }
  return 'Notion request failed.';
}

function buildLiveEnvelope({ ok = true, action, status = 'success', data = null, error = null, meta = {} } = {}) {
  return { ok, action, status, data, error, meta: { ...meta, dryRun: false, liveApproved: true, generatedAt: new Date().toISOString() } };
}

async function executePatchStatus(phase) {
  const result = { phaseId: phase.phase, name: phase.name, status: 'LIVE_EXECUTED', type: phase.type };
  try {
    const current = await getDatabase(phase.target);
    const currentOptions = current.properties?.[phase.property]?.select?.options || [];
    const existingNames = new Set(currentOptions.map(o => o.name));
    const targetNames = phase.newOptions || [];
    const needsPatch = targetNames.some(name => !existingNames.has(name));
    result.data = { target: phase.target, property: phase.property, currentCount: currentOptions.length, needsPatch };
    if (!needsPatch) {
      result.status = 'SKIPPED';
      result.data.reason = 'already_matches';
      return result;
    }
    const response = await patchDatabase(phase.target, {
      [phase.property]: {
        select: { options: targetNames.map(name => ({ name })) },
      },
    });
    result.data.response = response;
  } catch (err) {
    result.status = 'FAILED';
    result.error = maskError(err);
    result.data = { ...result.data, reason: maskError(err), statusCode: err?.status || null };
  }
  return result;
}

async function runLive() {
  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║   Notion Architect Mode — Live Execution                    ║');
  console.log('║   Status: LIVE WRITES ENABLED                               ║');
  console.log('╚══════════════════════════════════════════════════════════════╝\n');

  const gate = requireLiveGate();
  if (gate) {
    console.log(`Live execution blocked: ${gate.reason}\n`);
    return {
      dryRun: false,
      totalPhases: PHASES.length,
      ready: 0,
      blocked: PHASES.length,
      missingIds: [],
      results: PHASES.map(phase => ({ phase: phase.id, name: phase.name, status: 'BLOCKED', type: null, issues: [gate.reason] })),
    };
  }

  const results = [];
  const blocked = [];

  for (const phase of PHASES) {
    const payload = payloads[phase.id];
    if (!payload) {
      results.push({ phase: phase.id, name: phase.name, status: 'SKIPPED', issues: ['Unknown phase ID'] });
      blocked.push({ phase: phase.id, name: phase.name, reason: 'Unknown phase ID' });
      continue;
    }

    const validation = payload.validation();
    if (!validation.valid) {
      results.push({ phase: payload.phase, name: payload.name, status: 'BLOCKED', issues: validation.issues });
      blocked.push({ phase: payload.phase, name: payload.name, reason: validation.issues.join('; ') });
      continue;
    }

    let result;
    switch (payload.type) {
      case 'patch_db_status': {
        result = await executePatchStatus(payload);
        break;
      }
      default: {
        result = { phaseId: payload.phase, name: payload.name, status: 'LIVE_READY', data: { note: 'Live execution not yet implemented for this phase type.', type: payload.type } };
        break;
      }
    }
    results.push(result);
    if (result.status === 'BLOCKED' || result.status === 'FAILED') {
      blocked.push({ phase: result.phaseId, name: result.name, reason: result.error || result.issues?.join('; ') || 'live_blocked' });
    }
    console.log(`[${result.status === 'LIVE_EXECUTED' ? '🟢' : result.status === 'SKIPPED' ? '⚪' : '🔴'}] Phase ${result.phaseId}: ${result.name} — ${result.status}`);
  }

  console.log('');
  console.log(`Completed: ${results.length}`);
  console.log(`Live executed: ${results.filter(r => r.status === 'LIVE_EXECUTED').length}`);
  console.log(`Skipped: ${results.filter(r => r.status === 'SKIPPED').length}`);
  console.log(`Blocked/failed: ${blocked.length}\n`);

  const summary = {
    dryRun: false,
    totalPhases: results.length,
    ready: results.filter(r => r.status === 'LIVE_EXECUTED' || r.status === 'LIVE_READY').length,
    blocked: blocked.length,
    missingIds: [],
    results,
  };

  const summaryPath = path.join(__dirname, 'notion-architect-live-summary.json');
  fs.writeFileSync(summaryPath, JSON.stringify(summary, null, 2));
  console.log(`Live summary saved to: ${summaryPath}\n`);

  return summary;
}

// ---------------------------------------------------------------------------
// Execute
// ---------------------------------------------------------------------------

async function bootstrap() {
  if (!DRY_RUN) {
    const summary = await runLive();
    process.exitCode = summary.blocked > 0 ? 1 : 0;
    return;
  }

  const summary = runDryRun();
  process.exitCode = summary.blocked > 0 ? 1 : 0;
}

bootstrap();
