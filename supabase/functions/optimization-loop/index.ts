// supabase/functions/optimization-loop/index.ts
// Hermes Optimization Loop — scheduled edge function.
// Daily run (default): clusters optimization signals and persists to user_clusters.
// Weekly run (body.mode === "weekly"): generates and persists a weekly_reports row.
// Deterministic; mirrors lib/hermesOptimizationLoop.js. Never throws.

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

const json = (body: unknown, status = 200, origin = "") =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": origin || "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization, x-api-key",
    },
  });

async function querySignals() {
  const url = Deno.env.get("SUPABASE_URL") || "";
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  if (!url || !key) return [];
  try {
    const res = await fetch(`${url}/rest/v1/optimization_signals?select=*&limit=2000`, {
      headers: { apikey: key, Authorization: `Bearer ${key}` },
    });
    return res.ok ? (await res.json()) : [];
  } catch {
    return [];
  }
}

async function insertRow(table: string, payload: Record<string, unknown>) {
  const url = Deno.env.get("SUPABASE_URL") || "";
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  if (!url || !key) return { ok: false };
  try {
    await fetch(`${url}/rest/v1/${table}`, {
      method: "POST",
      headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json", Prefer: "return=minimal" },
      body: JSON.stringify(payload),
    });
    return { ok: true };
  } catch {
    return { ok: false };
  }
}

function simpleClusters(signals: Record<string, unknown>[]) {
  const keyed = new Map<string, number>();
  for (const s of signals) {
    const sp = String(s.superpowerName || s.superpower || "builder").toLowerCase();
    const profit = Number(s.profitabilityScore) || 0;
    const band = profit >= 70 ? "hot" : profit >= 40 ? "warm" : "cold";
    const key = `${sp}|${band}`;
    keyed.set(key, (keyed.get(key) || 0) + 1);
  }
  return [...keyed.entries()].map(([key, n]) => ({ key, n })).sort((a, b) => b.n - a.n);
}

serve(async (req) => {
  const origin = req.headers.get("origin") || "";
  if (req.method === "OPTIONS") return new Response("ok", { headers: { "Access-Control-Allow-Origin": origin || "*" } });

  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { /* noop */ }
  const mode = String(body.mode || "daily");

  const signals = await querySignals();
  const clusters = simpleClusters(signals);

  if (mode === "weekly") {
    const period = new Date().toISOString().slice(0, 10);
    await insertRow("weekly_reports", {
      period,
      report: { period, signalCount: signals.length, generatedAt: new Date().toISOString() },
    });
    return json({ success: true, mode: "weekly", period, signalCount: signals.length }, 200, origin);
  }

  await insertRow("user_clusters", { user_id: "system", cluster_key: "daily", cluster: clusters });
  return json({ success: true, mode: "daily", clusters, signalCount: signals.length }, 200, origin);
});