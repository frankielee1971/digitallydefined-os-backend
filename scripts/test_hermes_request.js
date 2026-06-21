import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const handlerPath = path.join(__dirname, '..', 'api', 'hermes.js');

console.log('Loading handler from', handlerPath);

const { default: handler } = await import(`file://${handlerPath}`);

// Ensure backend accepts our test API key
process.env.DASHBOARD_API_KEY = process.env.DASHBOARD_API_KEY || 'DigitallyDefined-OS-2026';

function makeRes() {
  let statusCode = 200;
  const headers = {};
  const body = { data: null };
  return {
    setHeader(k, v) { headers[k] = v; },
    status(code) { statusCode = code; return this; },
    json(payload) { body.data = payload; console.log('== response (status', statusCode, ') =='); console.log(JSON.stringify(payload, null, 2)); return Promise.resolve(); },
    end() { console.log('== end (status', statusCode, ') =='); return Promise.resolve(); }
  };
}

async function runTest(name, reqBody) {
  console.log('\n--- Test:', name, '---');
  const req = {
    method: 'POST',
    headers: {
      'x-api-key': process.env.DASHBOARD_API_KEY,
      origin: 'http://localhost:5173'
    },
    json: async () => reqBody,
    body: reqBody
  };

  const res = makeRes();
  try {
    await handler(req, res);
  } catch (err) {
    console.error('Handler threw:', err);
  }
}

await runTest('message field', { message: 'hello from message field' });
await runTest('content field', { content: 'hello from content' });
await runTest('text field', { text: 'hello from text' });
await runTest('messages array', { messages: [{ role: 'user', content: 'hello from messages' }] });
await runTest('conversation array', { conversation: [{ role: 'user', content: 'hello from conversation' }] });

console.log('\nAll tests completed');
