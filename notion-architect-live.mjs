/**
 * notion-architect-live.mjs
 *
 * Live executor for Phase 21 Notion Workspace Architecture Plan.
 * Executes real Notion API writes when NOTION_LIVE_MODE=true.
 *
 * Usage:
 *   NOTION_LIVE_MODE=true NOTION_SECRET=<token> node notion-architect-live.mjs
 */

import { executeNotionWrite } from './lib/notion-write.mjs';
import { PHASES, payloads, KNOWN_IDS } from './phase-21-plan.js';
import chalk from 'chalk';

// ---------------------------------------------------------------------------
// Main execution
// ---------------------------------------------------------------------------

async function runLiveExecution() {
  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║   Notion Architect Mode — Live Execution                    ║');
  console.log('╚══════════════════════════════════════════════════════════════╝\n');

  console.log('─'.repeat(70));
  console.log('');

  const results = [];
  let hasErrors = false;

  // Mutable ID registry for created databases
  const createdIds = { ...KNOWN_IDS };

  // Execute phases in order
  for (const phaseDef of PHASES) {
    const phase = payloads[phaseDef.id];

    if (!phase) {
      console.log(`⚠ Phase ${phaseDef.id}: No payload definition found, skipping`);
      continue;
    }

    // Skip phases with unresolved relation targets
    if (phase.relationTo && !KNOWN_IDS[phase.relationTo]) {
      console.log(`  ${chalk.yellow('SKIP')} ${phase.name}: unknown relation target ${phase.relationTo}`);
      continue;
    }
    if (phase.relationTo && KNOWN_IDS[phase.relationTo] && KNOWN_IDS[phase.relationTo].startsWith('[')) {
      console.log(`  ${chalk.yellow('SKIP')} ${phase.name}: relation target ${phase.relationTo} is unresolved`);
      continue;
    }

    console.log(`[Phase ${phase.phase}] ${phase.name}`);

    try {
      // Build payload
      let payload = phase.buildPayload ? phase.buildPayload() : {};
      if (phase.type === 'patch_db_relation' && phase.property) {
        payload.propertyName = phase.property;
      }
      if (phase.target && !payload.databaseId) {
        payload.databaseId = resolveId(phase.target, createdIds);
      }

      // Resolve placeholders before normalization so IDs are concrete
      payload = resolvePayloadIds(payload, createdIds);

      // Normalize payload shape for the write-layer
      payload = normalizePayload(phase, payload);

      // Tighten action mapping fallback - emit only supported actions
      let action = phase.action;
      if (phase.action === 'updateDatabase') {
        if (phase.type === 'patch_db_relation') {
          action = 'patchDatabase';
        } else if (phase.type === 'add_rollup') {
          // Map to updateDatabase only if we have a supported payload
          // For now, mark as BLOCKED since writer doesn't support addRollup
          if (!phase.target || !phase.rollupProperty || !phase.relationProperty || !phase.rolledProperty) {
            // Skip this phase - cannot execute without required fields
            console.log(`  ${chalk.yellow('BLOCKED')} ${phase.name}: Missing required rollup configuration`);
            continue;
          }
          action = 'patchDatabase';
        } else {
          action = 'patchDatabase';
        }
      }

      // Execute write with runtime created-id map for circuit-breaker resolution
      const result = await executeNotionWrite(phase.name, action, payload, createdIds);

      // Persist created database ID for later phases
      if (action === 'createDatabase' && result?.data?.id) {
        const dbId = result.data.id;
        if (phase.phase === 'A') {
          createdIds.GTD_INBOX_DB_ID = dbId;
          console.log(`  ↳ Persisted GTD_INBOX_DB_ID = ${dbId}`);
        } else if (phase.phase === 'E') {
          createdIds.SOMEDAY_MAYBE_DB_ID = dbId;
          console.log(`  ↳ Persisted SOMEDAY_MAYBE_DB_ID = ${dbId}`);
        }
      }

      // Store result if storeResult function exists
      if (typeof phase.storeResult === 'function') {
        phase.storeResult(result);
      }

      results.push({
        phase: phase.phase,
        name: phase.name,
        status: 'SUCCESS',
        action,
        result,
      });

      console.log(`  ✓ Completed\n`);

    } catch (error) {
      hasErrors = true;
      console.error(`  ✗ Failed: ${error.message}\n`);

      results.push({
        phase: phase.phase,
        name: phase.name,
        status: 'ERROR',
        action: phase.action,
        error: error.message,
      });

      // Continue to next phase despite error
      continue;
    }
  }

  // Summary
  console.log('─'.repeat(70));
  console.log('\nExecution Summary:');
  console.log(`  Total phases:  ${PHASES.length}`);
  console.log(`  Successful:    ${results.filter(r => r.status === 'SUCCESS').length}`);
  console.log(`  Skipped:       ${results.filter(r => r.status === 'SKIPPED').length}`);
  console.log(`  Errors:        ${results.filter(r => r.status === 'ERROR').length}`);
  console.log('');

  if (hasErrors) {
    console.log('⚠ Some phases encountered errors. Review the output above.');
    process.exit(1);
  }

  console.log('Phase 21 live execution complete.');
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function resolveValue(value, registry) {
  if (typeof value === 'string') {
    return value.replace(/\[([A-Z_]+)\]/g, (match, key) => registry[key] ?? match);
  }

  if (Array.isArray(value)) {
    return value.map(item => resolveValue(item, registry));
  }

  if (value && typeof value === 'object') {
    const resolved = {};
    for (const [k, v] of Object.entries(value)) {
      resolved[k] = resolveValue(v, registry);
    }
    return resolved;
  }

  return value;
}

function resolvePayloadIds(payload, registry) {
  return resolveValue(payload, registry);
}

function resolveId(id, registry) {
  if (typeof id === 'string' && id.startsWith('[') && id.endsWith(']')) {
    const key = id.slice(1, -1);
    return registry[key] || id;
  }
  return registry[id] || id;
}

/**
 * Coerce phase payloads into the shape expected by lib/notion-write.mjs.
 */
function normalizePayload(phase, payload) {
  if (phase.type === 'create_db') {
    if (payload.parent?.type === 'page_id' && payload.parent.page_id) {
      payload.parentId = payload.parent.page_id;
    }
    if (Array.isArray(payload.title)) {
      const textNode = payload.title.find((item) => item?.text?.content);
      payload.title = textNode?.text?.content ?? '';
    }
  }

  if (['patch_db', 'patch_db_status', 'add_rollup', 'patch_db_relation',
       'create_status_property', 'update_status_property',
       'create_select_property', 'update_select_property'].includes(phase.type)) {
    payload.databaseId = payload.databaseId || payload.target || phase.target;
  }

  return payload;
}

// ---------------------------------------------------------------------------
// Execute
// ---------------------------------------------------------------------------

runLiveExecution().catch((error) => {
  console.error('Fatal error during live execution:', error);
  process.exit(1);
});