/**
 * lib/notion-write.mjs
 *
 * Live Notion write executor for Phase 21 operations.
 * Provides a unified interface for executing Notion API writes with dry-run support.
 */

import { createDatabase, getDatabase, patchDatabase, createPage, hasNotionEnv } from './notion-client.mjs';

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
    const currentOptions = db.properties?.[propertyName]?.select?.options || [];
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
// Core write executor
// ---------------------------------------------------------------------------

/**
 * Execute a Notion write operation with dry-run support.
 *
 * @param {string} phaseName - Human-readable phase name for logging
 * @param {string} action - The action to perform (createDatabase, patchDatabase, createPage)
 * @param {object} payload - The payload for the action
 * @returns {Promise<object>} Result object with dryRun flag and action metadata
 * @throws {Error} If action is unknown or live write fails
 */
export async function executeNotionWrite(phaseName, action, payload) {
  // Dry-run mode
  if (SELLABLE_DRY_RUN) {
    console.log(`[DRY-RUN] ${phaseName} → ${action}`);
    console.log(`  Payload: ${JSON.stringify(payload, null, 2).substring(0, 200)}...`);
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
        const parentId = payload.parent?.page_id || payload.parentId;
        if (parentId && payload.title) {
          // For createDatabase, we can't easily check existence without searching
          // So we'll attempt creation and let Notion handle duplicates
          result = await createDatabase(payload);
        } else {
          result = await createDatabase(payload);
        }
        break;
      }

      case 'patchDatabase': {
        const databaseId = payload.databaseId || payload.target;
        if (!databaseId) {
          throw new Error('patchDatabase requires databaseId or target in payload');
        }

        // Idempotency: check if patch is needed
        const properties = payload.properties || {};
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
        result = await createPage(payload);
        break;
      }

      default:
        throw new Error(`Unknown action: ${action}. Supported actions: createDatabase, patchDatabase, createPage`);
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