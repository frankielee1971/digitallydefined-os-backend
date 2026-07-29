// supabase/functions/followup/index.ts
// Follow-up email pipeline — ported from api/followup.js
// Called daily at midnight by Supabase scheduled function

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { sendEmail, parseSendgridBody } from "../_shared/email-publish.ts";
import { storeRoadmap, listRoadmaps, getRoadmapById } from "../_shared/roadmaps-store.ts";
import { FOLLOWUP_DAYS, DAY_META, buildIndicator, buildMessage } from "../_shared/followup-messages.ts";
import { corsHeaders } from "../_shared/cors-utils.ts";

interface Ctx {
  env: Record<string, string>;
}

serve(async (req: Request, ctx: Ctx) => {
  const env = ctx.env;
  const url = new URL(req.url);

  if (req.method === "OPTIONS") {
    return new Response("ok", { status: 200, headers: corsHeaders(req.headers.get("origin") || "") });
  }

  const origin = req.headers.get("origin");
  const headers: Record<string, string> = {
    "Access-Control-Allow-Origin": origin || "https://digitallydefined.online",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, x-api-key",
    "Access-Control-Allow-Credentials": "true",
    "Vary": "Origin",
    "Content-Type": "application/json",
  };

  // === GET: return followup schedule ===
  if (req.method === "GET") {
    const day = url.pathname.split("/").filter(Boolean).pop();
    if (day && FOLLOWUP_DAYS.includes(day)) {
      const meta = DAY_META[day] || {};
      return new Response(JSON.stringify({
        ok: true, day, ...meta, indicator: { day, delivered: false, subject: meta.subject || "" },
      }), { status: 200, headers });
    }
    return new Response(JSON.stringify({
      ok: true,
      days: FOLLOWUP_DAYS.map(d => ({ day: d, ...DAY_META[d], indicator: { day: d, delivered: false, subject: DAY_META[d]?.subject || "" } })),
    }), { status: 200, headers });
  }

  // === POST: trigger follow-up dispatch (for cron jobs) ===
  if (req.method === "POST") {
    const isCron = req.headers.get("x-supabase-intention") === "supabase.cron.followup";
    if (!isCron && !(env.SENDGRID_API_KEY)) {
      // For manual/testing, just log what would happen
      console.log("[followup-cron] No SENDGRID_API_KEY configured — dry run mode");
    }

    try {
      const roadmaps = listRoadmaps();
      const today = new Date().toISOString().slice(0, 10);
      let dispatched = 0;
      let skipped = 0;

      for (const rm of roadmaps) {
        const entry = rm as Record<string, unknown>;
        const tags = Array.isArray(entry.tags) ? entry.tags : [];
        const followupDay = entry.followupDay;
        if (!followupDay || !tags.includes(`followup-${followupDay}`)) continue;

        // Check if already sent
        const indicator = buildIndicator({ day: followupDay as string, ts: entry.storedAt });
        if (indicator.delivered) { skipped++; continue; }

        // Send email
        const email = String(entry.email || "");
        const name = String(entry.name || "Builder");
        const msg = buildMessage({ resultKey: entry.resultKey as string, profile: { name } });

        if (email && env.SENDGRID_API_KEY) {
          await sendEmail({
            apiKey: env.SENDGRID_API_KEY,
            listId: env.SENDGRID_LIST_ID || "",
            templateId: env.SENDGRID_TEMPLATE_ID || "",
            toEmail: email,
            toName: name,
            tag: `followup-${followupDay}`,
            variables: { subject_msg: msg },
          });
          dispatched++;
        }
      }

      return new Response(JSON.stringify({
        ok: true, action: "followup", status: "completed",
        dispatched, skipped, totalProcessed: roadmaps.length, timestamp: new Date().toISOString(),
      }), { status: 200, headers });
    } catch (e: any) {
      console.error("[followup-cron] error:", e.message);
      return new Response(JSON.stringify({ ok: false, error: e.message }), { status: 500, headers });
    }
  }

  return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405, headers });
});
