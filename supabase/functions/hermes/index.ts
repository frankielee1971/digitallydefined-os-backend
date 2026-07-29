// supabase/functions/hermes/index.ts
// Unified AI gateway — ported from api/index.js + api/hermes.js
// Serves /api/hermes equivalent on Supabase Edge Functions

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { corsHeaders } from "../_shared/cors-utils.ts";

interface Ctx {
  env: Record<string, string>;
}

serve(async (req: Request, ctx: Ctx) => {
  const env = ctx.env;
  const url = new URL(req.url);

  // === CORS ===
  let response = new Response("ok", { status: 200, headers: corsHeaders(req.headers.get("origin") || "") });
  if (req.method === "OPTIONS") return response;

  // === Auth ===
  const providedKey = (req.headers.get("x-api-key") || req.headers.get("authorization") || "").trim();
  const expectedKey = (env.DASHBOARD_API_KEY || env.VITE_DASHBOARD_API_KEY || "").trim();
  if (!expectedKey || providedKey !== expectedKey) {
    return new Response(JSON.stringify({ error: "Unauthorized - Invalid or missing API key" }), {
      status: 401, headers: { "Content-Type": "application/json", ...corsHeaders("") },
    });
  }

  // === Method ===
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed - use POST" }), {
      status: 405, headers: { "Content-Type": "application/json" },
    });
  }

  // === Parse body ===
  let body: Record<string, unknown> = {};
  const contentType = (req.headers.get("content-type") || "").toLowerCase();
  try {
    const text = await req.text();
    body = text ? JSON.parse(text) : {};
  } catch (e) {
    return new Response(JSON.stringify({ error: "Invalid JSON body" }), { status: 400 });
  }

  // === Action routing ===
  const action = String(body.action || "").trim();
  if (action === "dashboard") {
    return new Response(JSON.stringify({
      ok: true, source: "hermes-backend", message: "Dashboard data loaded successfully",
      timestamp: Date.now(), reply: "Hermes dashboard action acknowledged",
      provider: null, model: null, conversationUpdates: [],
      dashboardSnapshotUpdate: body.context || null,
    }), { status: 200, headers: { "Content-Type": "application/json" } });
  }

  if (action === "status" || action === "routes") {
    const routes = [
      { action: "hermes", method: "POST", scope: "dashboard", description: "AI chat gateway", handler: "/hermes" },
      { action: "followup", method: "GET,POST", scope: "dashboard", description: "Follow-up pipeline", handler: "/followup" },
      { action: "post-publisher", method: "GET,POST", scope: "dashboard", description: "Social post scheduler", handler: "/post-publisher" },
      { action: "sync", method: "POST", scope: "internal", description: "Vault sync", handler: "/sync" },
      { action: "cron.sellable.run", method: "POST", scope: "internal", description: "Sellable cron jobs", handler: "/sellable" },
    ];
    if (action === "routes") {
      return new Response(JSON.stringify({ ok: true, routes }), { status: 200 });
    }
    return new Response(JSON.stringify({ ok: true, status: "running", routes, timestamp: Date.now() }), { status: 200 });
  }

  // === Extract message ===
  const context = body.context || {};
  const conversation = Array.isArray(body.conversation) ? body.conversation : Array.isArray(body.messages) ? body.messages : [];
  let message = "";

  if (typeof body.message === "string" && body.message.trim()) message = body.message.trim();
  else if (typeof body.content === "string" && body.content.trim()) message = body.content.trim();
  else if (typeof body.text === "string" && body.text.trim()) message = body.text.trim();
  else if (Array.isArray(conversation) && conversation.length) {
    const userConv = conversation.find((c: any) => (c.role === "user" || c.role === undefined) && (c.content || c.text)) || conversation[0];
    message = (userConv?.content || userConv?.text || "").trim();
  }

  if (!message || typeof message !== "string") {
    return new Response(JSON.stringify({ error: "Missing or invalid message field" }), { status: 400 });
  }

  // === System prompt ===
  let systemPrompt = "You are Hermes, the orchestrator of DigitallyDefined OS.";
  if (body.systemPrompt) systemPrompt = String(body.systemPrompt);

  // === Call AI via direct-to-provider routing (OmniRoute disabled) ===
  // Priority: Agnes → StepFun → Poolside → NVIDIA NIM → HuggingFace → Groq → OpenRouter
  const AGNES_KEY = env.AGENS_API_KEY || "";
  const AGNES_BASE = "https://api.agnes.sapiens.ai/v1/chat/completions";
  
  const STEPFUN_KEY = env.STEPFUN_API_KEY || "";
  const STEPFUN_BASE = env.STEPFUN_BASE_URL || "https://api.stepfun.com/v1/chat/completions";
  
  const POOLSIDE_KEY = env.POOLSIDE_API_KEY || "";
  const POOLSIDE_BASE = env.POOLSIDE_BASE_URL || "https://api.poolside.ai/v1/chat/completions";
  
  const NVIDIA_NIM_KEY = env.NVIDIA_NIM_API_KEY || "";
  const NVIDIA_NIM_BASE = env.NVIDIA_NIM_BASE_URL || "https://integrate.api.nvidia.com/v1/chat/completions";
  
  const HUGGINGFACE_KEY = env.HUGGINGFACE_API_KEY || "";
  const HUGGINGFACE_BASE = env.HUGGINGFACE_BASE_URL || "https://api-inference.huggingface.co/models";
  
  const GROQ_KEY = env.GROQ_API_KEY || "";
  const GROQ_BASE = env.GROQ_BASE_URL || "https://api.groq.com/openai/v1/chat/completions";
  
  const OPENROUTER_KEY = env.OPENROUTER_API_KEY || "";
  const OPENROUTER_BASE = "https://openrouter.ai/api/v1/chat/completions";

  let reply = "";
  let provider = "";
  let model = null;

  // Build routing config from environment variables
  // Each entry: { modelId, key, baseUrl, provider }
  const routingRules: Array<{modelId?: string; key: string; baseUrl: string; provider: string}> = [];
  
  // Agnes (priority 1 — quality & speed)
  if (AGNES_KEY && env.AGENS_MODEL_ID) {
    routingRules.push({
      modelId: env.AGENS_MODEL_ID,
      key: AGNES_KEY,
      baseUrl: AGNES_BASE,
      provider: "agnes",
    });
  }
  
  // StepFun (priority 2)
  if (STEPFUN_KEY && env.STEPFUN_MODEL_ID) {
    routingRules.push({
      modelId: env.STEPFUN_MODEL_ID,
      key: STEPFUN_KEY,
      baseUrl: STEPFUN_BASE,
      provider: "stepfun",
    });
  }
  
  // Poolside (priority 3)
  if (POOLSIDE_KEY && env.POOLSIDE_MODEL_ID) {
    routingRules.push({
      modelId: env.POOLSIDE_MODEL_ID,
      key: POOLSIDE_KEY,
      baseUrl: POOLSIDE_BASE,
      provider: "poolside",
    });
  }
  
  // NVIDIA NIM (priority 4)
  if (NVIDIA_NIM_KEY && env.NVIDIA_NIM_MODEL_ID) {
    routingRules.push({
      modelId: env.NVIDIA_NIM_MODEL_ID,
      key: NVIDIA_NIM_KEY,
      baseUrl: NVIDIA_NIM_BASE,
      provider: "nvidia_nim",
    });
  }
  
  // HuggingFace Inference API (priority 5)
  if (HUGGINGFACE_KEY && env.HUGGINGFACE_MODEL_ID) {
    routingRules.push({
      modelId: `models/${env.HUGGINGFACE_MODEL_ID}`,
      key: HUGGINGFACE_KEY,
      baseUrl: HUGGINGFACE_BASE,
      provider: "huggingface",
    });
  }
  
  // Groq (priority 6 — fast inference)
  if (GROQ_KEY) {
    routingRules.push({
      modelId: env.GROQ_MODEL_ID || "meta-llama/llama-4-scout-17b-16e-instruct",
      key: GROQ_KEY,
      baseUrl: GROQ_BASE,
      provider: "groq",
    });
  }
  
  // OpenRouter (priority 7 — pool of models, fallback)
  if (OPENROUTER_KEY) {
    routingRules.push({
      modelId: env.OPENROUTER_MODEL_ID || "openai/gpt-4o-mini",
      key: OPENROUTER_KEY,
      baseUrl: OPENROUTER_BASE,
      provider: "openrouter",
    });
  }

  let lastErrDetail = "";
  let successfulRequest = false;
  
  for (const rule of routingRules) {
    if (!rule.key) continue;
    
    try {
      const headers: Record<string, string> = {
        "Authorization": `Bearer ${rule.key}`,
        "Content-Type": "application/json",
      };
      
      // Add OpenRouter-specific headers
      if (rule.provider === "openrouter") {
        headers["HTTP-Referer"] = "https://digitallydefined.online";
        headers["X-Title"] = "DigitallyDefined OS";
      }
      
      const res = await fetch(rule.baseUrl, {
        method: "POST",
        headers,
        body: JSON.stringify({
          model: rule.modelId,
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: message },
          ],
          max_tokens: 4000,
          temperature: 0.7,
        }),
        signal: AbortSignal.timeout(90000),
      });
      
      if (res.ok) {
        const d = await res.json();
        const choice = d?.choices?.[0]?.message;
        reply = choice?.content || "";
        if (reply) {
          model = rule.modelId;
          provider = rule.provider;
          successfulRequest = true;
          break;
        }
      } else {
        const errText = await res.text().catch(() => "");
        lastErrDetail = `${rule.provider}: HTTP ${res.status} - ${errText}`;
      }
    } catch (e: any) {
      lastErrDetail = e?.message || `Request failed for ${rule.provider}`;
    }
  }

  if (!reply) {
    reply = lastErrDetail
      ? `Hermes AI request failed: ${lastErrDetail}`
      : "Hermes could not generate a response. Check API configuration.";
    provider = "error";
  }

  return new Response(JSON.stringify({
    reply,
    provider,
    model,
    success: successfulRequest,
    error: lastErrDetail || null,
    quality: successfulRequest ? "high" : "degraded",
    conversationUpdates: [],
    dashboardSnapshotUpdate: context || null,
    timestamp: Date.now(),
  }), { status: successfulRequest ? 200 : 500, headers: { "Content-Type": "application/json" } });
});
