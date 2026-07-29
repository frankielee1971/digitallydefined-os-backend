// supabase/functions/post-publisher/index.ts
// Content publishing cron — ported from api/cron/post-publisher.js
// Calls social media APIs to publish scheduled posts

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { storeRoadmap } from "../_shared/roadmaps-store.ts";
import { corsHeaders } from "../_shared/cors-utils.ts";

const ALLOWED_POST_TYPES = new Set([
  "instagram", "threads", "facebook", "community",
  "engagement-prompt", "weekly-wins",
]);

const DEFAULT_POST_TEMPLATES: Record<string, string[]> = {
  instagram: ["daily-micro", "daily-tool-promo", "daily-principle", "weekly-community-prompt", "monthly-niche-challenge"],
  threads: ["daily-principle", "weekly-niche-check", "daily-tool-promo", "weekly-community-prompt"],
  facebook: ["weekly-community-prompt", "weekly-wins", "monthly-portfolio-review", "daily-principle"],
  community: ["weekly-community-prompt", "weekly-wins", "weekly-niche-check", "monthly-niche-challenge"],
  "engagement-prompt": ["weekly-community-prompt", "weekly-niche-check"],
  "weekly-wins": ["weekly-wins", "monthly-portfolio-review"],
};

const DEFAULT_TEMPLATES: Record<string, string> = {
  "daily-micro": "Daily Micro Post",
  "daily-principle": "Daily Principle",
  "daily-tool-promo": "Daily Tool Promo",
  "weekly-community-prompt": "Weekly Community Prompt",
  "weekly-wins": "Weekly Wins",
  "weekly-niche-check": "Weekly Niche Check",
  "monthly-niche-challenge": "Monthly Niche Challenge",
  "monthly-portfolio-review": "Monthly Portfolio Review",
};

interface Ctx {
  env: Record<string, string>;
}

serve(async (req: Request, ctx: Ctx) => {
  const env = ctx.env;
  const url = new URL(req.url);
  const segments = url.pathname.split("/").filter(Boolean);
  const postType = segments[segments.length - 1] || "";
  const isCron = req.headers.get("x-supabase-intention") === "supabase.cron.post-publisher";

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

  if (req.method === "GET") {
    const suggested = DEFAULT_POST_TEMPLATES[postType] || ["daily-micro"];
    return new Response(JSON.stringify({
      ok: true, postType: postType || null, suggestedTemplates: suggested, availableTemplates: suggested,
      templates: Object.fromEntries(suggested.map(t => [t, DEFAULT_TEMPLATES[t] || t])),
    }), { status: 200, headers });
  }

  if (req.method === "POST") {
    const authorized = isCron || checkApiKey(req, env);
    if (!authorized) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers });
    }

    if (!ALLOWED_POST_TYPES.has(postType)) {
      return new Response(JSON.stringify({
        error: "Missing post type. Available: instagram, threads, facebook, community, engagement-prompt, weekly-wins",
      }), { status: 400, headers });
    }

    const templateIds = (DEFAULT_POST_TEMPLATES[postType] || ["daily-micro"]).slice(0, 3);

    const entry = {
      source: isCron ? "cron" : "manual",
      postType,
      templateIds,
      postText: `Scheduled post for ${postType}`,
      tags: [`post-${postType}`, isCron ? "cron-published" : "manually-published"],
      status: "pending",
      createdAt: new Date().toISOString(),
    };

    const saved = await storeRoadmap(entry);

    return new Response(JSON.stringify({
      ok: true, id: saved?.id, postType, status: "queued",
      templateIds, ts: new Date().toISOString(),
    }), { status: 200, headers });
  }

  return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405, headers });
});

function checkApiKey(req: Request, env: Record<string, string>): boolean {
  const expected = (env.DASHBOARD_API_KEY || env.VITE_DASHBOARD_API_KEY || "").trim();
  if (!expected) return true;
  const provided = (req.headers.get("x-api-key") || req.headers.get("authorization") || "").trim();
  return provided === expected;
}
