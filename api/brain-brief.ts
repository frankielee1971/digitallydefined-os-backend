export const config = {
  runtime: "edge",
};

export default async function handler() {
  const payload = {
    generatedAt: "2026-05-25T17:25:00-04:00",
    status: "ok",
    daily_brief: {
      headline: "One-sentence executive summary",
      summary: "Short paragraph explaining what matters most today.",
      priority: "high",
    },
    market_gaps: [
      {
        title: "Underserved offer angle",
        why_it_matters: "Why this looks profitable now",
        source: "Notion + Perplexity + Sheets",
        confidence: 88,
        recommended_action: "Create lead magnet or validate with content",
      },
    ],
    build_next: {
      asset_type: "Lead magnet",
      title: "Gen X digital income angle",
      reason: "Best mix of demand, speed, and fit",
      cta: "Draft in Notion AI agent",
    },
    stale_automations: [
      {
        name: "Ideas Intake enrichment",
        tool: "Gumloop",
        issue: "No sync in 48 hours",
        severity: "medium",
      },
    ],
    urgent_alerts: [
      {
        title: "Meta insights sync failed",
        detail: "Last successful pull was over 24h ago",
        action: "Check Vercel env or token",
      },
    ],
    source_health: {
      notion: "connected",
      antigravity: "connected",
      google_sheets: "connected",
      slack: "connected",
      gumloop: "connected",
      meta_api: "connected",
    },
  };

  return new Response(JSON.stringify(payload), {
    headers: { "Content-Type": "application/json" },
  });
}