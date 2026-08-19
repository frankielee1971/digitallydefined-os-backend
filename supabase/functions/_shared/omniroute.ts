/**
 * OmniRoute Client
 * Unified AI gateway client for DigitallyDefined OS
 * 
 * Replaces direct calls to Groq, OpenRouter, ZAI, Nous, Gemini, Claude, GPT, etc.
 * All AI requests flow through OmniRoute's single endpoint with auto-fallback.
 */

import { hermesSystemPrompt } from './hermesSystemPrompt';

// Initialize AgentOps for monitoring
let agentops = null;
try {
  const AgentOps = await import('agentops');
  const AGENTOPS_API_KEY = Deno.env.get('AGENTOPS_API_KEY');
  if (AGENTOPS_API_KEY) {
    agentops = new AgentOps.default({ apiKey: AGENTOPS_API_KEY });
    console.log('✓ AgentOps initialized for OmniRoute');
  } else {
    console.log('⚠️  AgentOps API key not found - running without monitoring');
  }
} catch (e) {
  console.log('⚠️  AgentOps not available:', e.message);
}

const OMNIROUTE_BASE_URL = (Deno.env.get('OMNIROUTE_BASE_URL') || 'http://localhost:20128' || 'http://localhost:20128').replace(/\/$/, '');
const OMNIROUTE_API_KEY = (Deno.env.get('OMNIROUTE_API_KEY') || 'none' || Deno.env.get('ROUTER_API_KEY') || 'none' || 'none').trim();
const DEFAULT_MODEL = (Deno.env.get('OMNIROUTE_MODEL') || 'free' || 'free').trim();
const DEFAULT_SYSTEM_PROMPT = hermesSystemPrompt;

/**
 * Call OmniRoute with a prompt and optional parameters
 * 
 * @param {string} prompt - The user prompt/message
 * @param {object} options - Optional configuration
 * @param {string} options.model - Model override (default: OMNIROUTE_MODEL env or 'openai/gpt-4o-mini')
 * @param {string} options.systemPrompt - System prompt override
 * @param {boolean} options.jsonMode - Force JSON response mode
 * @param {number} options.timeout - Request timeout in ms (default: 60000)
 * @param {string[]} options.fallbackModels - Models to try if primary fails
 * @returns {Promise<{reply: string, provider: string, model: string, error: string|null}>}
 */
export async function omniRoute(prompt, options = {}) {
  if (!OMNIROUTE_API_KEY) {
    return {
      reply: '',
      provider: null,
      model: null,
      error: 'OMNIROUTE_API_KEY not configured in environment variables',
    };
  }

  if (!prompt || typeof prompt !== 'string' || !prompt.trim()) {
    return {
      reply: '',
      provider: null,
      model: null,
      error: 'Invalid prompt: must be a non-empty string',
    };
  }

  const model = options.model || DEFAULT_MODEL;
  const systemPrompt = options.systemPrompt || DEFAULT_SYSTEM_PROMPT;
  const jsonMode = options.jsonMode || false;
  const timeout = options.timeout || 60000;
  const fallbackModels = Array.isArray(options.fallbackModels) ? options.fallbackModels : [];

  const modelsToTry = [model, ...fallbackModels];
  let lastError = null;

  for (const currentModel of modelsToTry) {
    try {
      // AgentOps trace for LLM call
      const trace = agentops?.startTrace('omniroute_llm_call', {
        metadata: { model: currentModel, systemPrompt: systemPrompt.slice(0, 100) }
      });

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeout);

      const requestBody = {
        model: currentModel,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: prompt.trim() },
        ],
      };

      // Add JSON mode if requested
      if (jsonMode) {
        requestBody.response_format = { type: 'json_object' };
      }

      const response = await fetch(`${OMNIROUTE_BASE_URL}/v1/chat/completions`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${OMNIROUTE_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorText = await response.text();
        let errorMessage = `OmniRoute error: ${response.status} ${response.statusText}`;
        
        try {
          const errorJson = JSON.parse(errorText);
          errorMessage += ` - ${errorJson.error?.message || errorText.slice(0, 200)}`;
        } catch {
          errorMessage += ` - ${errorText.slice(0, 200)}`;
        }
        
        throw new Error(errorMessage);
      }

      const contentType = response.headers.get('content-type') || '';
      if (!contentType.includes('application/json')) {
        const text = await response.text();
        throw new Error(`OmniRoute returned non-JSON response: ${text.slice(0, 200)}`);
      }

      const data = await response.json();
      const rawReply = data?.choices?.[0]?.message?.content || '';

      if (!rawReply) {
        throw new Error('OmniRoute returned empty response');
      }

      // End trace on success
      trace?.end({ status: 'success', model: currentModel });

      return {
        reply: rawReply,
        provider: 'omniroute',
        model: currentModel,
        error: null,
      };

    } catch (error) {
      lastError = error.message || String(error);
      console.error(`[OmniRoute] Model ${currentModel} failed:`, lastError);
      
      // End trace on error
      try {
        agentops?.startTrace('omniroute_llm_error', {
          metadata: { model: currentModel, error: lastError }
        })?.end({ status: 'error' });
      } catch (e) {
        // Ignore trace errors
      }
      
      // Continue to next fallback model
      continue;
    }
  }

  // All models failed - log final error
  try {
    agentops?.startTrace('omniroute_llm_failed')?.end({
      status: 'failed',
      error: lastError,
      modelsTried: modelsToTry.length
    });
  } catch (e) {
    // Ignore trace errors
  }

  // All models failed
  return {
    reply: '',
    provider: null,
    model: null,
    error: lastError || 'All OmniRoute models failed',
  };
}

/**
 * Call OmniRoute with streaming support (if available)
 * 
 * @param {string} prompt - The user prompt/message
 * @param {object} options - Optional configuration (same as omniRoute)
 * @param {function} onChunk - Callback for each streaming chunk
 * @returns {Promise<{reply: string, provider: string, model: string, error: string|null}>}
 */
export async function omniRouteStream(prompt, options = {}, onChunk) {
  if (!OMNIROUTE_API_KEY) {
    return {
      reply: '',
      provider: null,
      model: null,
      error: 'OMNIROUTE_API_KEY not configured in environment variables',
    };
  }

  if (!prompt || typeof prompt !== 'string' || !prompt.trim()) {
    return {
      reply: '',
      provider: null,
      model: null,
      error: 'Invalid prompt: must be a non-empty string',
    };
  }

  const model = options.model || DEFAULT_MODEL;
  const systemPrompt = options.systemPrompt || DEFAULT_SYSTEM_PROMPT;
  const jsonMode = options.jsonMode || false;
  const timeout = options.timeout || 60000;

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    const requestBody = {
      model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: prompt.trim() },
      ],
      stream: true,
    };

    if (jsonMode) {
      requestBody.response_format = { type: 'json_object' };
    }

    const response = await fetch(`${OMNIROUTE_BASE_URL}/v1/chat/completions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OMNIROUTE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`OmniRoute streaming error: ${response.status} ${response.statusText} - ${errorText.slice(0, 200)}`);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let fullReply = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const chunk = decoder.decode(value, { stream: true });
      const lines = chunk.split('\n').filter(line => line.trim() !== '');

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = line.slice(6);
          if (data === '[DONE]') continue;

          try {
            const parsed = JSON.parse(data);
            const content = parsed?.choices?.[0]?.delta?.content || '';
            if (content) {
              fullReply += content;
              if (typeof onChunk === 'function') {
                onChunk(content, fullReply);
              }
            }
          } catch {
            // Skip invalid JSON chunks
          }
        }
      }
    }

    return {
      reply: fullReply,
      provider: 'omniroute',
      model,
      error: null,
    };

  } catch (error) {
    return {
      reply: '',
      provider: null,
      model: null,
      error: error.message || String(error),
    };
  }
}

export default { omniRoute, omniRouteStream };