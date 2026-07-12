/**
 * phase-21-plan.js
 *
 * Phase 21 Notion Workspace Architecture Plan definitions.
 * This file contains the phase order, payload definitions, and validation logic.
 * Do NOT modify this file - it is shared between dry-run and live execution.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ---------------------------------------------------------------------------
// Phase Order
// ---------------------------------------------------------------------------

export const PHASES = [
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

export const KNOWN_IDS = {
  PARENT_PAGE_ID: 'ce80d0cb95648203991d8151cb5e4e64',
  PROJECTS_DB_ID: '[PROJECTS_DB_ID]',
  AREAS_DB_ID: '[AREAS_DB_ID]',
  PRODUCT_OS_DB_ID: '241ef3830b9f4458817281721f6d9dd7',
  DIGITAL_ASSETS_DB_ID: '3990d0cb95648357b0c3886078e04abe',
  GTD_INBOX_DB_ID: '[GTD_INBOX_DB_ID]', // Will be created in Phase A
  AUTOMATION_LOG_DB_ID: '9b60d0cb9564836c845488209d8d7e58',
  AUTOMATION_EVENTS_DB_ID: '[AUTOMATION_EVENTS_DB_ID]', // Does not exist yet
  MONTHLY_REVIEW_DB_ID: '[MONTHLY_REVIEW_DB_ID]',
  MONEY_SNAPSHOT_DB_ID: '[MONEY_SNAPSHOT_DB_ID]',
  REPUTATION_SIGNALS_DB_ID: '[REPUTATION_SIGNALS_DB_ID]',
  IDEAS_DB_ID: 'f280d0cb95648309a269012a84b42471',
  CONTENT_BLOCKS_DB_ID: 'eb50d0cb95648359964e81193eeccf37',
  CONTENT_LIBRARY_DB_ID: '4889f366d28e421aa569d84fa6c2bb04',
  TEMPLATES_LIBRARY_DB_ID: 'e630d0cb95648315b7078823c16cd343',
};

// ---------------------------------------------------------------------------
// Payload definitions
// ---------------------------------------------------------------------------

export const payloads = {
  A: {
    phase: 'A',
    name: 'Create GTD Inbox DB',
    type: 'create_db',
    action: 'createDatabase',
    parent: KNOWN_IDS.PARENT_PAGE_ID,
    title: 'GTD Inbox',
    requires: ['PARENT_PAGE_ID'],
    buildPayload: () => ({
      parent: { type: 'page_id', page_id: KNOWN_IDS.PARENT_PAGE_ID },
      icon: { type: 'emoji', emoji: '📥' },
      title: [{ type: 'text', text: { content: 'GTD Inbox' } }],
      properties: {
        'Task': { title: {} },
        'Status': {
          status: {
            options: [
              { name: 'Inbox', color: 'gray' },
              { name: 'Next', color: 'red' },
              { name: 'Waiting', color: 'yellow' },
              { name: 'Done', color: 'green' },
            ]
          }
        },
        'Due': { date: {} },
        'Context': { rich_text: {} },
      }
    }),
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
    action: 'createDatabase',
    parent: KNOWN_IDS.PARENT_PAGE_ID,
    title: 'Someday / Maybe',
    requires: ['PARENT_PAGE_ID'],
    buildPayload: () => ({
      parent: { type: 'page_id', page_id: KNOWN_IDS.PARENT_PAGE_ID },
      icon: { type: 'emoji', emoji: '💭' },
      title: [{ type: 'text', text: { content: 'Someday / Maybe' } }],
      properties: {
        'Idea': { title: {} },
        'Status': {
          status: {
            options: [
              { name: 'Someday', color: 'blue' },
              { name: 'Maybe', color: 'purple' },
              { name: 'Active', color: 'orange' },
            ]
          }
        },
        'Category': { rich_text: {} },
        'Notes': { rich_text: {} },
      }
    }),
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
    action: 'updateDatabase',
    target: KNOWN_IDS.AUTOMATION_LOG_DB_ID,
    property: 'Next Action',
    relationTo: 'GTD_INBOX_DB_ID',
    requires: ['AUTOMATION_LOG_DB_ID', 'GTD_INBOX_DB_ID'],
    buildPayload: () => ({
      properties: {
        'Next Action': {
          relation: {
            database_id: KNOWN_IDS.GTD_INBOX_DB_ID,
          }
        }
      }
    }),
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
    action: 'updateDatabase',
    target: KNOWN_IDS.AUTOMATION_EVENTS_DB_ID,
    property: 'Next Action',
    relationTo: 'GTD_INBOX_DB_ID',
    requires: ['AUTOMATION_EVENTS_DB_ID', 'GTD_INBOX_DB_ID'],
    buildPayload: () => ({
      properties: {
        'Next Action': {
          relation: {
            database_id: KNOWN_IDS.GTD_INBOX_DB_ID,
          }
        }
      }
    }),
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
    action: 'updateDatabase',
    target: KNOWN_IDS.PRODUCT_OS_DB_ID,
    property: 'Status',
    newOptions: ['Draft', 'Build', 'Live', 'Archived'],
    requires: ['PRODUCT_OS_DB_ID'],
    buildPayload: () => ({
      properties: {
        'Status': {
          status: {
            options: [
              { name: 'Draft', color: 'gray' },
              { name: 'Build', color: 'orange' },
              { name: 'Live', color: 'green' },
              { name: 'Archived', color: 'brown' },
            ]
          }
        }
      }
    }),
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
    action: 'updateDatabase',
    target: KNOWN_IDS.IDEAS_DB_ID,
    property: 'Status',
    newOptions: ['Intake', 'Researching', 'BuildQueue', 'Live', 'Stale'],
    requires: ['IDEAS_DB_ID'],
    buildPayload: () => ({
      properties: {
        'Status': {
          status: {
            options: [
              { name: 'Intake', color: 'gray' },
              { name: 'Researching', color: 'blue' },
              { name: 'BuildQueue', color: 'yellow' },
              { name: 'Live', color: 'green' },
              { name: 'Stale', color: 'red' },
            ]
          }
        }
      }
    }),
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
    action: 'updateDatabase',
    target: KNOWN_IDS.DIGITAL_ASSETS_DB_ID,
    property: 'Status',
    newOptions: ['Draft', 'Ready', 'Live', 'Retired'],
    requires: ['DIGITAL_ASSETS_DB_ID'],
    buildPayload: () => ({
      properties: {
        'Status': {
          status: {
            options: [
              { name: 'Draft', color: 'gray' },
              { name: 'Ready', color: 'yellow' },
              { name: 'Live', color: 'green' },
              { name: 'Retired', color: 'brown' },
            ]
          }
        }
      }
    }),
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
    action: 'updateDatabase',
    target: KNOWN_IDS.CONTENT_BLOCKS_DB_ID,
    property: 'Status',
    newOptions: ['Scratch', 'Draft', 'Approved', 'Published'],
    requires: ['CONTENT_BLOCKS_DB_ID'],
    buildPayload: () => ({
      properties: {
        'Status': {
          status: {
            options: [
              { name: 'Scratch', color: 'gray' },
              { name: 'Draft', color: 'orange' },
              { name: 'Approved', color: 'blue' },
              { name: 'Published', color: 'green' },
            ]
          }
        }
      }
    }),
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
    action: 'updateDatabase',
    target: KNOWN_IDS.AUTOMATION_LOG_DB_ID,
    property: 'Status',
    newOptions: ['Queued', 'Running', 'Succeeded', 'Failed', 'Dead Letter'],
    requires: ['AUTOMATION_LOG_DB_ID'],
    buildPayload: () => ({
      properties: {
        'Status': {
          status: {
            options: [
              { name: 'Queued', color: 'gray' },
              { name: 'Running', color: 'blue' },
              { name: 'Succeeded', color: 'green' },
              { name: 'Failed', color: 'red' },
              { name: 'Dead Letter', color: 'brown' },
            ]
          }
        }
      }
    }),
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
    action: 'updateDatabase',
    target: KNOWN_IDS.AUTOMATION_EVENTS_DB_ID,
    property: 'Status',
    newOptions: ['Pending', 'Processing', 'Done', 'Failed'],
    requires: ['AUTOMATION_EVENTS_DB_ID'],
    buildPayload: () => ({
      properties: {
        'Status': {
          status: {
            options: [
              { name: 'Pending', color: 'gray' },
              { name: 'Processing', color: 'blue' },
              { name: 'Done', color: 'green' },
              { name: 'Failed', color: 'red' },
            ]
          }
        }
      }
    }),
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
    action: 'updateDatabase',
    target: '[TARGET_DB_ID]',
    property: 'Digital Assets',
    relationTo: 'DIGITAL_ASSETS_DB_ID',
    requires: ['TARGET_DB_ID', 'DIGITAL_ASSETS_DB_ID'],
    buildPayload: () => ({
      properties: {
        'Digital Assets': {
          relation: {
            database_id: KNOWN_IDS.DIGITAL_ASSETS_DB_ID,
          }
        }
      }
    }),
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
    action: 'updateDatabase',
    target: KNOWN_IDS.PRODUCT_OS_DB_ID,
    rollupProperty: 'Product asset count',
    relationProperty: 'Modules',
    rolledProperty: 'count',
    function: 'count_all',
    requires: ['PRODUCT_OS_DB_ID'],
    buildPayload: () => ({
      properties: {
        'Product asset count': {
          rollup: {
            relation_property_name: 'Modules',
            rollup_property_name: 'count',
            function: 'count_all'
          }
        }
      }
    }),
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
    action: 'updateDatabase',
    target: KNOWN_IDS.DIGITAL_ASSETS_DB_ID,
    rollupProperty: 'Asset revenue attached',
    relationProperty: 'Money Snapshot',
    rolledProperty: 'Revenue',
    function: 'sum',
    requires: ['DIGITAL_ASSETS_DB_ID', 'MONEY_SNAPSHOT_DB_ID'],
    buildPayload: () => ({
      properties: {
        'Asset revenue attached': {
          rollup: {
            relation_property_name: 'Money Snapshot',
            rollup_property_name: 'Revenue',
            function: 'sum'
          }
        }
      }
    }),
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
    action: 'updateDatabase',
    target: KNOWN_IDS.MONTHLY_REVIEW_DB_ID,
    rollupProperty: 'Monthly review automation count',
    relationProperty: 'Automations Log',
    rolledProperty: 'Run ID',
    function: 'count_unique',
    requires: ['MONTHLY_REVIEW_DB_ID', 'AUTOMATION_LOG_DB_ID'],
    buildPayload: () => ({
      properties: {
        'Monthly review automation count': {
          rollup: {
            relation_property_name: 'Automations Log',
            rollup_property_name: 'Run ID',
            function: 'count_unique'
          }
        }
      }
    }),
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
    action: 'updateDatabase',
    target: KNOWN_IDS.DIGITAL_ASSETS_DB_ID,
    rollupProperty: 'Reputation linked count',
    relationProperty: 'TM',
    rolledProperty: 'Signal Name',
    function: 'count_all',
    requires: ['DIGITAL_ASSETS_DB_ID', 'REPUTATION_SIGNALS_DB_ID'],
    buildPayload: () => ({
      properties: {
        'Reputation linked count': {
          rollup: {
            relation_property_name: 'TM',
            rollup_property_name: 'Signal Name',
            function: 'count_all'
          }
        }
      }
    }),
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
    action: 'updateDatabase',
    target: KNOWN_IDS.AUTOMATION_EVENTS_DB_ID,
    rollupProperty: 'Automation failure count',
    relationProperty: 'Automation Log',
    rolledProperty: 'Error Message',
    function: 'count_not_empty',
    requires: ['AUTOMATION_EVENTS_DB_ID'],
    buildPayload: () => ({
      properties: {
        'Automation failure count': {
          rollup: {
            relation_property_name: 'Automation Log',
            rollup_property_name: 'Error Message',
            function: 'count_not_empty'
          }
        }
      }
    }),
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
    action: 'updateDatabase',
    target: KNOWN_IDS.PROJECTS_DB_ID,
    rollupProperty: 'GTD next action queue length',
    relationProperty: 'GTD Next Action',
    rolledProperty: 'Task',
    function: 'count_where',
    filter: { property: 'Status', status: { equals: 'Next' } },
    requires: ['PROJECTS_DB_ID', 'GTD_INBOX_DB_ID'],
    buildPayload: () => ({
      properties: {
        'GTD next action queue length': {
          rollup: {
            relation_property_name: 'GTD Next Action',
            rollup_property_name: 'Task',
            function: 'count_where',
            filter: { property: 'Status', status: { equals: 'Next' } }
          }
        }
      }
    }),
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
    action: 'updateDatabase',
    target: 'lib/notion-schema.js',
    requires: ['GTD_INBOX_DB_ID'],
    buildPayload: () => ({}),
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
    action: 'updateDatabase',
    target: 'Notion UI',
    requires: [],
    buildPayload: () => ({}),
    idempotency: 'N/A — manual step',
    validation: () => ({ valid: true, issues: [] }),
  },
};

// ---------------------------------------------------------------------------
// Helper functions
// ---------------------------------------------------------------------------

export function validatePhase(phaseId) {
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
    action: payload.action,
    requires: payload.requires,
    idempotency: payload.idempotency,
    notes: payload.notes || null,
  };
}

export function getPhase(phaseId) {
  return payloads[phaseId] || null;
}