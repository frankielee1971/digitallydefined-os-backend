// lib/hermesOptimizationLoop.js
// Hermes Optimization Loop — collects signals, clusters users, finds high-demand
// patterns, (optionally) generates assets via MCP servers, personalizes the site,
// optimizes conversion, and produces weekly "Build Next" reports.
// Deterministic + dependency-free; optional MCP hooks are env-gated and safe.

const SIGNAL_FIELDS = [
  "profitabilityScore", "competitionLevel", "trendStrength", "nicheViability",
  "audienceInsight", "opportunityGaps", "privacyNeeds", "energyLevel",
  "burnoutRisk", "aiTools", "superpower", "roadmap", "niche",
];

// ---------------------------------------------------------------------------
// 1. Collect signals
// ---------------------------------------------------------------------------
export function collectSignals(input = {}) {
  const src = input.signals || input.intelligence || input;
  const signal = {};
  for (const k of SIGNAL_FIELDS) {
    signal[k] = src[k] !== undefined ? src[k] : (input[k] !== undefined ? input[k] : null);
  }
  // Frontend behavioral signals (page interactions, drop-offs, conversions)
  signal.events = Array.isArray(input.events) ? input.events : [];
  signal.dropOffPoints = Array.isArray(input.dropOffPoints) ? input.dropOffPoints : [];
  signal.conversionPaths = Array.isArray(input.conversionPaths) ? input.conversionPaths : [];
  signal.assetPreference = input.assetPreference || null;
  signal.automationPreference = input.automationPreference || null;
  signal.superpowerName = src.superpowerName || src.superpower || null;
  signal.collectedAt = new Date().toISOString();
  return signal;
}

// ---------------------------------------------------------------------------
// 2. Cluster users into behavioral profiles
// ---------------------------------------------------------------------------
export function clusterUsers(profiles = []) {
  const clusters = new Map();
  for (const p of profiles) {
    const s = collectSignals(p);
    const sp = (s.superpowerName || s.superpower || "builder").toLowerCase();
    const nicheCat = String(s.niche || s.audienceInsight?.niche || "general").toLowerCase().trim();
    const profit = Number(s.profitabilityScore) || 0;
    const trend = String(s.trendStrength || "unknown").toLowerCase();
    const comp = String(s.competitionLevel || "unknown").toLowerCase();
    const privacy = s.privacyNeeds?.camera === true ? "camera-ok" : "faceless";
    const energy = String(s.energyLevel || "medium").toLowerCase();
    const burnout = String(s.burnoutRisk || "low").toLowerCase();
    const asset = String(s.assetPreference || "rank-and-rent").toLowerCase();
    const auto = String(s.automationPreference || "high").toLowerCase();

    const key = `${sp}|${nicheCat}|${profit >= 70 ? "hot" : profit >= 40 ? "warm" : "cold"}|${trend}|${comp}|${privacy}|${energy}|${burnout}|${asset}|${auto}`;

    if (!clusters.has(key)) {
      clusters.set(key, {
        key, users: [], n: 0, superpower: sp, nicheCategory: nicheCat, profitability: profit,
        trend, competition: comp, privacy, energy, burnout, assetPreference: asset, automationPreference: auto,
      });
    }
    clusters.get(key).users.push(s);
    clusters.get(key).n += 1;
  }
  const out = [];
  for (const c of clusters.values()) out.push(c);
  out.sort((a, b) => b.n - a.n);
  return out;
}
// ---------------------------------------------------------------------------
// 3. Identify high-demand patterns
// ---------------------------------------------------------------------------
export function identifyHighDemand(signals = [], clusters = []) {
  const tally = (key) => {
    const m = new Map();
    for (const s of signals) { const v = s[key]; if (v == null) continue; m.set(v, (m.get(v) || 0) + 1); }
    return [...m.entries()].sort((a, b) => b[1] - a[1]).map(([value, count]) => ({ value, count }));
  };
  const dropOff = new Map();
  for (const s of signals) {
    const steps = s.roadmap?.steps || [];
    for (let i = 0; i < steps.length; i++) dropOff.set(steps[i], (dropOff.get(steps[i]) || 0) + 1);
  }
  const tools = new Map();
  for (const s of signals) for (const t of (s.aiTools || [])) tools.set(t, (tools.get(t) || 0) + 1);
  const pages = new Map();
  for (const s of signals) for (const p of (s.dropOffPoints || [])) pages.set(p, (pages.get(p) || 0) + 1);

  return {
    trendingNiches: tally("niche").slice(0, 10),
    dominantSuperpowers: tally("superpowerName").slice(0, 10),
    mostRequestedAssets: tally("assetPreference").slice(0, 10),
    roadmapStepDropOff: [...dropOff.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10).map(([step, count]) => ({ step, count })),
    preferredTools: [...tools.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10).map(([value, count]) => ({ value, count })),
    automationsUsed: tally("automationPreference").slice(0, 10),
    highestAbandonmentPages: [...pages.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10).map(([page, count]) => ({ page, count })),
  };
}

// ---------------------------------------------------------------------------
// 4. Generate new assets automatically (MCP servers — env-gated, optional)
// ---------------------------------------------------------------------------
export async function generateAssets(input = {}, mcp = null) {
  const s = collectSignals(input);
  const want = input.assetTypes || ["brand-kit", "template", "landing-page", "automation", "niche-validation"];
  const results = [];
  for (const type of want) {
    const client = mcp?.getClient && mcp.getClient(type);
    if (!client) { results.push({ type, status: "skipped", reason: "mcp-not-configured" }); continue; }
    try {
      const out = await client.generate({ signals: s });
      results.push({ type, status: "ok", asset: out });
    } catch (e) {
      results.push({ type, status: "error", reason: e?.message || String(e) });
    }
  }
  return results;
}
// ---------------------------------------------------------------------------
// 5. Personalize the website experience
// ---------------------------------------------------------------------------
export function personalize(input = {}, clusters = [], highDemand = {}) {
  const s = collectSignals(input);
  const topNiche = highDemand.trendingNiches?.[0]?.value || s.niche || "your niche";
  const assets = highDemand.mostRequestedAssets?.slice(0, 3).map((a) => a.value) || [];
  return {
    userId: input.userId || null,
    superpower: s.superpowerName,
    nicheSuggestion: topNiche,
    assetSuggestions: assets.length ? assets : ["rank-and-rent landing page", "lead magnet", "email sequence"],
    automationSuggestions: s.automationPreference === "high" ? ["email capture + delivery", "scheduler", "CRM sync"] : ["scheduler"],
    microSassSuggestions: ["niche calculator", "client intake form", "review follow-up"],
    homepageRecommendations: [`Start with: ${topNiche}`, `Build a ${assets[0] || "lead magnet"} first`],
    dashboardModules: ["Roadmap Progress", "Niche Signals", "Asset Pipeline", "Weekly Build Next"],
    mentorPrompts: [`How do I start a faceless ${topNiche} asset?`, `What is my next step after ${assets[0] || "my scorecard"}?`],
    roadmapAdjustments: s.burnoutRisk === "high" ? ["Cut to 2 steps per week", "Add templates to reduce setup time"] : [],
  };
}

// ---------------------------------------------------------------------------
// 6. Optimize conversion
// ---------------------------------------------------------------------------
export function optimizeConversion(input = {}) {
  const s = collectSignals(input);
  const dropOff = s.dropOffPoints || [];
  const actions = [];
  for (const page of dropOff) {
    actions.push({ page, action: "rewrite-instructions", detail: `Clarify instructions on ${page}; add one concrete example.` });
    actions.push({ page, action: "add-template", detail: `Add a fill-in template on ${page} to reduce friction.` });
  }
  if (!actions.length) actions.push({ page: "general", action: "add-examples", detail: "Add worked examples to the next high-traffic page." });
  actions.push({ action: "add-automation", detail: "Offer an automation to remove a manual step in the funnel." });
  return { dropOffPoints: dropOff, recommendedActions: actions };
}

// ---------------------------------------------------------------------------
// 7. Weekly "Build Next" report
// ---------------------------------------------------------------------------
export function generateWeeklyReport(input = {}) {
  const signals = Array.isArray(input.signals) ? input.signals : [];
  const clusters = input.clusters || clusterUsers(signals);
  const highDemand = input.highDemand || identifyHighDemand(signals, clusters);
  const optimization = optimizeConversion({ signals, dropOffPoints: signals.flatMap((s) => s.dropOffPoints || []) });
  return {
    period: input.weekStart || new Date().toISOString().slice(0, 10),
    topNiches: highDemand.trendingNiches?.slice(0, 5) || [],
    topAssets: highDemand.mostRequestedAssets?.slice(0, 5) || [],
    topRoadmapPaths: highDemand.roadmapStepDropOff?.slice(0, 5) || [],
    topDropOffPoints: highDemand.highestAbandonmentPages?.slice(0, 5) || [],
    topAutomationOpportunities: highDemand.automationsUsed?.slice(0, 5) || [],
    topMicroSassIdeas: ["niche calculator", "client intake form", "review follow-up"],
    topTemplatesToGenerate: highDemand.mostRequestedAssets?.slice(0, 5) || [],
    topPagesToOptimize: optimization.recommendedActions.slice(0, 5) || [],
    topMentorImprovements: highDemand.dominantSuperpowers?.slice(0, 5) || [],
    generatedAt: new Date().toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Orchestrator
// ---------------------------------------------------------------------------
export async function runOptimizationLoop(input = {}) {
  const signals = Array.isArray(input.signals) ? input.signals : [collectSignals(input)];
  const clusters = clusterUsers(signals);
  const highDemand = identifyHighDemand(signals, clusters);
  const personalization = personalize(input, clusters, highDemand);
  const conversion = optimizeConversion({ dropOffPoints: signals.flatMap((s) => s.dropOffPoints || []) });
  const assets = await generateAssets(input, input.mcp);
  const report = generateWeeklyReport({ signals, clusters, highDemand });
  return { signals, clusters, highDemand, personalization, conversion, assets, report };
}

export default runOptimizationLoop;

