// aiRouter.js — Free‑Only Router for DigitallyDefined

// Your ONLY guaranteed free model:
const FREE_MODEL = "upstage/solar-pro4:free";

// Map intents → free routes (all resolve to FREE_MODEL)
const MODEL_ROUTES = {
  free: FREE_MODEL,
  reasoning: FREE_MODEL,
  workflow: FREE_MODEL,
  seo: FREE_MODEL,
  automation: FREE_MODEL,
};

const OMNIROUTE_BASE_URL = (process.env.OMNIROUTE_BASE_URL || "http://localhost:20128")
  .replace(/\/$/, "");
const OMNIROUTE_API_KEY = (process.env.OMNIROUTE_API_KEY || process.env.ROUTER_API_KEY || "none")
  .trim();

/**
 * Intent-based routing (all free)
 */
function resolveRoute(modelName, payload = {}) {
  const requested = typeof modelName === "string" ? modelName.trim() : "";

  const intent = [
    payload.intent,
    payload.task,
    payload.type,
    payload.mode,
    payload.category,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  // Direct request
  if (MODEL_ROUTES[requested]) return MODEL_ROUTES[requested];

  // Intent detection (all map to FREE_MODEL)
  if (intent.includes("design")) return FREE_MODEL;
  if (intent.includes("ui")) return FREE_MODEL;
  if (intent.includes("ux")) return FREE_MODEL;
  if (intent.includes("cta")) return FREE_MODEL;
  if (intent.includes("hero")) return FREE_MODEL;
  if (intent.includes("layout")) return FREE_MODEL;

  if (intent.includes("dashboard")) return FREE_MODEL;
  if (intent.includes("module")) return FREE_MODEL;

  if (intent.includes("roadmap")) return FREE_MODEL;
  if (intent.includes("steps")) return FREE_MODEL;

  if (intent.includes("niche")) return FREE_MODEL;
  if (intent.includes("persona")) return FREE_MODEL;

  if (intent.includes("seo")) return FREE_MODEL;
  if (intent.includes("architecture")) return FREE_MODEL;

  if (intent.includes("workflow")) return FREE_MODEL;
  if (intent.includes("automation")) return FREE_MODEL;

  if (intent.includes("summary")) return FREE_MODEL;
  if (intent.includes("summarize")) return FREE_MODEL;

  if (intent.includes("extract")) return FREE_MODEL;
  if (intent.includes("metadata")) return FREE_MODEL;

  if (intent.includes("reasoning")) return FREE_MODEL;
  if (intent.includes("logic")) return FREE_MODEL;

  // Default fallback
  return FREE_MODEL;
}

/**
 * OmniRoute request (always free model)
 */
export async function run(modelName, payload = {}) {
  const model = resolveRoute(modelName, payload);

  try {
    const response = await fetch(`${OMNIROUTE_BASE_URL}/v1/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${OMNIROUTE_API_KEY}`,
      },
      body: JSON.stringify({
        model,
        ...payload,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `OmniRoute request failed: ${response.status} ${response.statusText} - ${errorText.slice(0, 200)}`
      );
    }

    return response.json();
  } catch (error) {
    throw new Error(error.message || "OmniRoute request failed");
  }
}

export { MODEL_ROUTES };
export default run;
