/**
 * AI Router — OmniRoute ONLY (single-gateway consolidation)
 * All AI traffic routes through OmniRoute, which fans out to
 * upstream providers on its side. No direct provider calls.
 *
 * Required secret: OMNIROUTE_API_KEY
 * Optional: OMNIROUTE_BASE_URL (default https://api.omniroute.ai/v1), OMNIROUTE_MODEL
 */

export function getBestModel(_quality: "high" | "medium" | "low"): string {
  return Deno.env.get('OMNIROUTE_MODEL') || "auto";
}

export async function run(modelName: string, payload: Record<string, unknown> = {}) {
  const OMNIROUTE_KEY = Deno.env.get('OMNIROUTE_API_KEY') || '';
  if (!OMNIROUTE_KEY) throw new Error("OMNIROUTE_API_KEY is not configured");

  const baseUrl = (Deno.env.get('OMNIROUTE_BASE_URL') || 'https://api.omniroute.ai/v1').replace(/\/+$/, '');
  const model = modelName && modelName !== 'auto' ? modelName : getBestModel("medium");

  const res = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${OMNIROUTE_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      ...(model !== 'auto' ? { model } : {}),
      ...payload,
    }),
  });

  if (!res.ok) throw new Error(`OmniRoute API error: ${res.status} ${await res.text()}`);
  return await res.json();
}

export default run;
