/**
 * OmniRoute Client (Node)
 * Unified AI gateway client for DigitallyDefined OS.
 *
 * All AI requests flow through the single OmniRoute endpoint:
 *   ${OMNIROUTE_BASE_URL}/v1/chat/completions
 * The base URL may be provided with or without a trailing "/v1" —
 * it is normalized here so both forms resolve to the same endpoint.
 *
 * Required env: OMNIROUTE_API_KEY
 * Optional env: OMNIROUTE_BASE_URL (default https://api.omniroute.ai/v1),
 *               OMNIROUTE_MODEL (default "auto")
 */

const DEFAULT_SYSTEM_PROMPT =
  'You are Hermes, the AI business partner for DigitallyDefined. Be concise and actionable.';

// Accept base URL with or without a trailing "/v1"; always resolve to "<origin>/v1".
export function normalizeOmnirouteBase(raw) {
  return String(raw || process.env.OMNIROUTE_BASE_URL || 'https://api.omniroute.ai/v1')
    .trim()
    .replace(/\/+$/, '')
    .replace(/\/v1$/, '') + '/v1';
}

const OMNIROUTE_BASE_URL = normalizeOmnirouteBase(process.env.OMNIROUTE_BASE_URL);
const OMNIROUTE_API_KEY = (process.env.OMNIROUTE_API_KEY || process.env.ROUTER_API_KEY || '').trim();
const DEFAULT_MODEL = (process.env.OMNIROUTE_MODEL || 'auto').trim();

function buildMessages(prompt, systemPrompt) {
  return [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: prompt.trim() },
  ];
}

function errorResult(error) {
  return { reply: '', provider: null, model: null, error };
}

function validateInputs(prompt) {
  if (!OMNIROUTE_API_KEY) {
    return 'OMNIROUTE_API_KEY not configured in environment variables';
  }
  if (!prompt || typeof prompt !== 'string' || !prompt.trim()) {
    return 'Invalid prompt: must be a non-empty string';
  }
  return null;
}

async function postChat(requestBody, timeout) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);
  try {
    const response = await fetch(`${OMNIROUTE_BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OMNIROUTE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
      signal: controller.signal,
    });
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`OmniRoute error: ${response.status} ${response.statusText} - ${errorText.slice(0, 200)}`);
    }
    return response;
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Call OmniRoute with a prompt and optional parameters
 * @param {string} prompt - The user prompt/message
 * @param {object} options - { model, systemPrompt, jsonMode, timeout, fallbackModels }
 * @returns {Promise<{reply: string, provider: string|null, model: string|null, error: string|null}>}
 */
/**
 * Extract the assistant reply from either a standard JSON chat response or
 * an SSE stream body (this OmniRoute instance may stream even when
 * stream:false is requested, e.g. for the "auto" model).
 */
async function extractReply(response) {
  const contentType = response.headers.get('content-type') || '';
  const text = await response.text();

  if (!contentType.includes('text/event-stream') && !text.trimStart().startsWith('data:')) {
    const data = JSON.parse(text);
    return data?.choices?.[0]?.message?.content || '';
  }

  let reply = '';
  for (const line of text.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed.startsWith('data:')) continue;
    const payload = trimmed.slice(5).trim();
    if (!payload || payload === '[DONE]') continue;
    try {
      const parsed = JSON.parse(payload);
      const delta = parsed?.choices?.[0]?.delta?.content
        || parsed?.choices?.[0]?.message?.content
        || '';
      reply += delta;
    } catch {
      // Skip invalid JSON chunks
    }
  }
  return reply;
}

export async function omniRoute(prompt, options = {}) {
  const inputError = validateInputs(prompt);
  if (inputError) return errorResult(inputError);

  const primaryModel = options.model || DEFAULT_MODEL;
  const systemPrompt = options.systemPrompt || DEFAULT_SYSTEM_PROMPT;
  const jsonMode = options.jsonMode || false;
  const timeout = options.timeout || 60000;
  const fallbackModels = Array.isArray(options.fallbackModels) ? options.fallbackModels : [];
  const modelsToTry = [primaryModel, ...fallbackModels.filter(Boolean)];
  let lastError = null;

  for (const currentModel of modelsToTry) {
    try {
      const requestBody = { model: currentModel, messages: buildMessages(prompt, systemPrompt) };
      if (jsonMode) requestBody.response_format = { type: 'json_object' };

      const response = await postChat(requestBody, timeout);
      const reply = await extractReply(response);
      if (!reply) throw new Error('OmniRoute returned an empty response');

      return { reply, provider: 'omniroute', model: currentModel, error: null };
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
    }
  }

  return errorResult(lastError || 'All OmniRoute models failed');
}

/**
 * Call OmniRoute with streaming support
 * @param {string} prompt - The user prompt/message
 * @param {object} options - Same options as omniRoute
 * @param {function} onChunk - Callback (chunkText, fullReplySoFar) per SSE chunk
 */
export async function omniRouteStream(prompt, options = {}, onChunk) {
  const inputError = validateInputs(prompt);
  if (inputError) return errorResult(inputError);

  const model = options.model || DEFAULT_MODEL;
  const systemPrompt = options.systemPrompt || DEFAULT_SYSTEM_PROMPT;
  const timeout = options.timeout || 60000;

  try {
    const requestBody = {
      model,
      messages: buildMessages(prompt, systemPrompt),
      stream: true,
    };
    if (options.jsonMode) requestBody.response_format = { type: 'json_object' };

    const response = await postChat(requestBody, timeout);
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let fullReply = '';
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || ''; // keep partial line for next read

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith('data:')) continue;
        const data = trimmed.slice(5).trim();
        if (data === '[DONE]') continue;
        try {
          const parsed = JSON.parse(data);
          const content = parsed?.choices?.[0]?.delta?.content || '';
          if (content) {
            fullReply += content;
            if (typeof onChunk === 'function') onChunk(content, fullReply);
          }
        } catch {
          // Skip invalid JSON chunks
        }
      }
    }

    return { reply: fullReply, provider: 'omniroute', model, error: null };
  } catch (error) {
    return errorResult(error instanceof Error ? error.message : String(error));
  }
}

export default { omniRoute, omniRouteStream };