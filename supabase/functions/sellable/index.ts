// supabase/functions/sellable/index.ts
// Sellable products cron endpoint — ported from api/cron/sellable.js
// Kept for backward compatibility and manual invocation

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { corsHeaders } from "../_shared/cors-utils.ts";
import { buildEnvelope, dryRunEnabled } from "../_shared/sellable-auth.ts";

interface Ctx {
  env: Record<string, string>;
}

serve(async (req: Request, ctx: Ctx) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { status: 200, headers: corsHeaders(req.headers.get("origin") || "") });
  }

  const origin = req.headers.get("origin");
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": origin || "https://digitallydefined.online",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, x-api-key",
    "Vary": "Origin",
  };

  // === Body parsing ===
  let body: Record<string, unknown> = {};
  try {
    const raw = await req.text();
    body = raw ? JSON.parse(raw) : {};
  } catch { /* empty body is fine */ }

  const action = String(body.action || "dry-run").trim().toLowerCase();
  if (!["dry-run", "run"].includes(action)) {
    return new Response(JSON.stringify(buildEnvelope({ ok: false, action: "cron", status: "error", error: `Unsupported action: ${action}` })), { status: 400, headers });
  }

  const job = String(body.job || "daily-sellable-report").trim().toLowerCase();
  const allowedJobs = new Set(["daily-sellable-report", "revenue-automation", "seo-automation", "monthly-revenue-review", "sellable-health"]);
  if (!allowedJobs.has(job)) {
    return new Response(JSON.stringify(buildEnvelope({ ok: false, action: "cron", status: "error", error: `Unknown cron job: ${job}` })), { status: 400, headers });
  }

  // === Auth check (only for non-cron manual calls) ===
  const isCron = req.headers.get("x-supabase-intention") === "supabase.cron.sellable";
  if (!isCron) {
    const expected = (ctx.env.DASHBOARD_API_KEY || "").trim();
    const provided = (req.headers.get("x-api-key") || req.headers.get("authorization") || "").trim();
    if (expected && provided !== expected) {
      return new Response(JSON.stringify(buildEnvelope({ ok: false, action: "cron", status: "unauthorized", error: "Unauthorized" })), { status: 401, headers });
    }
  }

  const result = {
    job, action, executedAt: new Date().toISOString(),
    triggeredBy: action === "dry-run" ? "manual_dry_run" : "supabase_cron",
  };

  const envelope = action === "dry-run"
    ? buildEnvelope({ ok: true, action: "cron", status: "drilled", data: result, meta: { dryRun: true } })
    : buildEnvelope({ ok: true, action: "cron", status: "completed", data: result });

  return new Response(JSON.stringify(envelope), { status: 200, headers });
});
