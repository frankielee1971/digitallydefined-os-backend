/**
 * OmniRoute Integration Test Script
 * 
 * Tests the backend OmniRoute client to ensure:
 * - API key is configured
 * - Connection to OmniRoute works
 * - Fallback models function correctly
 * - Error handling is proper
 */

import { omniRoute, omniRouteStream } from './lib/omniroute.js';

const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function logTest(name, passed, details = '') {
  const status = passed ? '✓ PASS' : '✗ FAIL';
  const color = passed ? 'green' : 'red';
  log(`${status}: ${name}${details ? ` - ${details}` : ''}`, color);
  return passed;
}

async function testOmniRouteConfiguration() {
  log('\n=== Test 1: OmniRoute Configuration ===', 'cyan');
  
  const apiKey = process.env.OMNIROUTE_API_KEY;
  const baseUrl = process.env.OMNIROUTE_BASE_URL;
  const model = process.env.OMNIROUTE_MODEL;
  
  const hasApiKey = !!apiKey;
  const hasBaseUrl = !!baseUrl;
  const hasModel = !!model;
  
  logTest('OMNIROUTE_API_KEY is set', hasApiKey, hasApiKey ? `Length: ${apiKey.length}` : 'Not configured');
  logTest('OMNIROUTE_BASE_URL is set', hasBaseUrl, baseUrl || 'Using default: https://omniroute.ai');
  logTest('OMNIROUTE_MODEL is set', hasModel, model || 'Using default: openai/gpt-4o-mini');
  
  return hasApiKey;
}

async function testBasicCall() {
  log('\n=== Test 2: Basic OmniRoute Call ===', 'cyan');
  
  try {
    const result = await omniRoute('Say "Hello from OmniRoute test" and nothing else.', {
      model: process.env.OMNIROUTE_MODEL || 'openai/gpt-4o-mini',
      timeout: 30000,
    });
    
    const hasReply = !!result.reply;
    const noError = !result.error;
    const correctProvider = result.provider === 'omniroute';
    const hasModel = !!result.model;
    
    logTest('Received reply', hasReply, hasReply ? `Length: ${result.reply.length}` : 'No reply');
    logTest('No errors', noError, result.error || 'Success');
    logTest('Provider is omniroute', correctProvider, result.provider);
    logTest('Model is set', hasModel, result.model);
    
    if (hasReply) {
      log(`  Reply: "${result.reply.substring(0, 100)}${result.reply.length > 100 ? '...' : ''}"`, 'blue');
    }
    
    return hasReply && noError;
  } catch (error) {
    logTest('Basic call', false, error.message);
    return false;
  }
}

async function testJSONMode() {
  log('\n=== Test 3: JSON Mode ===', 'cyan');
  
  try {
    const result = await omniRoute(
      'Return a JSON object with keys: status (string), test (string), value (number). Set status to "ok", test to "omniroute", value to 42.',
      {
        model: process.env.OMNIROUTE_MODEL || 'openai/gpt-4o-mini',
        jsonMode: true,
        timeout: 30000,
      }
    );
    
    const hasReply = !!result.reply;
    const noError = !result.error;
    const isValidJson = hasReply && (() => {
      try {
        const cleaned = result.reply.replace(/```json|```/g, '').trim();
        const parsed = JSON.parse(cleaned);
        return parsed.status === 'ok' && parsed.test === 'omniroute' && parsed.value === 42;
      } catch {
        return false;
      }
    })();
    
    logTest('Received reply', hasReply);
    logTest('No errors', noError, result.error || 'Success');
    logTest('Valid JSON response', isValidJson, isValidJson ? 'JSON structure correct' : 'JSON structure incorrect');
    
    return hasReply && noError && isValidJson;
  } catch (error) {
    logTest('JSON mode', false, error.message);
    return false;
  }
}

async function testFallbackModels() {
  log('\n=== Test 4: Fallback Models ===', 'cyan');
  
  const fallback1 = process.env.OMNIROUTE_FALLBACK_MODEL_1;
  const fallback2 = process.env.OMNIROUTE_FALLBACK_MODEL_2;
  
  if (!fallback1 && !fallback2) {
    log('  Skipping: No fallback models configured (OMNIROUTE_FALLBACK_MODEL_1, OMNIROUTE_FALLBACK_MODEL_2)', 'yellow');
    return true;
  }
  
  try {
    // Use a non-existent model to trigger fallback
    const result = await omniRoute('Say "test"', {
      model: 'nonexistent/model-that-does-not-exist',
      fallbackModels: [fallback1, fallback2].filter(Boolean),
      timeout: 30000,
    });
    
    const hasReply = !!result.reply;
    const usedFallback = result.model !== 'nonexistent/model-that-does-not-exist';
    
    logTest('Fallback triggered', usedFallback, `Used model: ${result.model}`);
    logTest('Fallback succeeded', hasReply, hasReply ? 'Got reply from fallback' : 'No reply');
    
    return hasReply;
  } catch (error) {
    logTest('Fallback models', false, error.message);
    return false;
  }
}

async function testErrorHandling() {
  log('\n=== Test 5: Error Handling ===', 'cyan');
  
  // Test empty prompt
  const emptyResult = await omniRoute('');
  const emptyHandled = !emptyResult.reply && emptyResult.error;
  logTest('Empty prompt handled', emptyHandled, emptyResult.error || 'No error');
  
  // Test invalid API key (if we can simulate)
  // This would require mocking, so we'll just verify the structure
  const nullResult = await omniRoute('test', { model: null });
  logTest('Null model handled', !!nullResult.error || !!nullResult.reply, 'Graceful handling');
  
  return emptyHandled;
}

async function testStreaming() {
  log('\n=== Test 6: Streaming Support ===', 'cyan');
  
  try {
    let chunksReceived = 0;
    let fullText = '';
    
    const result = await omniRouteStream(
      'Count from 1 to 5, each on a new line.',
      {
        model: process.env.OMNIROUTE_MODEL || 'openai/gpt-4o-mini',
        timeout: 30000,
      },
      (chunk, full) => {
        chunksReceived++;
        fullText = full;
      }
    );
    
    const hasReply = !!result.reply;
    const noError = !result.error;
    const hasChunks = chunksReceived > 0;
    
    logTest('Streaming completed', hasReply);
    logTest('No errors', noError, result.error || 'Success');
    logTest('Chunks received', hasChunks, `Chunks: ${chunksReceived}`);
    logTest('Full text assembled', fullText.length > 0, `Length: ${fullText.length}`);
    
    return hasReply && noError;
  } catch (error) {
    logTest('Streaming', false, error.message);
    return false;
  }
}

async function runAllTests() {
  log('\n╔════════════════════════════════════════╗', 'blue');
  log('║   OmniRoute Integration Test Suite    ║', 'blue');
  log('╚════════════════════════════════════════╝\n', 'blue');
  
  const results = {
    'Configuration': await testOmniRouteConfiguration(),
    'Basic Call': await testBasicCall(),
    'JSON Mode': await testJSONMode(),
    'Fallback Models': await testFallbackModels(),
    'Error Handling': await testErrorHandling(),
    'Streaming': await testStreaming(),
  };
  
  // Summary
  log('\n=== Test Summary ===', 'cyan');
  const total = Object.keys(results).length;
  const passed = Object.values(results).filter(Boolean).length;
  const failed = total - passed;
  
  Object.entries(results).forEach(([name, passed]) => {
    logTest(name, passed);
  });
  
  log(`\nTotal: ${total} | Passed: ${passed} | Failed: ${failed}`, passed === total ? 'green' : 'yellow');
  
  if (failed === 0) {
    log('\n✓ All tests passed! OmniRoute is properly configured.', 'green');
    process.exit(0);
  } else {
    log('\n✗ Some tests failed. Please check the configuration.', 'red');
    process.exit(1);
  }
}

// Run tests
runAllTests().catch((error) => {
  log(`\n✗ Test suite failed: ${error.message}`, 'red');
  console.error(error);
  process.exit(1);
});