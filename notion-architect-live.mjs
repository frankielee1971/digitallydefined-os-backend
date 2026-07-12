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
import { PHASES, payloads } from './phase-21-plan.js';

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

  // Execute phases in order
  for (const phaseDef of PHASES) {
    const phase = payloads[phaseDef.id];

    if (!phase) {
      console.log(`⚠ Phase ${phaseDef.id}: No payload definition found, skipping`);
      continue;
    }

    console.log(`[Phase ${phase.phase}] ${phase.name}`);

    try {
      // Build payload
      const payload = phase.buildPayload ? phase.buildPayload() : {};

      // Determine action - map updateDatabase to patchDatabase for notion-write
      let action = phase.action;
      if (action === 'updateDatabase') {
        action = 'patchDatabase';
      }

      // Execute write
      const result = await executeNotionWrite(phase.name, action, payload);

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
// Execute
// ---------------------------------------------------------------------------

runLiveExecution().catch((error) => {
  console.error('Fatal error during live execution:', error);
  process.exit(1);
});