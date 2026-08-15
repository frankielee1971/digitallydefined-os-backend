// supabase/functions/optimization-loop-weekly/index.ts
// Weekly "Build Next" report generator (scheduled via config.toml).
// Reads optimization_signals and writes a summary row into weekly_reports.

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
  });

serve(async () => {
  const url = Deno.env.get("SUPABASE_URL") || "";
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  if (!url || !key) return json({ success: false, error: "Supabase env not configured" }, 503);

  let signals: Record<string, unknown>[] = [];
  try {
    const res = await fetch(`${url}/rest/v1/optimization_signals?select=*&limit=5000`, {
      headers: { apikey: key, Authorization: `Bearer ${key}` },
    });
    signals = res.ok ? (await res.json()) : [];
  } catch { /* ignore */ }

  const superpowers = new Map<string, number>();
  const niches = new Map<string, number>();
  for (const s of signals) {
    const sp = String(s.superpowerName || s.superpower || "builder").toLowerCase();
    const niche = String(s.niche || "general").toLowerCase();
    superpowers.set(sp, (superpowers.get(sp) || 0) + 1);
    niches.set(niche, (niches.get(niche) || 0) + 1);
  }
  const topSuperpowers = [...superpowers.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([value, count]) => ({ value, count }));
  const topNiches = [...niches.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([value, count]) => ({ value, count }));

  const period = new Date().toISOString().slice(0, 10);
  const report = {
    period,
    signalCount: signals.length,
    topSuperpowers,
    topNiches,
    topAssets: [],
    topDropOffPoints: [],
    topAutomationOpportunities: [],
    topMicroSassIdeas: ["niche calculator", "client intake form", "review follow-up"],
    topTemplatesToGenerate: [],
    topPagesToOptimize: [],
    topMentorImprovements: topSuperpowers,
    generatedAt: new Date().toISOString(),
  };

  try {
    await fetch(`${url}/rest/v1/weekly_reports`, {
      method: "POST",
      headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json", Prefer: "return=minimal" },
      body: JSON.stringify({ period, report }),
    });
  } catch { /* ignore */ }

  return json({ success: true, period, report }, 200);
});