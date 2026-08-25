import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { schemaPrompt, validateAgentOutput } from "../_shared/agent-schemas.ts";
import { isPublicAction, isKnownAction, GET_ONLY_ACTIONS } from "../_shared/action-registry.ts";

type JsonRecord = Record<string, unknown>;
type Candidate = { provider: string; model: string; key: string; url: string };

const ALLOWED_ORIGINS = new Set([
  "https://dashboard.digitallydefined.online",
  "https://digitallydefined.online",
  "https://www.digitallydefined.online",
  "http://localhost:3000",
  "http://localhost:3001",
  "http://localhost:5173",
]);

// Echo an allowed origin back; never fall back to a wildcard for credentialed calls.
const corsHeaders = (origin = "") => ({
  "Access-Control-Allow-Origin":
    origin && ALLOWED_ORIGINS.has(origin)
      ? origin
      : "https://dashboard.digitallydefined.online",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, x-api-key, x-user-id, apikey",
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
    .replace(/^```(?:json)?\s*/gm, "")
    .replace(/```\s*$/gm, "")
    .replace(/^```/g, "")
    .replace(/```$/g, "")
    .trim();
  return JSON.parse(cleaned);
};

// ============================================================
// AI PROVIDER: OmniRoute ONLY (single-gateway consolidation)
// All AI traffic routes through OmniRoute, which fans out to
// upstream providers on its side. No direct provider calls.
//
// Required Supabase secrets:
//   OMNIROUTE_API_KEY  (required)
//   OMNIROUTE_BASE_URL (optional, default https://api.omniroute.ai/v1)
//   OMNIROUTE_MODEL    (optional, default "auto")
// ============================================================
const getCandidates = (): Candidate[] => {
  const omnirouteKey = Deno.env.get("OMNIROUTE_API_KEY") || "";
  if (!omnirouteKey) {
    console.error("[hermes] OMNIROUTE_API_KEY is not set. AI actions will fail.");
    return [];
  }
  // Normalize: accept base URL with or without a trailing "/v1".
  const rawBase = (Deno.env.get("OMNIROUTE_BASE_URL") || "https://api.omniroute.ai/v1").trim();
  const baseUrl = rawBase.replace(/\/+$/, "").replace(/\/v1$/, "") + "/v1";
  return [
    {
      provider: "omniroute",
      model: Deno.env.get("OMNIROUTE_MODEL") || "auto",
      key: omnirouteKey,
      url: `${baseUrl}/chat/completions`,
    },
  ];
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
        },
        body: JSON.stringify({
          model: candidate.model,
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt },
          ],
          temperature: jsonMode ? 0.35 : 0.7,
          max_tokens: jsonMode ? 1400 : 4000,
          ...(jsonMode ? { response_format: { type: "json_object" } } : {}),
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
  // Access rules come from _shared/action-registry.ts (single source of truth).
  if (action && !isKnownAction(action)) {
    return json({ error: `Unknown action: ${action}` }, 400, origin);
  }
  const expectedKey = (Deno.env.get("DASHBOARD_API_KEY") || "").trim();
  const providedKey = (req.headers.get("x-api-key") || req.headers.get("authorization") || "").trim();

  if (!isPublicAction(action) && (!expectedKey || providedKey !== expectedKey)) {
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

    // Import Brevo email service
    const { detectEmailMode, sendQuizEmail, getBrevoConfig } = await import("../_shared/brevo-email.ts");

    try {
      // Store quiz result in Supabase
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

      // Route email sending based on mode
      const brevoConfig = getBrevoConfig();
      const mode = detectEmailMode(body, brevoConfig);
      const emailResult = await sendQuizEmail(
        {
          toEmail: email,
          toName: name,
          superpower,
          roadmap: body.roadmap as Record<string, unknown> | undefined,
          answers: body.answers as Record<string, string> | undefined,
        },
        mode,
        brevoConfig
      );

      console.log(`[quiz.complete] email_mode=${mode} sent=${emailResult.emailSent} skipped=${emailResult.emailSkipped}`);

      return json({
        success: true,
        id: saved?.[0]?.id || null,
        superpower,
        emailMode: mode,
        emailSent: emailResult.emailSent,
        emailSkipped: emailResult.emailSkipped,
        brevoUsed: emailResult.brevoUsed,
      }, 200, origin);
    } catch (error) {
      console.error("[quiz.complete] Error:", error);
      return json({ error: error instanceof Error ? error.message : String(error) }, 500, origin);
    }
  }

  if (action === "public.chat") {
    const message = String(body.message || "").trim().slice(0, 1200);
    const topic = String(body.topic || "default").trim();
    if (!message) return json({ error: "A message is required" }, 400, origin);
    try {
      const result = await runAI(
        `You are Hermes, the DigitallyDefined planning mentor for Gen X women who want to close their retirement gap by building faceless digital real estate.

WHAT DIGITALLYDEFINED HELPS WITH:
- Turning lived experience into digital property that earns without requiring your face or constant posting.
- The core path: (1) know your retirement number → (2) choose one asset type → (3) validate the niche → (4) build the first small asset → (5) document & automate it.
- Why "faceless" matters: privacy, control, and asset ownership over personal visibility.

KNOWLEDGE OF THE TOOLS (use them as concrete next steps):
- /gap — Retirement Gap Calculator: turn a vague fear into a planning number (current age, savings, monthly contribution, desired income).
- /quiz — Digital Superpower Quiz: discover your Builder/Creator/Educator/Strategist/Connector profile.
- /scorecard — Niche Profitability Scorecard: test demand, competition, monetization, and privacy fit of an idea.
- /freedom — Freedom Number Calculator: model a portfolio of assets to hit a monthly income target.
- /roi — 10X ROI Calculator: model lead flow/revenue for a rank-and-rent property.
- /tools — all free planning tools; /start-here — the step-by-step path.

COMMON ASSET TYPES: template hubs & printables, paid newsletters, YouTube automation, rank & rent sites, digital products.

HOW TO ANSWER:
- Be warm, direct, practical, and privacy-first. No hype, no invented urgency, no income promises, and never give individualized financial advice or present projections as guarantees.
- Always frame answers around the "faceless digital real estate for retirement" path.
- Keep responses concise (a few sentences) and ALWAYS end with one concrete next step inside the DigitallyDefined tools (reference the route path).`,
        `${topic !== "default" ? `Current page context: ${topic}.\n` : ""}${message}`,
      );
      return json({ success: true, reply: result.reply, provider: result.provider, model: result.model }, 200, origin);
    } catch (error) {
      return json({ error: error instanceof Error ? error.message : String(error) }, 502, origin);
    }
  }

  // =============================================
  // DEVELOPER MODE — dedicated protected endpoint
  // Used by the MentorWidget when dev-mode requests are detected.
  // Returns structured guidance (filePath, codeSnippet, exactChange).
  // Requires the DASHBOARD_API_KEY secret to match the x-api-key header.
  // =============================================
  if (action === "mentor.dev") {
    const message = String(body.message || "").trim().slice(0, 2000);
    const topic = String(body.topic || "default").trim();
    const currentUrl = String(body.currentUrl || "").trim();
    if (!message) return json({ error: "A message is required" }, 400, origin);
    try {
      const system = `You are Hermes running in DEVELOPER MODE for the DigitallyDefined website — a Vite + React 18 + React Router + Supabase project using a custom "soft brutalism" design system (sharp 1-2px solid #111 borders, no border-radius, no shadows, Inter headings, DM Sans body).

ABSOLUTE RULES:
- NEVER give generic HTML/CSS advice. Every website-related request MUST reference one or more REAL files from the map below and return filePath + exactChange.
- If the request involves layout/navigation/styling, the answer is almost always in BrandNav.jsx, a page in src/pages, and/or global.css.
- codeSnippet: show the current/most relevant code shape in the real file (describe with realistic placeholders if the exact lines aren't shown), or the minimal corrected snippet.
- exactChange: precise instructions — which file, which block, what to add/remove/edit.
- This is GUIDANCE ONLY — Cline applies the actual edit. Never claim you edited the code.

PROJECT FILE MAP (use these exact paths):
- src/styles/global.css — design tokens in :root (--color-accent:#F18B25, --color-blue:#47B7D4, --color-border:#111111, --space-xs:8px .. --space-2xl:80px, --font-heading), and all shared classes (.btn, .btn--primary, .btn--outline, .nav-cta, .brand-nav, .brand-nav__inner, .container, .container--narrow, .chat-* .mentor-*). Header/nav CSS lives under .brand-nav.
- src/components/BrandNav.jsx — the sticky site header. It renders a .brand-nav__inner grid (logo, .desktop-nav links, optional external .nav-cta links from the externalLinks array, and a mobile menu button). To add a CTA button next to the header nav, edit this file.
- src/components/Layout/SiteLayout.jsx — layout shell: renders <BrandNav />, <BrandFooter />, and <MentorWidget topic={mentorTopic} />.
- src/components/BrandFooter.jsx — site footer with a Join the Community button.
- src/components/MentorWidget.jsx — Hermes chat widget (floating button bottom-right + chat panel).
- src/hooks/useMentor.js — mentor state hook; topic prompts + dev-mode keyword detection.
- src/lib/hermes.js — edge-function request helper (public.chat / mentor.dev actions).
- src/App.jsx — React Router routes. "/" = Home page, "/gap" = RetirementGapCalculator, "/tools" = Tools, "/scorecard", "/quiz", "/freedom", "/roi", "/about", "/contact", "/pricing", "/products", "/start-here", "/automation".
- src/pages/Home.jsx — homepage (hero, manifesto card, asset cards, final CTA section with a "Calculate My Retirement Gap →" button linking to "/gap").
- src/pages/StartHere.jsx, Tools.jsx, About.jsx, Contact.jsx, Pricing.jsx, Products.jsx, Automation.jsx, ComingSoon.jsx — other landing pages.
- src/pages/Calculator/RetirementGapCalculator.jsx, FreedomNumberCalculator.jsx, TenXROICalculator.jsx — calculator pages.
- src/pages/Quiz/DigitalSuperpowerQuiz.jsx, src/pages/Scorecard/NicheProfitabilityScorecard.jsx — interactive tools.

PROJECT CONVENTIONS:
- Buttons/CTAs: <a href="..." className="btn btn--primary">Label →</a> or <button className="btn btn--primary">.
- Header CTA: render <a href="/gap" className="nav-cta btn">Calculate My Gap →</a> as an <a> in BrandNav (optionally inside the externalLinks array) and style it under .nav-cta in global.css.
- Sections use max-width match (.container or the wide sections defined in global.css), bordered with 1px solid #111.
- No rounded corners, no box-shadows anywhere.

Update the user's topic context: topic just describes the current page. currentUrl is the live page the user is on. When page routing is involved (e.g. "CTA button to the retirement gap calculator from the header"), point to the route path /gap and the target file.

Return ONLY valid JSON with these keys (include only relevant ones):
{"reply":"...", "filePath":"src/...", "codeSnippet":"...", "exactChange":"..."}`;
      const user = `Topic context: ${topic}\nCurrent page URL: ${currentUrl || "unknown"}\nUser request: ${message}\n\nReturn only the JSON object described in your instructions.`;
      const result = await runAI(system, user, true);

      let data: JsonRecord = {};
      try {
        data = parseJsonReply(result.reply);
      } catch {
        data = { reply: result.reply };
      }

      return json({
        success: true,
        reply: String(data.reply || "Here is the guidance."),
        ...(data.filePath ? { filePath: String(data.filePath) } : {}),
        ...(data.codeSnippet ? { codeSnippet: String(data.codeSnippet) } : {}),
        ...(data.exactChange ? { exactChange: String(data.exactChange) } : {}),
        provider: result.provider,
        model: result.model,
        isDevGuidance: true,
      }, 200, origin);
    } catch (error) {
      return json({ error: error instanceof Error ? error.message : String(error) }, 502, origin);
    }
  }

  if (action.startsWith("agent.")) {
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
          roadmap: (roadmapResult as { success?: boolean; data?: unknown }).success
            ? roadmapResult.data
            : null,
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

  // =============================================
  // INTEGRATION DATA HANDLERS (migrated from dashboard /api/integrations/*)
  // Same response shapes as the retired Vercel proxies.
  // =============================================
  if (action.startsWith("integration.")) {
    const b = body || {};
    if (action === "integration.googleAnalytics") {
      if (!b.measurementId || !b.propertyId) {
        return json({ error: "Missing measurementId or propertyId" }, 400, origin);
      }
      // TODO: call Google Analytics Data API v1 here.
      return json({
        users30d: 1240,
        sessions30d: 1860,
        bounceRate: 0.42,
        topPages: [
          { path: "/", views: 640 },
          { path: "/digital-business-os", views: 310 },
          { path: "/blog/gen-x-women-reinvention", views: 210 },
        ],
        goalConversions: 88,
        revenue30d: 4200,
      }, 200, origin);
    }
    if (action === "integration.social") {
      const entries = Object.entries(b.platforms || {});
      if (!entries.length) {
        return json({ connected: false, platforms: {}, followers: null, engagementRate: null, impressions30d: null, topPosts: [] }, 200, origin);
      }
      // TODO: call each provider's API with credentials.
      return json({
        connected: true,
        platforms: Object.fromEntries(entries.map(([name]) => [name, { connected: true }])),
        followers: 4820,
        engagementRate: 0.038,
        impressions30d: 28400,
        topPosts: [
          { platform: "facebook", title: "Reinventing Your Digital Career", impressions: 4200 },
          { platform: "instagram", title: "Morning Brand Check-In", impressions: 3100 },
          { platform: "youtube", title: "How I Built an Automated Funnel", impressions: 2600 },
        ],
      }, 200, origin);
    }
    if (action === "integration.email") {
      if (!b.provider || (!b.hasBrevo && !b.hasMailchimp)) {
        return json({ error: "No email provider available" }, 400, origin);
      }
      // TODO: call Brevo or Mailchimp API with stored credentials.
      return json({
        subscribers: 3120,
        openRate: 0.282,
        clickRate: 0.114,
        campaigns: [
          { name: "Authority Launch Sequence", openRate: 0.312, clickRate: 0.128 },
          { name: "Evergreen Reputation Funnel", openRate: 0.264, clickRate: 0.104 },
          { name: "Reinvention Reactivation", openRate: 0.298, clickRate: 0.118 },
        ],
        revenuePerCampaign: 1280,
      }, 200, origin);
    }
    if (action === "integration.community") {
      if (!b.platform || (!b.hasFacebook && !b.hasDiscord && !b.hasMightyNetworks)) {
        return json({ error: "No community platform available" }, 400, origin);
      }
      // TODO: call the selected provider's API with stored credentials.
      return json({
        members: 1284,
        activeToday: 96,
        growth30d: 0.082,
        topMembers: [
          { name: "Rena Walker", joinedAt: "2026-03-28", status: "Active" },
          { name: "Angela Brooks", joinedAt: "2026-03-31", status: "Onboarding" },
          { name: "Tasha Monroe", joinedAt: "2026-04-02", status: "Subscribed" },
          { name: "Nicole James", joinedAt: "2026-04-04", status: "Engaged" },
        ],
      }, 200, origin);
    }
    return json({ error: `Unknown integration action: ${action}` }, 400, origin);
  }

  if (action === "dashboard") return json(dashboardData, 200, origin);
  if (action === "automation.list") return json({ automations: dashboardData.automations }, 200, origin);
  if (action === "status" || action === "routes") {
    const routes: string[] = [
      "subscribe",
      "contact",
      "quiz.complete",
      "public.chat",
      "dashboard",
      "automation.list",
      "agent.quiz",
      "agent.niche",
      "agent.roadmap",
      "agent.scorecard",
      "agent.retirement-guide",
      "agent.asset-plan",
      "agent.offer-architect",
      "agent.wealth",
      "agent.reputation",
      "intelligence",
      "chat",
      "mentor.dev",
    ];
    return json({
      ok: true,
      status: "running",
      timestamp: Date.now(),
      routes,
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
