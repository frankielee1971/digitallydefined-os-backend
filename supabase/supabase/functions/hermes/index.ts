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

  // === Call AI directly (OmniRoute disabled per user request) ===
  // Uses OpenRouter/Groq as primary, no OmniRoute proxy
  const OPENROUTER_KEY = env.OPENROUTER_API_KEY || "";
  const GROQ_KEY = env.GROQ_API_KEY || "";
  const PRIMARY_MODEL = env.OMNIROUTE_MODEL || "openrouter/openai/gpt-4o-mini";
  const FALLBACK_1 = env.OMNIROUTE_FALLBACK_MODEL_1 || "";
  const FALLBACK_2 = env.OMNIROUTE_FALLBACK_MODEL_2 || "";

  let reply = "";
  let provider = "";
  let model = null;

  // Build list of model+key pairs to try in order
  const candidates: Array<{modelId: string; key: string; baseUrl: string}> = [];
  
  if (PRIMARY_MODEL && PRIMARY_MODEL !== "free") {
    candidates.push({
      modelId: PRIMARY_MODEL,
      key: OPENROUTER_KEY || GROQ_KEY,
      baseUrl: OPENROUTER_KEY ? "https://openrouter.ai/api/v1/chat/completions" : "",
    });
  }
  if (FALLBACK_1 && OPENROUTER_KEY) {
    candidates.push({ modelId: FALLBACK_1, key: OPENROUTER_KEY, baseUrl: "https://openrouter.ai/api/v1/chat/completions" });
  }
  if (FALLBACK_2 && OPENROUTER_KEY) {
    candidates.push({ modelId: FALLBACK_2, key: OPENROUTER_KEY, baseUrl: "https://openrouter.ai/api/v1/chat/completions" });
  }
  // Always add free-tier fallbacks
  if (OPENROUTER_KEY) {
    candidates.push({ modelId: "openrouter/openai/gpt-4o-mini", key: OPENROUTER_KEY, baseUrl: "https://openrouter.ai/api/v1/chat/completions" });
  }
  if (GROQ_KEY) {
    candidates.push({ modelId: "groq/llama-3.3-70b-versatile", key: GROQ_KEY, baseUrl: "https://api.groq.com/openai/v1/chat/completions" });
  }

  let lastErrDetail = "";
  for (const c of candidates) {
    try {
      const res = await fetch(c.baseUrl, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${c.key}`,
          "Content-Type": "application/json",
          ...(c.modelId.includes("openrouter") ? { "HTTP-Referer": "https://digitallydefined.online" } : {}),
        },
        body: JSON.stringify({
          model: c.modelId,
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: message },
          ],
          max_tokens: 4000,
        }),
        signal: AbortSignal.timeout(90000),
      });
      if (res.ok) {
        const d = await res.json();
        const choice = d?.choices?.[0]?.message;
        reply = choice?.content || "";
        if (reply) {
          model = c.modelId;
          provider = c.modelId.includes("groq") ? "groq" : "openrouter";
          break;
        }
      } else {
        lastErrDetail = `HTTP ${res.status}: ${(await res.text()).catch(() => "")}`;
      }
    } catch (e: any) {
      lastErrDetail = e?.message || "Request failed";
    }
  }

  if (!reply) {
    reply = lastErrDetail
      ? `Hermes AI request failed: ${lastErrDetail}`
      : "Hermes could not generate a response. Check API configuration.";
    provider = "error";
  }

  return new Response(JSON.stringify({
    reply, provider, model, error: lastErrDetail || null,
    conversationUpdates: [], dashboardSnapshotUpdate: context || null,
  }), { status: 200, headers: { "Content-Type": "application/json" } });
});
