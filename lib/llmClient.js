/**
 * LLM Client for backend agents
 * Calls OpenRouter (primary) or Groq (fallback) with JSON schema prompting.
 * Mirrors the pattern in supabase/functions/hermes/index.ts getCandidates() + runAI()
 */

// ── Provider discovery ──
function getCandidates() {
  const candidates = [];

  // Agnes direct API first (free 2.5 flash — more credits)
  const agnesKey = process.env.AGNES_API_KEY;
  if (agnesKey) {
    candidates.push({
      provider: 'agnes',
      model: process.env.AGNES_MODEL || 'agnes-2.5-flash',
      key: agnesKey,
      url: (process.env.AGNES_BASE_URL || 'https://apihub.agnes-ai.com/v1') + '/chat/completions',
    });
  }

  // NaraRouter / OmniRoute (free OpenRouter models via aggregator)
  const naraKey = process.env.NARAROUTER_API_KEY;
  if (naraKey) {
    candidates.push({
      provider: 'nara',
      model: process.env.NARAROUTER_MODEL || 'nararouter/openrouter/free',
      key: naraKey,
      url: 'https://api.nararouter.com/v1/chat/completions',
    });
  }

  // OpenRouter (secondary — openrouter/free model)
  const openRouterKey = process.env.OPENROUTER_API_KEY;
  if (openRouterKey) {
    candidates.push({
      provider: 'openrouter',
      model: process.env.OPENROUTER_MODEL_ID || 'openrouter/free',
      key: openRouterKey,
      url: 'https://openrouter.ai/api/v1/chat/completions',
    });
  }

  // Groq fallback (last resort — fast inference)
  const groqKey = process.env.GROQ_API_KEY;
  if (groqKey) {
    candidates.push({
      provider: 'groq',
      model: process.env.GROQ_MODEL_ID || 'llama-3.3-70b-versatile',
      key: groqKey,
      url: 'https://api.groq.com/openai/v1/chat/completions',
    });
  }

  return candidates;
}

// ── JSON schema → prompt string ──
/**
 * Renders a plain JSON object schema (as in src/lib/agents/schema.js)
 * into an indented JSON-Schema string suitable for LLM prompting.
 */
export function schemaToString(schemaObj) {
  return JSON.stringify(schemaObj, null, 2);
}

// ── Core LLM call ──
export async function callLLM(systemPrompt, userPrompt, opts = {}) {
  const { jsonSchema } = opts;

  const candidates = getCandidates();
  if (!candidates.length) {
    throw new Error(
      'No AI provider is configured. Set NARAROUTER_API_KEY, OPENROUTER_API_KEY, or GROQ_API_KEY.'
    );
  }

  let lastError = '';
  for (const c of candidates) {
    try {
      const requestBody = {
        model: c.model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        temperature: 0.35,
        max_tokens: 2000,
      };

      const headers = {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${c.key}`,
      };

      if (c.provider === 'openrouter') {
        headers['HTTP-Referer'] = 'https://digitallydefined.online';
        headers['X-Title'] = 'DigitallyDefined';
        if (jsonSchema) {
          requestBody.response_format = {
            type: 'json_object',
          };
        }
      }

      const res = await fetch(c.url, {
        method: 'POST',
        headers,
        body: JSON.stringify(requestBody),
        signal: AbortSignal.timeout ? AbortSignal.timeout(90000) : undefined,
      });

      if (!res.ok) {
        lastError = `${c.provider} HTTP ${res.status}: ${await res.text()}`;
        continue;
      }

      const payload = await res.json();
      const reply =
        payload?.choices?.[0]?.message?.content ||
        payload?.choices?.[0]?.delta?.content ||
        '';
      if (!reply) {
        lastError = `${c.provider} returned an empty response`;
        continue;
      }

      return { reply: reply.trim(), provider: c.provider, model: c.model };
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
    }
  }

  throw new Error(`All AI providers failed. Last error: ${lastError}`);
}

// ── Parse + validate JSON schema output ──
export function parseJsonReply(reply) {
  const cleaned = reply
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();
  return JSON.parse(cleaned);
}

/**
 * Validate a parsed object against a simple type-map schema.
 * @param {object} schema  e.g. { name: "string", scores: "array", meta: "object" }
 * @param {unknown} value  parsed JSON
 * @returns {string[]}     array of error strings (empty if valid)
 */
export function validateAgainstSchema(schema, value) {
  const errors = [];
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    errors.push('Output must be a JSON object');
    return errors;
  }
  for (const [field, expected] of Object.entries(schema)) {
    if (value[field] === undefined || value[field] === null) {
      errors.push(`Missing required field: ${field}`);
      continue;
    }
    let actual;
    if (Array.isArray(value[field])) actual = 'array';
    else if (value[field] === null) actual = 'null';
    else actual = typeof value[field];

    // Schema values ARE type names (e.g. 'array', 'string'); use them directly.
    const expectedType = expected;

    if (expectedType !== actual) {
      errors.push(`${field} must be ${expectedType}, received ${actual}`);
    }
  }
  return errors;
}

export default { callLLM, parseJsonReply, validateAgainstSchema, schemaToString };