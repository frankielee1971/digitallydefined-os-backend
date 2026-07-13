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
// Dynamic ID + sanitization helpers
// ---------------------------------------------------------------------------

// Runtime map for dynamically created DB IDs (Projects, Areas, etc.)
const dynamicDbIdMap = new Map();

function hydrateDynamicDbIds() {
  // Seed from env or existing KNOWN_IDS; fall back to dynamic placeholders
  dynamicDbIdMap.set(
    'PROJECTS_DB_ID',
    process.env.PROJECTS_DB_ID || KNOWN_IDS.PROJECTS_DB_ID || 'DYNAMIC_PROJECTS_DB_ID'
  );
  dynamicDbIdMap.set(
    'AREAS_DB_ID',
    process.env.AREAS_DB_ID || KNOWN_IDS.AREAS_DB_ID || 'DYNAMIC_AREAS_DB_ID'
  );
}

function resolveDbId(value) {
  if (typeof value !== 'string') return value;
  const trimmed = value.trim();
  if (!trimmed) return trimmed;

  // Handle placeholder form like [PROJECTS_DB_ID]
  let key = trimmed;
  if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
    key = trimmed.slice(1, -1);
  }
  const upper = key.toUpperCase();

  // Prefer dynamic map
  if (dynamicDbIdMap.has(upper)) {
    const resolved = dynamicDbIdMap.get(upper);
    if (resolved && !resolved.startsWith('DYNAMIC_')) return resolved;
  }

  // Fall back to KNOWN_IDS
  if (KNOWN_IDS[upper]) return KNOWN_IDS[upper];

  // Fall back to env
  if (process.env[upper]) return process.env[upper];

  return trimmed;
}

function cleanNotionId(raw) {
  if (!raw || typeof raw !== 'string') return raw;
  const trimmed = raw.trim();
  if (!trimmed) return trimmed;

  // Keep explicit placeholders as-is so we can detect them
  if (trimmed.startsWith('REPLACE_') || trimmed.startsWith('DYNAMIC_')) return trimmed;

  // Strip non-hex/non-dash characters
  const cleaned = trimmed.replace(/[^0-9a-fA-F-]/g, '');
  const uuidLike = cleaned.match(
    /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/
  );
  return uuidLike ? uuidLike[0] : trimmed;
}

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

  // Helper to keep KNOWN_IDS and createdIds in sync when new IDs are discovered
  function updatePlanIds(updates) {
    if (!updates || typeof updates !== 'object') return;
    for (const [key, value] of Object.entries(updates)) {
      if (!value) continue;
      KNOWN_IDS[key] = value;
      createdIds[key] = value;
      dynamicDbIdMap.set(key, value);
    }
  }

  // Hydrate dynamic IDs from env/KNOWN_IDS before any phase runs
  hydrateDynamicDbIds();

  // Execute phases in order
  for (const phaseDef of PHASES) {
    const phase = payloads[phaseDef.id];

    if (!phase) {
      console.log(`⚠ Phase ${phaseDef.id}: No payload definition found, skipping`);
      results.push({
        phase: phaseDef.id,
        name: phaseDef.name,
        status: 'SKIPPED',
        action: null,
        reason: 'No payload definition found',
      });
      continue;
    }

    // Skip phases with unresolved relation targets
    if (phase.relationTo && !KNOWN_IDS[phase.relationTo]) {
      console.log(`  ${chalk.yellow('SKIP')} ${phase.name}: unknown relation target ${phase.relationTo}`);
      results.push({
        phase: phase.phase,
        name: phase.name,
        status: 'SKIPPED',
        action: phase.action,
        reason: `Unknown relation target ${phase.relationTo}`,
      });
      continue;
    }
    if (phase.relationTo && KNOWN_IDS[phase.relationTo] && KNOWN_IDS[phase.relationTo].startsWith('[')) {
      console.log(`  ${chalk.yellow('SKIP')} ${phase.name}: relation target ${phase.relationTo} is unresolved`);
      results.push({
        phase: phase.phase,
        name: phase.name,
        status: 'SKIPPED',
        action: phase.action,
        reason: `Relation target ${phase.relationTo} is unresolved`,
      });
      continue;
    }

    // Explicitly skip Phase T (code-only alignment, not a Notion write)
    if (phase.phase === 'T') {
      console.log(`[Phase ${phase.phase}] ${phase.name}`);
      console.log('  ⊘ Skipped: Phase T is a code-only alignment task, not a Notion DB write\n');
      results.push({
        phase: phase.phase,
        name: phase.name,
        status: 'SKIPPED',
        action: phase.action,
        reason: 'Code-only alignment task',
      });
      continue;
    }

    console.log(`[Phase ${phase.phase}] ${phase.name}`);

    try {
      // Build payload
      let payload = phase.buildPayload ? phase.buildPayload() : {};
      if (phase.type === 'patch_db_relation' && phase.property) {
        payload.propertyName = phase.property;
      }

      // Resolve target DB for phases that rely on KNOWN_IDS/createdIds
      if (phase.target && !payload.databaseId) {
        // Special handling for Phase C (TARGET_DB_ID)
        if (phase.phase === 'C') {
          const targetDbId = cleanNotionId(
            resolveDbId(KNOWN_IDS.TARGET_DB_ID || process.env.TARGET_DB_ID || '')
          );
          if (!targetDbId || targetDbId.startsWith('REPLACE_') || targetDbId === '') {
            console.log('  ⊘ Skipped: TARGET_DB_ID not available for Phase C\n');
            results.push({
              phase: phase.phase,
              name: phase.name,
              status: 'SKIPPED',
              action: phase.action,
              reason: 'TARGET_DB_ID not available',
            });
            continue;
          }
          payload.databaseId = targetDbId;
        } else {
          payload.databaseId = resolveId(phase.target, createdIds);
        }
      }

      // Resolve placeholders and sanitize IDs before normalization
      payload = resolvePayloadIds(payload, createdIds);

      // Normalize payload shape for the write-layer
      payload = normalizePayload(phase, payload);

      // Tighten action mapping fallback - emit only supported actions
      let action = phase.action;
      if (phase.action === 'updateDatabase') {
        if (phase.type === 'patch_db_relation') {
          action = 'patchDatabase';
        } else if (phase.type === 'add_rollup') {
          if (!phase.target || !phase.rollupProperty || !phase.relationProperty || !phase.rolledProperty) {
            console.log(
              `  ${chalk.yellow('BLOCKED')} ${phase.name}: Missing required rollup configuration`
            );
            results.push({
              phase: phase.phase,
              name: phase.name,
              status: 'SKIPPED',
              action: phase.action,
              reason: 'Missing required rollup configuration',
            });
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
        const dbId = cleanNotionId(result.data.id);
        if (!dbId || dbId.startsWith('REPLACE_') || dbId.startsWith('DYNAMIC_')) {
          console.log(`  ⚠ Created DB ID for ${phase.name} appears invalid: ${result.data.id}`);
        } else {
          if (phase.persistIdAs) {
            createdIds[phase.persistIdAs] = dbId;
            dynamicDbIdMap.set(phase.persistIdAs, dbId);
            updatePlanIds({ [phase.persistIdAs]: dbId });
            console.log(`  ↳ Persisted ${phase.persistIdAs} = ${dbId}`);
          } else if (phase.phase === 'A') {
            createdIds.GTD_INBOX_DB_ID = dbId;
            updatePlanIds({ GTD_INBOX_DB_ID: dbId });
            console.log(`  ↳ Persisted GTD_INBOX_DB_ID = ${dbId}`);
          } else if (phase.phase === 'E') {
            createdIds.SOMEDAY_MAYBE_DB_ID = dbId;
            updatePlanIds({ SOMEDAY_MAYBE_DB_ID: dbId });
            console.log(`  ↳ Persisted SOMEDAY_MAYBE_DB_ID = ${dbId}`);
          }
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
    // Soft warning: do NOT exit fatally; allow Hermes to continue
    return;
  }

  console.log('Phase 21 live execution complete.');
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function resolveValue(value, registry) {
  if (typeof value === 'string') {
    return value.replace(/\\[([A-Z_]+)\\]/g, (match, key) => registry[key] ?? match);
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

// Enhanced payload ID resolution: resolve placeholders + sanitize IDs
function resolvePayloadIds(payload, registry) {
  if (!payload || typeof payload !== 'object') return payload;
  const resolved = resolveValue(payload, registry);

  // Normalize and sanitize databaseId if present
  if (resolved.databaseId) {
    resolved.databaseId = cleanNotionId(resolveDbId(resolved.databaseId));
  }

  // Some payloads may carry parentId or parent.database_id; sanitize those too
  if (resolved.parentId) {
    resolved.parentId = cleanNotionId(resolveDbId(resolved.parentId));
  }
  if (resolved.parent && resolved.parent.database_id) {
    resolved.parent.database_id = cleanNotionId(resolveDbId(resolved.parent.database_id));
  }

  return resolved;
}

function resolveId(id, registry) {
  if (typeof id === 'string' && id.startsWith('[') && id.endsWith(']')) {
    const key = id.slice(1, -1);
    const fromRegistry = registry[key];
    if (fromRegistry) return cleanNotionId(resolveDbId(fromRegistry));
    return cleanNotionId(resolveDbId(id));
  }
  const direct = registry[id] || id;
  return cleanNotionId(resolveDbId(direct));
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

  if (
    [
      'patch_db',
      'patch_db_status',
      'add_rollup',
      'patch_db_relation',
      'create_status_property',
      'update_status_property',
      'create_select_property',
      'update_select_property',
    ].includes(phase.type)
  ) {
    payload.databaseId = payload.databaseId || payload.target || phase.target;
    if (payload.databaseId) {
      payload.databaseId = cleanNotionId(resolveDbId(payload.databaseId));
    }
  }

  return payload;
}

// ---------------------------------------------------------------------------
// Execute
// ---------------------------------------------------------------------------

runLiveExecution().catch((error) => {
  console.error('Fatal error during live execution:', error);
  // Soft warning: do not exit with non-zero code to avoid crashing Hermes
});
