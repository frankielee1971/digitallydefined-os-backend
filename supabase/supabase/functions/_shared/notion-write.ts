/**
 * lib/notion-write.js
 *
 * Write executor for Hermes live mode.
 * Routes Notion API calls based on action type and live mode flag.
 */

import { createDatabase, updateDatabase } from './notion-client';

/**
 * Execute a Notion write operation
 * @param {string} phaseName - Name of the phase being executed
 * @param {string} action - Action type (createDatabase, updateDatabase)
 * @param {object} payload - Payload for the operation
 * @returns {Promise<object>} Result object with dryRun flag and response data
 */
export async function executeNotionWrite(phaseName, action, payload) {
  const LIVE_MODE = Deno.env.get('NOTION_LIVE_MODE') || 'false' === 'true';
  const SECRET = Deno.env.get('NOTION_SECRET');

  // Dry-run mode: log and return
  if (!LIVE_MODE) {
    console.log(`[DRY-RUN] ${phaseName} → ${action}`);
    console.log(`  Payload: ${JSON.stringify(payload, null, 2)}`);
    return { dryRun: true, phaseName, action };
  }

  // Live mode: validate secret and execute
  if (!SECRET) {
    throw new Error('NOTION_SECRET environment variable is not set');
  }

  console.log(`[LIVE] Executing ${phaseName} → ${action}`);

  let result;
  switch (action) {
    case 'createDatabase':
      result = await createDatabase(SECRET, payload);
      break;
    case 'updateDatabase':
      // Extract database ID from payload or use target field
      const databaseId = payload.databaseId || payload.target;
      if (!databaseId) {
        throw new Error('updateDatabase requires databaseId or target in payload');
      }
      // Remove target from payload if present (not part of Notion API)
      const { target, ...updatePayload } = payload;
      result = await updateDatabase(SECRET, databaseId, updatePayload);
      break;
    default:
      throw new Error(`Unknown action: ${action}`);
  }

  console.log(`[LIVE] ${phaseName} completed successfully`);
  return { dryRun: false, phaseName, action, result };
}