/**
 * AI Router — Direct-to-Provider Mode (OmniRoute disabled)
 * 
 * Quality priority: Agnes → StepFun → Poolside → NVIDIA NIM → HuggingFace → Groq → OpenRouter
 */

export function getBestModel(quality: "high" | "medium" | "low"): string {
  switch (quality) {
    case "high": return Deno.env.get('AGENS_MODEL_ID') || "";
    case "medium": return Deno.env.get('GROQ_MODEL_ID') || "meta-llama/llama-4-scout-17b-16e-instruct";
    case "low": return Deno.env.get('OPENROUTER_MODEL_ID') || "openai/gpt-4o-mini";
  }
}

export async function run(modelName, payload = {}) {
  const modelId = getBestModel("medium");
  const GROQ_KEY = Deno.env.get('GROQ_API_KEY') || '';
  const OPENROUTER_KEY = Deno.env.get('OPENROUTER_API_KEY') || '';
  
  try {
    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${GROQ_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: modelId,
        ...payload,
      }),
    });
    
    if (!res.ok) throw new Error(`Groq API error: ${res.status}`);
    return await res.json();
  } catch (err: unknown) {
    // Fallback to OpenRouter
    try {
      const res2 = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${OPENROUTER_KEY}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': 'https://digitallydefined.online',
        },
        body: JSON.stringify({
          model: 'openai/gpt-4o-mini',
          ...payload,
        }),
      });
      
      if (!res2.ok) throw new Error(`OpenRouter API error: ${res2.status}`);
      return await res2.json();
    } catch (err2: unknown) {
      throw new Error(`AI routing failed: ${err.message || err}`);
    }
  }
}

export default run;
