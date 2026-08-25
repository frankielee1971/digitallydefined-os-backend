// lib/hermesOptimizationLoop.js
// Hermes Optimization Loop — collects signals, clusters users, finds high-demand
// patterns, (optionally) generates assets via MCP servers, personalizes the site,
// optimizes conversion, and produces weekly "Build Next" reports.
// Deterministic + dependency-free; optional MCP hooks are env-gated and safe.

const SIGNAL_FIELDS = [
  "profitabilityScore",
  "competitionLevel",
  "trendStrength",
  "nicheViability",
  "audienceInsight",
  "opportunityGaps",
  "privacyNeeds",
  "energyLevel",
  "burnoutRisk",
  "aiTools",
  "superpower",
  "roadmap",
  "niche",
];

// ---------------------------------------------------------------------------
// 1. Collect signals
// ---------------------------------------------------------------------------
export function collectSignals(input = {}) {
  const src = input.signals || input.intelligence || input;
  const signal = {};

  for (const key of SIGNAL_FIELDS) {
    if (src[key] !== undefined) {
      signal[key] = src[key];
    } else if (input[key] !== undefined) {
      signal[key] = input[key];
    } else {
      signal[key] = null;
    }
  }

  // Frontend behavioral signals (page interactions, drop-offs, conversions)
  signal.events = Array.isArray(input.events) ? input.events : [];
  signal.dropOffPoints = Array.isArray(input.dropOffPoints) ? input.dropOffPoints : [];
  signal.conversionPaths = Array.isArray(input.conversionPaths) ? input.conversionPaths : [];

  signal.assetPreference = input.assetPreference || src.assetPreference || null;
  signal.automationPreference = input.automationPreference || src.automationPreference || null;

  signal.superpowerName = src.superpowerName || src.superpower || null;

  // Optional emotional / brand-aware hooks (lightweight, can be expanded later)
  signal.emotionalState = src.emotionalState || input.emotionalState || null;
  signal.confidenceLevel = src.confidenceLevel || input.confidenceLevel || null;
  signal.overwhelmLevel = src.overwhelmLevel || input.overwhelmLevel || null;

  signal.collectedAt = new Date().toISOString();
  return signal;
}

// ---------------------------------------------------------------------------
// 2. Cluster users into behavioral profiles
// ---------------------------------------------------------------------------
export function clusterUsers(profiles = []) {
  const clusters = new Map();

  for (const profile of profiles) {
    const s = collectSignals(profile);

    const superpower = (s.superpowerName || s.superpower || "builder").toLowerCase();
    const nicheCategory = String(
      s.niche || s.audienceInsight?.niche || "general",
    )
      .toLowerCase()
      .trim();

    const profitability = Number(s.profitabilityScore) || 0;
    const trend = String(s.trendStrength || "unknown").toLowerCase();
    const competition = String(s.competitionLevel || "unknown").toLowerCase();

    const privacy =
      s.privacyNeeds?.camera === true ? "camera-ok" : "faceless";

    const energy = String(s.energyLevel || "medium").toLowerCase();
    const burnout = String(s.burnoutRisk || "low").toLowerCase();

    const assetPreference = String(
      s.assetPreference || "rank-and-rent",
    ).toLowerCase();

    const automationPreference = String(
      s.automationPreference || "high",
    ).toLowerCase();

    const profitabilityBand =
      profitability >= 70 ? "hot" : profitability >= 40 ? "warm" : "cold";

    const key = [
      superpower,
      nicheCategory,
      profitabilityBand,
      trend,
      competition,
      privacy,
      energy,
      burnout,
      assetPreference,
      automationPreference,
    ].join("|");

    if (!clusters.has(key)) {
      clusters.set(key, {
        key,
        users: [],
        n: 0,
        superpower,
        nicheCategory,
        profitability,
        trend,
        competition,
        privacy,
        energy,
        burnout,
        assetPreference,
        automationPreference,
      });
    }

    const cluster = clusters.get(key);
    cluster.users.push(s);
    cluster.n += 1;
  }

  const out = Array.from(clusters.values());
  out.sort((a, b) => b.n - a.n);
  return out;
}

// ---------------------------------------------------------------------------
// 3. Identify high-demand patterns
// ---------------------------------------------------------------------------
export function identifyHighDemand(signals = [], clusters = []) {
  const tally = (key) => {
    const m = new Map();
    for (const s of signals) {
      const v = s[key];
      if (v == null) continue;
      m.set(v, (m.get(v) || 0) + 1);
    }
    return [...m.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([value, count]) => ({ value, count }));
  };

  const dropOff = new Map();
  for (const s of signals) {
    const steps = s.roadmap?.steps || [];
    for (const step of steps) {
      dropOff.set(step, (dropOff.get(step) || 0) + 1);
    }
  }

  const tools = new Map();
  for (const s of signals) {
    const list = Array.isArray(s.aiTools) ? s.aiTools : [];
    for (const t of list) {
      tools.set(t, (tools.get(t) || 0) + 1);
    }
  }

  const pages = new Map();
  for (const s of signals) {
    const list = Array.isArray(s.dropOffPoints) ? s.dropOffPoints : [];
    for (const p of list) {
      pages.set(p, (pages.get(p) || 0) + 1);
    }
  }

  return {
    trendingNiches: tally("niche").slice(0, 10),
    dominantSuperpowers: tally("superpowerName").slice(0, 10),
    mostRequestedAssets: tally("assetPreference").slice(0, 10),
    roadmapStepDropOff: [...dropOff.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([step, count]) => ({ step, count })),
    preferredTools: [...tools.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([value, count]) => ({ value, count })),
    automationsUsed: tally("automationPreference").slice(0, 10),
    highestAbandonmentPages: [...pages.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([page, count]) => ({ page, count })),
  };
}

// ---------------------------------------------------------------------------
// 4. Generate new assets automatically (MCP servers — env-gated, optional)
// ---------------------------------------------------------------------------
export async function generateAssets(input = {}, mcp = null) {
  const signals = collectSignals(input);
  const requestedTypes =
    input.assetTypes || [
      "brand-kit",
      "template",
      "landing-page",
      "automation",
      "niche-validation",
    ];

  const results = [];

  for (const type of requestedTypes) {
    const client = mcp?.getClient && mcp.getClient(type);
    if (!client) {
      results.push({
        type,
        status: "skipped",
        reason: "mcp-not-configured",
      });
      continue;
    }

    try {
      const asset = await client.generate({ signals });
      results.push({ type, status: "ok", asset });
    } catch (e) {
      results.push({
        type,
        status: "error",
        reason: e?.message || String(e),
      });
    }
  }

  return results;
}

// ---------------------------------------------------------------------------
// 5. Personalize the website experience
// ---------------------------------------------------------------------------
export function personalize(input = {}, clusters = [], highDemand = {}) {
  const s = collectSignals(input);

  const topNiche =
    highDemand.trendingNiches?.[0]?.value || s.niche || "your niche";

  const assets =
    highDemand.mostRequestedAssets?.slice(0, 3).map((a) => a.value) || [];

  const assetSuggestions =
    assets.length > 0
      ? assets
      : ["rank-and-rent landing page", "lead magnet", "email sequence"];

  const automationSuggestions =
    s.automationPreference === "high"
      ? ["email capture + delivery", "scheduler", "CRM sync"]
      : ["scheduler"];

  // Micro-SaaS ideas are currently static; can be made dynamic later
  const microSassSuggestions = [
    "niche calculator",
    "client intake form",
    "review follow-up",
  ];

  const homepageRecommendations = [
    `Start with: ${topNiche}`,
    `Build a ${assetSuggestions[0]} first`,
  ];

  const dashboardModules = [
    "Roadmap Progress",
    "Niche Signals",
    "Asset Pipeline",
    "Weekly Build Next",
  ];

  const mentorPrompts = [
    `How do I start a faceless ${topNiche} asset?`,
    `What is my next step after ${assetSuggestions[0]}?`,
  ];

  const roadmapAdjustments =
    s.burnoutRisk === "high"
      ? ["Cut to 2 steps per week", "Add templates to reduce setup time"]
      : [];

  return {
    userId: input.userId || null,
    superpower: s.superpowerName,
    nicheSuggestion: topNiche,
    assetSuggestions,
    automationSuggestions,
    microSassSuggestions,
    homepageRecommendations,
    dashboardModules,
    mentorPrompts,
    roadmapAdjustments,
  };
}

// ---------------------------------------------------------------------------
// 6. Optimize conversion
// ---------------------------------------------------------------------------
export function optimizeConversion(input = {}) {
  const s = collectSignals(input);
  const dropOff = Array.isArray(s.dropOffPoints) ? s.dropOffPoints : [];

  const recommendedActions = [];

  for (const page of dropOff) {
    recommendedActions.push({
      page,
      action: "rewrite-instructions",
      detail: `Clarify instructions on ${page}; add one concrete example.`,
    });
    recommendedActions.push({
      page,
      action: "add-template",
      detail: `Add a fill-in template on ${page} to reduce friction.`,
    });
  }

  if (recommendedActions.length === 0) {
    recommendedActions.push({
      page: "general",
      action: "add-examples",
      detail: "Add worked examples to the next high-traffic page.",
    });
  }

  recommendedActions.push({
    action: "add-automation",
    detail: "Offer an automation to remove a manual step in the funnel.",
  });

  return {
    dropOffPoints: dropOff,
    recommendedActions,
  };
}

// ---------------------------------------------------------------------------
// 7. Weekly "Build Next" report
// ---------------------------------------------------------------------------
export function generateWeeklyReport(input = {}) {
  const signals = Array.isArray(input.signals) ? input.signals : [];
  const clusters = input.clusters || clusterUsers(signals);
  const highDemand = input.highDemand || identifyHighDemand(signals, clusters);

  const optimization = optimizeConversion({
    dropOffPoints: signals.flatMap((s) => s.dropOffPoints || []),
  });

  return {
    period: input.weekStart || new Date().toISOString().slice(0, 10),
    topNiches: highDemand.trendingNiches?.slice(0, 5) || [],
    topAssets: highDemand.mostRequestedAssets?.slice(0, 5) || [],
    topRoadmapPaths: highDemand.roadmapStepDropOff?.slice(0, 5) || [],
    topDropOffPoints: highDemand.highestAbandonmentPages?.slice(0, 5) || [],
    topAutomationOpportunities: highDemand.automationsUsed?.slice(0, 5) || [],
    topMicroSassIdeas: [
      "niche calculator",
      "client intake form",
      "review follow-up",
    ],
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
  const signals = Array.isArray(input.signals)
    ? input.signals.map((s) => collectSignals(s))
    : [collectSignals(input)];

  const clusters = clusterUsers(signals);
  const highDemand = identifyHighDemand(signals, clusters);
  const personalization = personalize(input, clusters, highDemand);

  const conversion = optimizeConversion({ ...input, dropOffPoints: signals.flatMap((s) => s.dropOffPoints || []) });

  const assets = await generateAssets(input, input.mcp);
  const report = generateWeeklyReport({ signals, clusters, highDemand });

  return {
    signals,
    clusters,
    highDemand,
    personalization,
    conversion,
    assets,
    report,
  };
}

export default runOptimizationLoop;
