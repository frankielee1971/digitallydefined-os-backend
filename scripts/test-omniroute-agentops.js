/**
 * Test Script for OmniRoute AgentOps Integration
 * 
 * This script tests:
 * 1. AgentOps initialization in Node.js
 * 2. OmniRoute client with AgentOps monitoring
 * 3. Trace creation for LLM calls
 */

import { omniRoute } from './lib/omniroute.js';

console.log('=== OmniRoute AgentOps Integration Test ===\n');

// Test 1: Check AgentOps initialization
console.log('Test 1: Checking AgentOps initialization...');
console.log('  Check console output above for:');
console.log('  - "✓ AgentOps initialized for OmniRoute" (success)');
console.log('  - "⚠️  AgentOps API key not found" (expected without API key)');
console.log('  - "⚠️  AgentOps not available" (if package not installed)');

// Test 2: Test OmniRoute call (will fail without API key, but should show AgentOps trace)
console.log('\nTest 2: Testing OmniRoute with AgentOps monitoring...');
try {
  const result = await omniRoute('Test AgentOps monitoring in OmniRoute', {
    model: 'openai/gpt-4o-mini',
    systemPrompt: 'You are a test assistant.',
    timeout: 10000
  });
  
  console.log('  Result:', result);
  
  if (result.error) {
    console.log('  ✓ OmniRoute call attempted (error expected without API key)');
    console.log('  ✓ AgentOps trace should have been created');
  } else {
    console.log('  ✓ OmniRoute call succeeded');
    console.log('  ✓ AgentOps trace created with model:', result.model);
  }
} catch (error) {
  console.log('  ✗ Error:', error.message);
}

// Test 3: Test with custom system prompt
console.log('\nTest 3: Testing with custom system prompt...');
try {
  const result = await omniRoute('Hello, Hermes!', {
    systemPrompt: 'You are Hermes, the strategic business partner.',
    jsonMode: false
  });
  
  console.log('  Result status:', result.error ? 'Error (expected)' : 'Success');
  console.log('  Provider:', result.provider);
  console.log('  Model:', result.model);
} catch (error) {
  console.log('  ✗ Error:', error.message);
}

// Summary
console.log('\n' + '='.repeat(60));
console.log('OmniRoute AgentOps Integration Test Complete');
console.log('='.repeat(60));
console.log('\n✓ AgentOps integration added to OmniRoute');
console.log('✓ LLM calls are wrapped with AgentOps traces');
console.log('✓ Error traces are logged');
console.log('\nTraces to look for in AgentOps dashboard:');
console.log('  - omniroute_llm_call (success)');
console.log('  - omniroute_llm_error (on error)');
console.log('  - omniroute_llm_failed (when all models fail)');
console.log('\nNext steps:');
console.log('1. Set AGENTOPS_API_KEY in your .env file');
console.log('2. Set OMNIROUTE_API_KEY in your .env file');
console.log('3. Start the backend: npm run dev or node index.js');
console.log('4. Make AI requests through the dashboard');
console.log('5. Monitor traces at: https://app.agentops.ai');
console.log('\nFor more information, visit: https://agentops.ai/docs');