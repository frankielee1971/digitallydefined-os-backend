import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { schemaPrompt, validateAgentOutput } from "../_shared/agent-schemas.ts";

type JsonRecord = Record<string, unknown>;
type Candidate = { provider: string; model: string; key: string; url: string };

const corsHeaders = (origin = "") => ({
  "Access-Control-Allow-Origin": origin || "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, x-api-key, x-user-id",
  "Vary": "Origin",
});

const json = (body: unknown, status = 200, origin = "") =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders(origin) },
  });

async function insertRow(table: string, payload: JsonRecord, upsert = false) {
  const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("Supabase database credentials are not available to the Edge Function");
  }
  const response = await fetch(`${supabaseUrl}/rest/v1/${table}${upsert ? "?on_conflict=email,source" : ""}`, {
    method: "POST",
    headers: {
      "apikey": serviceRoleKey,
      "Authorization": `Bearer ${serviceRoleKey}`,
      "Content-Type": "application/json",
      "Prefer": upsert ? "resolution=merge-duplicates,return=representation" : "return=representation",
    },
    body: JSON.stringify(payload),
  });
  if (!response.ok) throw new Error(`Database write failed: ${response.status} ${await response.text()}`);
  return response.json();
}

const parseJsonReply = (reply: string) => {
  const cleaned = reply
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
  return JSON.parse(cleaned);
};

const normalizeOpenRouterModel = (model: string) =>
  model.replace(/^openrouter\//, "") || "openai/gpt-4o-mini";

const normalizeGroqModel = (model: string) =>
  model.replace(/^groq\//, "") || "llama-3.3-70b-versatile";

const getCandidates = (): Candidate[] => {
  const openRouterKey = Deno.env.get("OPENROUTER_API_KEY") || "";
  const groqKey = Deno.env.get("GROQ_API_KEY") || "";
  const preferred = Deno.env.get("AI_MODEL") || Deno.env.get("OMNIROUTE_MODEL") || "";
  const candidates: Candidate[] = [];

  if (preferred && preferred !== "free") {
    if (preferred.startsWith("groq/") && groqKey) {
      candidates.push({
        provider: "groq",
        model: normalizeGroqModel(preferred),
        key: groqKey,
        url: "https://api.groq.com/openai/v1/chat/completions",
      });
    } else if (openRouterKey) {
      candidates.push({
        provider: "openrouter",
        model: normalizeOpenRouterModel(preferred),
        key: openRouterKey,
        url: "https://openrouter.ai/api/v1/chat/completions",
      });
    }
  }

  if (groqKey && !candidates.some((item) => item.provider === "groq")) {
    candidates.push({
      provider: "groq",
      model: Deno.env.get("GROQ_MODEL_ID") || "llama-3.3-70b-versatile",
      key: groqKey,
      url: "https://api.groq.com/openai/v1/chat/completions",
    });
  }

  if (openRouterKey && !candidates.some((item) => item.provider === "openrouter")) {
    candidates.push({
      provider: "openrouter",
      model: Deno.env.get("OPENROUTER_MODEL_ID") || "openai/gpt-4o-mini",
      key: openRouterKey,
      url: "https://openrouter.ai/api/v1/chat/completions",
    });
  }

  return candidates;
};

async function runAI(systemPrompt: string, userPrompt: string, jsonMode = false) {
  const candidates = getCandidates();
  if (!candidates.length) throw new Error("No AI provider is configured in Supabase secrets");

  let lastError = "";
  for (const candidate of candidates) {
    try {
      const response = await fetch(candidate.url, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${candidate.key}`,
          "Content-Type": "application/json",
          ...(candidate.provider === "openrouter"
            ? { "HTTP-Referer": "https://digitallydefined.online", "X-Title": "DigitallyDefined" }
            : {}),
        },
        body: JSON.stringify({
          model: candidate.model,
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt },
          ],
          temperature: jsonMode ? 0.35 : 0.7,
          max_tokens: jsonMode ? 1400 : 4000,
          ...(jsonMode && candidate.provider === "openrouter"
            ? { response_format: { type: "json_object" } }
            : {}),
        }),
        signal: AbortSignal.timeout(90000),
      });

      if (!response.ok) {
        lastError = `${candidate.provider} HTTP ${response.status}: ${await response.text()}`;
        continue;
      }

      const payload = await response.json();
      const reply = payload?.choices?.[0]?.message?.content || "";
      if (!reply) {
        lastError = `${candidate.provider} returned an empty response`;
        continue;
      }

      return { reply, provider: candidate.provider, model: candidate.model };
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }
  }

  throw new Error(lastError || "All AI providers failed");
}

const agentPrompts: Record<string, { schema: string; system: string; user: (input: JsonRecord) => string }> = {
  quiz: {
    schema: "quiz",
    system: `You are the Digital Superpower Quiz planner for DigitallyDefined.
Classify the answers as Builder, Creator, Educator, Strategist, or Connector.
Be direct, useful, privacy-first, and free of hype.
Return only JSON:
{"superpowerName":"Builder","superpowerDescription":"...","recommendedPathways":["...","...","..."],"confidenceScore":0.85}`,
    user: (input) => `Quiz answers: ${JSON.stringify(input.answers || input)}`,
  },
  niche: {
    schema: "niche",
    system: `You are an AI-assisted niche discovery planner for DigitallyDefined.
Evaluate a niche for faceless digital real estate. Do not invent search-volume statistics.
Be explicit when recommendations require validation.
Return only JSON:
{"niche":"...","keywords":["..."],"demand":"High|Medium|Low","competition":"High|Medium|Low","recommendation":"..."}`,
    user: (input) => `Analyze this topic or niche: ${String(input.query || input.niche || "")}`,
  },
  roadmap: {
    schema: "roadmap",
    system: `You create practical DigitallyDefined build roadmaps for Gen X women.
Use a calm, direct tone. Avoid income promises. Give concrete, sequential actions.
Return only JSON:
{"steps":["...","...","...","..."],"estimatedTime":"...","tools":["...","..."],"nextAction":"..."}`,
    user: (input) => `Create a personalized roadmap from this profile:
${JSON.stringify({
  name: input.name || "Builder",
  superpower: input.superpower || "Builder",
  answers: input.answers || {},
  profile: input.profile || {},
  goal: input.goal || "",
})}`,
  },
  reputation: {
    schema: "reputation",
    system: `You evaluate demand and trust signals for a proposed digital niche.
Do not claim live market research unless evidence is supplied in the input.
Return only JSON:
{"niche":"...","demandScore":7,"competitionScore":5,"reputationSignals":["..."],"recommendation":"..."}`,
    user: (input) => `Evaluate this niche and supplied evidence: ${JSON.stringify(input)}`,
  },
  scorecard: {
    schema: "scorecard",
    system: `You interpret a deterministic niche scorecard for DigitallyDefined.
Never change the supplied score or tier. Explain what the inputs mean for a faceless digital asset.
Do not invent market data. Recommend small validation experiments before a full build.`,
    user: (input) => `Interpret this scorecard result: ${JSON.stringify(input)}`,
  },
  "retirement-guide": {
    schema: "retirement-guide",
    system: `You explain retirement calculator results for educational planning.
Do not provide individualized financial advice or guarantees. Identify assumptions and questions the user may want to review with a qualified professional.
Explain how digital assets could supplement a plan without presenting projections as certain.`,
    user: (input) => `Explain these calculator inputs and results: ${JSON.stringify(input)}`,
  },
  "asset-plan": {
    schema: "asset-plan",
    system: `You interpret a proposed faceless digital asset portfolio.
Treat all yields and valuations as user-supplied scenarios, not verified forecasts.
Identify assumptions, concentration risk, a sensible build order, and one next validation step.`,
    user: (input) => `Interpret this proposed portfolio: ${JSON.stringify(input)}`,
  },
  "offer-architect": {
    schema: "offer-architect",
    system: `You are the internal DigitallyDefined Offer Architect.
Build a structured offer for one funnel stage: lead_magnet, core_offer, authority_bundle, community, or recurring_revenue.
The nested offer must follow the supplied stage requirements. Avoid hype and unsupported income claims.`,
    user: (input) => `Create a schema-driven offer from this brief: ${JSON.stringify(input)}`,
  },
};

async function runStructuredAgent(agentName: string, inputData: JsonRecord) {
  const config = agentPrompts[agentName];
  if (!config) throw new Error(`Unknown agent: ${agentName}`);
  const result = await runAI(
    `${config.system}\nReturn only JSON matching this schema:\n${schemaPrompt(config.schema)}`,
    config.user(inputData),
    true,
  );
  const data = parseJsonReply(result.reply);
  const validation = validateAgentOutput(config.schema, data);
  if (!validation.valid) throw new Error(`Invalid ${config.schema} output: ${validation.errors.join("; ")}`);
  return { data, provider: result.provider, model: result.model, schema: config.schema };
}

function calculateWealth(input: JsonRecord) {
  const currentAge = Number(input.currentAge || 52);
  const retireAge = Number(input.retireAge || 67);
  const currentSavings = Number(input.currentSavings || 120000);
  const monthlyContribution = Number(input.monthlyContribution || 600);
  const annualReturn = Number(input.annualReturn || 6) / 100;
  const desiredIncome = Number(input.desiredIncome || 55000);
  const socialSecurity = Number(input.socialSecurity || 24000);
  const yearsToRetire = Math.max(0, retireAge - currentAge);
  const targetNestEgg = Math.max(0, desiredIncome - socialSecurity) / 0.04;
  const futureSavings = currentSavings * Math.pow(1 + annualReturn, yearsToRetire);
  const monthlyRate = annualReturn / 12;
  const periods = yearsToRetire * 12;
  const factor = monthlyRate === 0
    ? periods
    : (Math.pow(1 + monthlyRate, periods) - 1) / monthlyRate;
  const totalAtRetirement = futureSavings + monthlyContribution * factor;
  const gap = Math.max(0, targetNestEgg - totalAtRetirement);
  return {
    targetNestEgg,
    totalAtRetirement,
    gap,
    monthlyNeeded: factor > 0 ? gap / factor : 0,
    isOnTrack: gap === 0,
  };
}

const dashboardData = {
  revenue: "$12,450",
  leads: 156,
  conversionRate: 0.248,
  assetValue: 48000,
  topAsset: "Email List",
  communityGrowth: "+12%",
  emailGrowth: "+8%",
  churnRisk: "Low",
  reviews: [],
  campaigns: [],
  competitors: [],
  email: {},
  alerts: [{ type: "info", source: "System", message: "Supabase backend is responding" }],
  sourceHealth: { supabase: "Active" },
  automations: [
    { name: "Review Response Auto-Reply", status: "active", lastRun: "2 hours ago" },
    { name: "Social Media Cross-Post", status: "active", lastRun: "5 hours ago" },
    { name: "Email Lead Nurturing", status: "paused", lastRun: "1 day ago" },
  ],
  aiBrief: { working: [], slipping: [], nextActions: [] },
  community: [],
};

serve(async (req) => {
  const origin = req.headers.get("origin") || "";
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(origin) });
  if (req.method !== "POST") return json({ error: "Method not allowed - use POST" }, 405, origin);

  let body: JsonRecord;
  try {
    const text = await req.text();
    body = text ? JSON.parse(text) : {};
  } catch {
    return json({ error: "Invalid JSON body" }, 400, origin);
  }

  const action = String(body.action || "").trim();
  const publicAgentAction = action.startsWith("agent.");
  const publicFormAction = ["subscribe", "contact", "quiz.complete", "public.chat"].includes(action);
  const expectedKey = (Deno.env.get("DASHBOARD_API_KEY") || "").trim();
  const providedKey = (req.headers.get("x-api-key") || req.headers.get("authorization") || "").trim();

  if (!publicAgentAction && !publicFormAction && (!expectedKey || providedKey !== expectedKey)) {
    return json({ error: "Unauthorized - Invalid or missing API key" }, 401, origin);
  }

  if (action === "subscribe") {
    const email = String(body.email || "").trim().toLowerCase();
    if (!email) return json({ error: "Email is required" }, 400, origin);
    try {
      await insertRow("website_leads", {
        email,
        name: String(body.name || "").trim() || null,
        source: String(body.source || "website"),
        tags: Array.isArray(body.tags) ? body.tags : [],
        metadata: {},
      }, true);
      return json({ success: true, message: "You're on the list!" }, 200, origin);
    } catch (error) {
      return json({ error: error instanceof Error ? error.message : String(error) }, 500, origin);
    }
  }

  if (action === "contact") {
    const name = String(body.name || "").trim();
    const email = String(body.email || "").trim().toLowerCase();
    const message = String(body.message || "").trim();
    if (!name || !email || !message) return json({ error: "Name, email, and message are required" }, 400, origin);
    try {
      await insertRow("contact_messages", { name, email, message, source: String(body.source || "contact-page") });
      return json({ success: true, message: "Message sent" }, 200, origin);
    } catch (error) {
      return json({ error: error instanceof Error ? error.message : String(error) }, 500, origin);
    }
  }

  if (action === "quiz.complete") {
    const name = String(body.name || "").trim();
    const email = String(body.email || "").trim().toLowerCase();
    const superpower = String(body.superpower || "").trim().toLowerCase();
    if (!name || !email || !superpower) return json({ error: "Name, email, and superpower are required" }, 400, origin);
    try {
      await insertRow("website_leads", {
        email,
        name,
        source: "digital-superpower-quiz",
        tags: ["quiz-complete", `superpower-${superpower}`, "roadmap-requested"],
        metadata: { superpower },
      }, true);
      const saved = await insertRow("quiz_roadmaps", {
        email,
        name,
        superpower,
        answers: body.answers || {},
        roadmap: body.roadmap || {},
        source: String(body.source || "digital-superpower-quiz"),
      });
      return json({ success: true, id: saved?.[0]?.id || null, superpower }, 200, origin);
    } catch (error) {
      return json({ error: error instanceof Error ? error.message : String(error) }, 500, origin);
    }
  }

  if (action === "public.chat") {
    const message = String(body.message || "").trim().slice(0, 1200);
    if (!message) return json({ error: "A message is required" }, 400, origin);
    try {
      const result = await runAI(
        `You are the public DigitallyDefined planning guide for Gen X women.
Explain faceless digital real estate, retirement planning concepts, niche validation, and the website tools in plain language.
Do not promise income, present projections as guarantees, or provide individualized financial advice.
Keep responses concise and end with one relevant next step inside the DigitallyDefined tools.`,
        message,
      );
      return json({ success: true, reply: result.reply, provider: result.provider, model: result.model }, 200, origin);
    } catch (error) {
      return json({ error: error instanceof Error ? error.message : String(error) }, 502, origin);
    }
  }

  if (publicAgentAction) {
    const aliases: Record<string, string> = {
      quiz: "quiz",
      "digital-superpower-quiz": "quiz",
      niche: "niche",
      "niche-keyword-discovery": "niche",
      roadmap: "roadmap",
      "roadmap-generator": "roadmap",
      reputation: "reputation",
      "reputation-intelligence": "reputation",
      scorecard: "scorecard",
      "scorecard-interpreter": "scorecard",
      "retirement-guide": "retirement-guide",
      "asset-plan": "asset-plan",
      "offer-architect": "offer-architect",
      "json-schema-generator": "offer-architect",
      wealth: "wealth",
      "digital-wealth-calculator": "wealth",
    };
    const requested = action.slice("agent.".length);
    const agentName = aliases[requested];
    if (!agentName) {
      return json({ error: `Unknown agent action: ${action}`, availableAgents: Object.keys(aliases) }, 404, origin);
    }

    const inputData = (body.inputData && typeof body.inputData === "object"
      ? body.inputData
      : body.data && typeof body.data === "object"
        ? body.data
        : {}) as JsonRecord;

    try {
      if (agentName === "wealth") {
        return json({ success: true, data: calculateWealth(inputData), provider: "local", model: null }, 200, origin);
      }
      const result = await runStructuredAgent(agentName, inputData);
      return json({ success: true, ...result }, 200, origin);
    } catch (error) {
      return json({
        success: false,
        error: error instanceof Error ? error.message : String(error),
        agent: agentName,
      }, 502, origin);
    }
  }

  // =============================================
  // INTELLIGENCE ACTION HANDLER
  // =============================================
  if (action === "intelligence") {
    const userId = String(body.userId || "").trim();
    const answers = body.answers || {};

    // Validate required fields
    if (!userId || Object.keys(answers).length === 0) {
      return json({
        success: false,
        error: "userId and answers are required"
      }, 400, origin);
    }

    try {
      // Step 1: Determine superpower from quiz answers
      const quizResult = await runStructuredAgent("quiz", { answers });

      if (!quizResult || !quizResult.data) {
        throw new Error("Quiz analysis failed to return data");
      }

      // Step 2: Generate personalized roadmap based on superpower
      const roadmapResult = await runStructuredAgent("roadmap", {
        name: userId.split('@')[0] || "Builder",
        superpower: quizResult.data.superpowerName?.toLowerCase() || "builder",
        answers,
        profile: {},
        goal: "Build faceless digital real estate that supports retirement and creates a transferable family asset"
      });

      // Step 3: Return structured intelligence response
      return json({
        success: true,
        data: {
          superpower: quizResult.data.superpowerName,
          superpowerDescription: quizResult.data.superpowerDescription || "",
          recommendations: quizResult.data.recommendedPathways || [],
          confidenceScore: quizResult.data.confidenceScore || 0.85,
          roadmap: roadmapResult.success ? roadmapResult.data : null,
          rawQuizResult: quizResult.data
        }
      }, 200, origin);

    } catch (error) {
      console.error("[intelligence] Error:", error);
      return json({
        success: false,
        error: error instanceof Error ? error.message : String(error)
      }, 500, origin);
    }
  }

  if (action === "dashboard") return json(dashboardData, 200, origin);
  if (action === "automation.list") return json({ automations: dashboardData.automations }, 200, origin);
  if (action === "status" || action === "routes") {
    return json({
      ok: true,
      status: "running",
      timestamp: Date.now(),
      routes: ["subscribe", "contact", "quiz.complete", "public.chat", "dashboard", "automation.list", "agent.quiz", "agent.niche", "agent.roadmap", "agent.scorecard", "agent.retirement-guide", "agent.asset-plan", "agent.offer-architect", "agent.wealth", "agent.reputation", "intelligence", "chat"],
    }, 200, origin);
  }

  const conversation = Array.isArray(body.conversation)
    ? body.conversation
    : Array.isArray(body.messages)
      ? body.messages
      : [];
  const message = String(body.message || body.content || body.text || "").trim();
  if (!message) return json({ error: "Missing or invalid message field" }, 400, origin);

  try {
    const result = await runAI(
      String(body.systemPrompt || "You are the private DigitallyDefined operations assistant. Be concise, practical, and accurate."),
      `${conversation.length ? `Conversation: ${JSON.stringify(conversation)}\n\n` : ""}${message}`,
    );
    return json({
      reply: result.reply,
      provider: result.provider,
      model: result.model,
      error: null,
      conversationUpdates: [],
      dashboardSnapshotUpdate: body.context || null,
    }, 200, origin);
  } catch (error) {
    return json({
      reply: "",
      provider: "error",
      model: null,
      error: error instanceof Error ? error.message : String(error),
    }, 502, origin);
  }
});
