/**
 * lib/notion-write.mjs
 *
 * Live Notion write executor for Phase 21 operations.
 * Provides a unified interface for executing Notion API writes with dry-run support.
 */

import { createDatabase, getDatabase, patchDatabase, createPage, hasNotionEnv } from './notion-client.mjs';
import {
  buildRelationPropertyPayload,
  buildStatusPropertyPayload,
  buildSelectPropertyPayload,
} from './notion-properties.mjs';

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const SELLABLE_DRY_RUN = String(process.env.SELLABLE_DRY_RUN || 'false').toLowerCase() === 'true';

// ---------------------------------------------------------------------------
// Idempotency helpers
// ---------------------------------------------------------------------------

/**
 * Check if a database already exists by querying it.
 */
async function databaseExists(databaseId) {
  try {
    const db = await getDatabase(databaseId);
    return Boolean(db && db.id);
  } catch (error) {
    return false;
  }
}

/**
 * Check if a status property already has the target options.
 */
async function statusAlreadyMatches(databaseId, propertyName, targetOptions) {
  try {
    const db = await getDatabase(databaseId);
    const currentOptions = db.properties?.[propertyName]?.status?.options || [];
    const existingNames = new Set(currentOptions.map(o => o.name));
    const targetNames = targetOptions.map(o => o.name);

    // Check if all target options exist
    const allMatch = targetNames.every(name => existingNames.has(name));
    // Check if there are no extra options (exact match)
    const exactMatch = currentOptions.length === targetNames.length && allMatch;

    return exactMatch;
  } catch (error) {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Placeholder resolution
// ---------------------------------------------------------------------------

/**
 * Recursively substitute bracketed placeholder tokens in a payload using
 * a provided ID map, e.g. `[GTD_INBOX_DB_ID]` → actual UUID.
 */
function resolvePayloadIds(payload, createdIds = {}) {
  const placeholderRe = /^\[([A-Z_]+)\]$/;

  function resolveValue(value) {
    if (typeof value === 'string') {
      const match = value.match(placeholderRe);
      if (!match) return value;
      const key = match[1];
      if (!Object.prototype.hasOwnProperty.call(createdIds, key)) return value;
      const resolved = createdIds[key];
      if (typeof resolved === 'string' && resolved.includes('[')) return value;
      return resolved;
    }
    if (Array.isArray(value)) return value.map(resolveValue);
    if (value && typeof value === 'object') {
      const out = {};
      for (const k of Object.keys(value)) out[k] = resolveValue(value[k]);
      return out;
    }
    return value;
  }

  return resolveValue(payload);
}

// ---------------------------------------------------------------------------
// Core write executor
// ---------------------------------------------------------------------------

/**
 * Execute a Notion write operation with dry-run support.
 *
 * @param {string} phaseName - Human-readable phase name for logging
 * @param {string} action - The action to perform
 * @param {object} payload - The payload for the action
 * @param {object} [createdIds] - Runtime map of placeholder→resolved IDs
 * @returns {Promise<object>} Result object with dryRun flag and action metadata
 * @throws {Error} If action is unknown or live write fails
 */
export async function executeNotionWrite(phaseName, action, payload, createdIds) {
  const resolvedPayload = resolvePayloadIds(payload, createdIds);

  // Surface unresolved placeholders as hard failures in live runner dry-run
  if (SELLABLE_DRY_RUN && containsUnresolvedPlaceholder(resolvedPayload)) {
    const message = 'Payload contains unresolved placeholder IDs';
    console.log(`[DRY-RUN] ${phaseName} → ${action}`);
    console.log(`  Payload: ${JSON.stringify(resolvedPayload, null, 2).substring(0, 200)}...`);
    console.log(`  ✗ Blocked: ${message}\n`);
    return {
      dryRun: true,
      phaseName,
      action,
      status: 'blocked',
      message,
    };
  }

  // Dry-run mode
  if (SELLABLE_DRY_RUN) {
    console.log(`[DRY-RUN] ${phaseName} → ${action}`);
    console.log(`  Payload: ${JSON.stringify(resolvedPayload, null, 2).substring(0, 200)}...`);
    return {
      dryRun: true,
      phaseName,
      action,
      status: 'dry_run',
      message: 'Dry-run mode enabled (SELLABLE_DRY_RUN=true)',
    };
  }

  // Live mode validation
  if (!hasNotionEnv) {
    throw new Error('Notion environment not configured. Set NOTION_TOKEN and NOTION_BASE_URL.');
  }

  // Live write logging
  console.log(`[LIVE] ${phaseName} → ${action}`);

  let result;

  try {
    switch (action) {
      case 'createDatabase': {
        // Idempotency: check if database already exists
        const parentId = resolvedPayload.parent?.page_id || resolvedPayload.parentId;
        if (parentId && resolvedPayload.title) {
          // For createDatabase, we can't easily check existence without searching
          // So we'll attempt creation and let Notion handle duplicates
          result = await createDatabase(resolvedPayload);
        } else {
          result = await createDatabase(resolvedPayload);
        }
        break;
      }

      case 'patchDatabase': {
        const databaseId = resolvedPayload.databaseId || resolvedPayload.target;
        if (!databaseId) {
          throw new Error('patchDatabase requires databaseId or target in payload');
        }

        // Idempotency: check if patch is needed
        const properties = resolvedPayload.properties || {};
        const propertyNames = Object.keys(properties);

        // For status patches, check if already matches
        for (const propName of propertyNames) {
          const propConfig = properties[propName];
          if (propConfig.select?.options) {
            const alreadyMatches = await statusAlreadyMatches(
              databaseId,
              propName,
              propConfig.select.options
            );
            if (alreadyMatches) {
              console.log(`  ⚪ Skipping ${propName} - already matches target state`);
              return {
                dryRun: false,
                phaseName,
                action,
                status: 'skipped',
                databaseId,
                property: propName,
                message: 'Property already matches target state',
              };
            }
          }
        }

        result = await patchDatabase(databaseId, properties);
        break;
      }

      case 'createPage': {
        result = await createPage(resolvedPayload);
        break;
      }

      case 'createRelationProperty':
      case 'updateRelationProperty': {
        const databaseId = resolvedPayload.databaseId || resolvedPayload.target;
        if (!databaseId) {
          throw new Error('Relation property requires databaseId or target in payload');
        }

        const propertyName = resolvedPayload.propertyName || resolvedPayload.property;
        if (!propertyName) {
          throw new Error('Relation property requires propertyName in payload');
        }

        const relationDbId = resolvedPayload.relationTo || resolvedPayload.databaseId;
        if (!relationDbId) {
          throw new Error('Relation property requires relationTo (database ID) in payload');
        }

        // Idempotency: check if property already exists
        const db = await getDatabase(databaseId);
        const existingProperty = db.properties?.[propertyName];
        if (existingProperty?.type === 'relation') {
          console.log(`  ⚪ Skipping ${propertyName} - relation property already exists`);
          return {
            dryRun: false,
            phaseName,
            action,
            status: 'skipped',
            databaseId,
            property: propertyName,
            message: 'Relation property already exists',
          };
        }

        const propertyPayload = buildRelationPropertyPayload(propertyName, relationDbId);
        result = await patchDatabase(databaseId, propertyPayload);
        break;
      }

      case 'createStatusProperty':
      case 'updateStatusProperty': {
        const databaseId = resolvedPayload.databaseId || resolvedPayload.target;
        if (!databaseId) {
          throw new Error('Status property requires databaseId or target in payload');
        }

        const propertyName = resolvedPayload.propertyName || resolvedPayload.property;
        if (!propertyName) {
          throw new Error('Status property requires propertyName in payload');
        }

        const options = resolvedPayload.options || [];
        if (!Array.isArray(options) || options.length === 0) {
          throw new Error('Status property requires options array in payload');
        }

        // Idempotency: check if property already matches
        const alreadyMatches = await statusAlreadyMatches(databaseId, propertyName, options);
        if (alreadyMatches) {
          console.log(`  ⚪ Skipping ${propertyName} - status property already matches`);
          return {
            dryRun: false,
            phaseName,
            action,
            status: 'skipped',
            databaseId,
            property: propertyName,
            message: 'Status property already matches target state',
          };
        }

        const propertyPayload = buildStatusPropertyPayload(propertyName, options);
        result = await patchDatabase(databaseId, propertyPayload);
        break;
      }

      case 'createSelectProperty':
      case 'updateSelectProperty': {
        const databaseId = resolvedPayload.databaseId || resolvedPayload.target;
        if (!databaseId) {
          throw new Error('Select property requires databaseId or target in payload');
        }

        const propertyName = resolvedPayload.propertyName || resolvedPayload.property;
        if (!propertyName) {
          throw new Error('Select property requires propertyName in payload');
        }

        const options = resolvedPayload.options || [];
        if (!Array.isArray(options) || options.length === 0) {
          throw new Error('Select property requires options array in payload');
        }

        // Idempotency: check if select property already matches
        const db = await getDatabase(databaseId);
        const currentSelectOptions = db.properties?.[propertyName]?.select?.options || [];
        const existingNames = new Set(currentSelectOptions.map(o => o.name));
        const targetNames = options.map(o => o.name);
        const selectMatches = targetNames.every(name => existingNames.has(name)) &&
                            currentSelectOptions.length === targetNames.length;

        if (selectMatches) {
          console.log(`  ⚪ Skipping ${propertyName} - select property already matches`);
          return {
            dryRun: false,
            phaseName,
            action,
            status: 'skipped',
            databaseId,
            property: propertyName,
            message: 'Select property already matches target state',
          };
        }

        const propertyPayload = buildSelectPropertyPayload(propertyName, options);
        result = await patchDatabase(databaseId, propertyPayload);
        break;
      }

      default:
        throw new Error(`Unknown action: ${action}. Supported actions: createDatabase, patchDatabase, createPage, createRelationProperty, updateRelationProperty, createStatusProperty, updateStatusProperty, createSelectProperty, updateSelectProperty`);
    }

    console.log(`  ✓ Success\n`);

    return {
      dryRun: false,
      phaseName,
      action,
      status: 'success',
      data: result,
    };

  } catch (error) {
    console.error(`  ✗ Failed: ${error.message}\n`);
    throw error;
  }
}

function containsUnresolvedPlaceholder(payload) {
  const re = /^\[([A-Z_]+)\]$/;
  const check = (value) => {
    if (typeof value === 'string') return re.test(value);
    if (Array.isArray(value)) return value.some(check);
    if (value && typeof value === 'object') return Object.values(value).some(check);
    return false;
  };
  return check(payload);
}