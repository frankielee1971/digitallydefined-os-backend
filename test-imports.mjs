// Quick import validation test
import { createDatabase, updateDatabase } from './lib/notion-client.js';
import { executeNotionWrite } from './lib/notion-write.js';
import { PHASES, validatePhase } from './phase-21-plan.js';

console.log('✓ All imports successful');
console.log(`  - notion-client: ${typeof createDatabase}, ${typeof updateDatabase}`);
console.log(`  - notion-write: ${typeof executeNotionWrite}`);
console.log(`  - phase-21-plan: ${PHASES.length} phases, validatePhase=${typeof validatePhase}`);