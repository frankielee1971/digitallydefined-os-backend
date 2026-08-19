const MODEL_ROUTES = {
  free: 'free',
  freeFast: 'openrouter/openai/gpt-4o-mini',
  freeLarge: 'auto/llama',
  reasoning: 'auto/best-reasoning',
  paid: 'openrouter/openai/gpt-4o',
  workflow: 'agentrouter/claude-opus-4-6',
  seo: 'openrouter/openai/gpt-4o',
  automation: 'groq/llama-3.3-70b-versatile',
  paidClaude: 'agentrouter/claude-opus-4-6',
  paidGPT: 'openrouter/openai/gpt-4o',
  paidGroq: 'groq/llama-3.3-70b-versatile',
};

const OMNIROUTE_BASE_URL = (process.env.OMNIROUTE_BASE_URL || 'http://localhost:20128').replace(/\/$/, '');
const OMNIROUTE_API_KEY = (process.env.OMNIROUTE_API_KEY || process.env.ROUTER_API_KEY || 'none').trim();

function resolveRoute(modelName, payload = {}) {
  const requestedModel = typeof modelName === 'string' ? modelName.trim() : '';
  const intent = [payload?.intent, payload?.task, payload?.type, payload?.mode]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();

  if (MODEL_ROUTES[requestedModel]) {
    return MODEL_ROUTES[requestedModel];
  }

  if (intent.includes('summary') || intent.includes('summarize')) return MODEL_ROUTES.freeFast;
  if (intent.includes('tag') || intent.includes('classification')) return MODEL_ROUTES.free;
  if (intent.includes('metadata') || intent.includes('extract')) return MODEL_ROUTES.freeLarge;
  if (intent.includes('cleanup') || intent.includes('file')) return MODEL_ROUTES.freeFast;
  if (intent.includes('seo') || intent.includes('architecture')) return MODEL_ROUTES.paidGPT;
  if (intent.includes('workflow') || intent.includes('business') || intent.includes('logic')) return MODEL_ROUTES.paidClaude;
  if (intent.includes('dashboard')) return MODEL_ROUTES.paidGroq;

  return MODEL_ROUTES[requestedModel] || requestedModel || MODEL_ROUTES.free;
}

function buildModelCandidates(route) {
  const candidates = [];

  if (!route) {
    return ['free'];
  }

  if (route.includes('/')) {
    return [route];
  }

  candidates.push(route);

  if (route === 'paid-claude') {
    candidates.push('anthropic/claude-3-5-sonnet-latest');
  } else if (route === 'paid-gpt') {
    candidates.push('openai/gpt-4o');
  } else if (route === 'paid-groq') {
    candidates.push('groq/llama-3.1-8b-instant');
  } else if (route === 'free-fast' || route === 'free' || route === 'free-large') {
    candidates.push('openai/gpt-4o-mini');
  } else if (route === 'paid') {
    candidates.push('openai/gpt-4o');
  }

  return [...new Set(candidates)];
}

export async function run(modelName, payload = {}) {
  const route = resolveRoute(modelName, payload);
  const modelCandidates = buildModelCandidates(route);
  const requestPayload = { ...payload };
  let lastError = null;

  for (const candidateModel of modelCandidates) {
    try {
      const response = await fetch(`${OMNIROUTE_BASE_URL}/v1/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${OMNIROUTE_API_KEY}`,
        },
        body: JSON.stringify({
          model: candidateModel,
          ...requestPayload,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        lastError = `OmniRoute request failed: ${response.status} ${response.statusText} - ${errorText.slice(0, 200)}`;
        continue;
      }

      return response.json();
    } catch (error) {
      lastError = error.message || 'OmniRoute request failed';
    }
  }

  throw new Error(lastError || 'OmniRoute request failed');
}

export { MODEL_ROUTES };
export default run;
