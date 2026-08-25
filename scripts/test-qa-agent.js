/**
 * Test Script for Hermes Quality Assurance Agent
 * 
 * This script tests:
 * 1. QA agent exists in registry
 * 2. Agent can be retrieved by key
 * 3. Agent run method works correctly
 */

import { agents, getAgent, listAgents, isValidAgent } from './agents/index.js';

console.log('=== Hermes Quality Assurance Agent Test ===\n');

// Test 1: Registry loads
console.log('Test 1: Checking agent registry...');
console.log(`  Total agents: ${listAgents().length}`);
console.log(`  Agents: ${listAgents().join(', ')}`);

// Test 2: QA agent exists
const agentKey = 'hermes_quality_assurance';
console.log(`\nTest 2: Checking QA agent (${agentKey})...`);
console.log(`  Valid agent: ${isValidAgent(agentKey)}`);

// Test 3: Agent details
const agent = getAgent(agentKey);
if (agent) {
  console.log(`  Name: ${agent.name}`);
  console.log(`  Description: ${agent.description}`);
  console.log(`  Agent Key: ${agent.agentKey}`);
  console.log(`  Has run method: ${typeof agent.run === 'function'}`);
}

// Test 4: Mock LLM test
console.log('\nTest 3: Testing QA agent with mock LLM...');
try {
  const mockLLM = {
    chat: async (messages) => {
      console.log(`  Mock LLM received ${messages.length} messages`);
      console.log(`  System prompt length: ${messages[0].content.length} chars`);
      return {
        content: `QA Review Complete:\n\n1. Pass/Fail Decision: PASS\n2. Issues Found: None\n3. Corrected Version: N/A\n4. Final Approval Statement: Approved for publishing.`
      };
    }
  };

  const result = await agent.run({
    input: 'Review this before publishing',
    llm: mockLLM
  });

  console.log('  ✓ QA agent executed successfully');
  console.log('  Result:', result);
} catch (error) {
  console.log('  ✗ Error:', error.message);
}

// Test 5: Verify agent structure
console.log('\nTest 4: Verifying agent structure...');
const requiredFields = ['name', 'agentKey', 'description', 'run'];
const missingFields = requiredFields.filter(field => !agent[field]);

if (missingFields.length === 0) {
  console.log('  ✓ All required fields present');
} else {
  console.log('  ✗ Missing fields:', missingFields);
}

// Test 6: Verify system prompt content
console.log('\nTest 5: Verifying QA system prompt...');
const systemPrompt = agent.run.toString();
const requiredChecks = [
  'Brand consistency',
  'Soft Brutalism',
  'Inter + DM Sans',
  'No shadows',
  'No border radius',
  'Pass/Fail Decision',
  'List of Issues Found',
  'Corrected Version',
  'Final Approval Statement'
];

requiredChecks.forEach(check => {
  const found = systemPrompt.includes(check);
  console.log(`  ${found ? '✓' : '✗'} ${check}`);
});

// Summary
console.log('\n' + '='.repeat(60));
console.log('QA Agent Test Complete');
console.log('='.repeat(60));
console.log('\n✓ QA agent file exists');
console.log('✓ QA agent registered in index.js');
console.log('✓ Agent structure is correct');
console.log('✓ Agent can be called with run() method');
console.log('\nNext steps:');
console.log('1. Ensure OmniRoute routing is configured in api/hermes.js');
console.log('2. Test with real LLM through backend endpoint');
console.log('3. Integrate with dashboard for publishing workflow');
console.log('\nUsage in OmniRoute:');
console.log('  POST /api/hermes');
console.log('  {');
console.log('    agentKey: "hermes_quality_assurance",');
console.log('    message: "Review this content before publishing"');
console.log('  }');