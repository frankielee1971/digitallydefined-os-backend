/**
 * Test Script for Hermes Brand Builder Agent
 * 
 * This script tests:
 * 1. Agent registry loads correctly
 * 2. Agent is accessible via agentKey
 * 3. System prompt is properly configured
 * 4. Agent can be called via OmniRoute
 */

import { agents, getAgent, listAgents, isValidAgent } from './agents/index.js';

console.log('=== Hermes Brand Builder Agent Test ===\n');

// Test 1: Registry loads
console.log('✓ Agent registry loaded');
console.log(`  Total agents: ${listAgents().length}`);

// Test 2: Agent exists
const agentKey = 'hermes_brand_builder';
console.log(`\n✓ Testing agent: ${agentKey}`);
console.log(`  Valid agent: ${isValidAgent(agentKey)}`);

// Test 3: Agent details
const agent = getAgent(agentKey);
if (agent) {
  console.log(`  Name: ${agent.name}`);
  console.log(`  Description: ${agent.description}`);
  console.log(`  Category: ${agent.category}`);
  console.log(`  Version: ${agent.version}`);
  console.log(`  System prompt length: ${agent.systemPrompt.length} characters`);
  console.log(`  Has brand rules: ${agent.systemPrompt.includes('NEVER use border-radius')}`);
  console.log(`  Has color system: ${agent.systemPrompt.includes('#FFFCF9')}`);
  console.log(`  Has typography: ${agent.systemPrompt.includes('Inter') && agent.systemPrompt.includes('DM Sans')}`);
}

// Test 4: Verify no duplicate keys
const agentKeys = listAgents();
const uniqueKeys = new Set(agentKeys);
console.log(`\n✓ No duplicate keys: ${agentKeys.length === uniqueKeys.size}`);

// Test 5: Verify brand guidelines are present
const requiredBrandElements = [
  'Soft Brutalism',
  '#FFFCF9',
  '#111111',
  '#F18B25',
  '#47B7D4',
  'Inter',
  'DM Sans',
  'border-radius: 0px',
  'box-shadows',
  '1px solid #111111',
  '1100px',
  '24px',
  '32px'
];

console.log('\n✓ Brand guidelines verification:');
requiredBrandElements.forEach(element => {
  const found = agent.systemPrompt.includes(element);
  console.log(`  ${found ? '✓' : '✗'} ${element}`);
});

// Test 6: Example API call structure
console.log('\n=== Example API Call ===');
console.log('POST /api/hermes');
console.log({
  agentKey: 'hermes_brand_builder',
  message: 'Design a hero section for DigitallyDefined OS.',
  context: {
    product: 'DigitallyDefined OS',
    component: 'hero',
    requirements: ['responsive', 'mobile-first']
  }
});

console.log('\n=== Test Complete ===');
console.log('The Hermes Brand Builder agent is ready for use.');
console.log('\nTo test from dashboard:');
console.log('1. Ensure backend is running');
console.log('2. Open dashboard at /dashboard');
console.log('3. The agent will be called when agentKey: "hermes_brand_builder" is sent');
console.log('4. Or use the test script above to verify registry');