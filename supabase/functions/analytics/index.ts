// supabase/functions/analytics/index.ts
//
// DigitallyDefined Analytics Pipeline — unified ingestion + reporting.
//
// Ingestion (website tracker):
//   POST { action: "track", events: [...] }   -> batched events/sessions/leads/funnels/assets/products
//
// Reporting (dashboard backend / Hermes / AI Business Partner):
//   POST { action: "overview" }   -> traffic, leads, conversions, engagement rollup
//   POST { action: "traffic" }    -> per-page traffic
//   POST { action: "funnels" }    -> funnel step conversion
//   POST { action: "assets" }     -> asset performance leaderboard
//   POST { action: "products" }   -> product interest ranking
//   POST { action: "recommend" }  -> AI Business Partner analysis of live data
//
// Auth: x-api-key (DASHBOARD_API_KEY) for reporting; ingestion also
// accepts anon callers so the lightweight website tracker can post.

import { handleCors } from "../_shared/cors-utils.ts";

type JsonRecord = Record<string, unknown>;

const API_KEY = Deno.env.get("DASHBOARD_API_KEY") || "";
if (!API_KEY) console.error("[analytics] DASHBOARD_API_KEY secret is not set. Authenticated calls will fail.");

const json = (body: unknown, status = 200, origin = "") =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": origin || "*",
      "Access-Control-Allow-Headers": "Content-Type, apikey, Authorization, x-api-key",
    },
  });

function serviceCreds(): { url: string; key: string } {
  return {
    url: Deno.env.get("SUPABASE_URL") || "",
    key: Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "",
  };
}

async function rest(path: string, init: RequestInit = {}): Promise<Response> {
  const { url, key } = serviceCreds();
  if (!url || !key) throw new Error("Supabase service credentials unavailable");
  return fetch(`${url}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      ...(init.headers || {}),
    },
  });
}

const selectJson = async (path: string): Promise<JsonRecord[]> => {
  const res = await rest(path);
  if (!res.ok) throw new Error(`REST ${path} failed: ${res.status} ${await res.text()}`);
  return res.json();
};

async function insertRows(table: string, rawRows: JsonRecord[]) {
  if (!rawRows.length) return;
  // PostgREST requires every object in a batch to share the same keys.
  // Group rows by their key signature and insert each group separately
  // so per-column defaults still apply.
  const groups = new Map<string, JsonRecord[]>();
  for (const row of rawRows) {
    const sig = Object.keys(row).sort().join(",");
    if (!groups.has(sig)) groups.set(sig, []);
    groups.get(sig)!.push(row);
  }
  for (const [, rows] of groups) {
    const res = await rest(table, {
      method: "POST",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify(rows),
    });
    if (!res.ok) throw new Error(`Insert into ${table} failed: ${res.status} ${await res.text()}`);
  }
}

/** Read-modify-write counter upsert on assets/products keyed by name. */
async function upsertCounter(table: string, nameColumn: string, name: string, counters: JsonRecord) {
  const encoded = encodeURIComponent(name);
  const existing = await selectJson(`${table}?${nameColumn}=eq.${encoded}&select=*`);
  if (existing.length) {
    const row = existing[0];
    const patch: JsonRecord = { updated_at: new Date().toISOString() };
    for (const [k, v] of Object.entries(counters)) {
      patch[k] = Number(row[k] || 0) + Number(v || 0);
    }
    await rest(`${table}?${nameColumn}=eq.${encoded}`, {
      method: "PATCH",
      body: JSON.stringify(patch),
    });
  } else {
    await insertRows(table, [{ [nameColumn]: name, ...counters }]);
  }
}

// ------------------------------------------------------------
// Ingestion
// ------------------------------------------------------------
type TrackedEvent = {
  event_type?: string;
  type?: string;
  page?: string;
  metadata?: JsonRecord;
  session_id?: string;
  url?: string;
  referrer?: string;
  email?: string;
  product_name?: string;
  value?: number | string;
};

async function ingest(events: TrackedEvent[]) {
  const now = new Date().toISOString();
  const eventRows: JsonRecord[] = [];
  const leadRows: JsonRecord[] = [];
  const funnelRows: JsonRecord[] = [];
  let sessionId: string | null = null;
  let sessionReferrer: string | null = null;
  let sessionAgent: string | null = null;
  const sessionPatch: JsonRecord = {};
  const assetCounters = new Map<string, JsonRecord>();
  const productCounters = new Map<string, JsonRecord>();

  const bump = (map: Map<string, JsonRecord>, name: string, key: string, by = 1) => {
    if (!map.has(name)) map.set(name, {});
    const row = map.get(name)!;
    row[key] = Number(row[key] || 0) + by;
  };

  for (const e of events) {
    const type = String(e.event_type || e.type || "").trim();
    if (!type) continue;
    const page = String(e.page || "/");
    if (!sessionId && e.session_id) sessionId = String(e.session_id);
    if (e.referrer && !sessionReferrer) sessionReferrer = String(e.referrer);

    eventRows.push({
      event_type: type,
      page,
      metadata: e.metadata || {},
      session_id: e.session_id ? String(e.session_id) : null,
      url: e.url || null,
      referrer: e.referrer || null,
      created_at: now,
    });

    switch (type) {
      case "page_view":
        bump(assetCounters, page, "views");
        sessionPatch.page_views = Number(sessionPatch.page_views || 0) + 1;
        sessionPatch.last_page = page;
        break;
      case "cta_click":
        bump(assetCounters, page, "clicks");
        break;
      case "scroll_depth":
        bump(assetCounters, page, "engagement_seconds", Math.max(0, Number(e.value || 0)));
        break;
      case "form_submit":
        bump(assetCounters, page, "conversions");
        if (e.email) {
          leadRows.push({
            email: String(e.email).toLowerCase(),
            source_page: page,
            funnel_step: String((e.metadata as JsonRecord)?.funnel_step || "top"),
            metadata: e.metadata || {},
            session_id: e.session_id ? String(e.session_id) : null,
            created_at: now,
          });
        }
        break;
      case "quiz_start":
        funnelRows.push({
          funnel_name: "digital-superpower-quiz",
          step: "started",
          status: "entered",
          session_id: e.session_id ? String(e.session_id) : null,
          created_at: now,
        });
        break;
      case "quiz_complete":
        funnelRows.push({
          funnel_name: "digital-superpower-quiz",
          step: "completed",
          status: "completed",
          session_id: e.session_id ? String(e.session_id) : null,
          email: e.email ? String(e.email).toLowerCase() : null,
          metadata: e.metadata || {},
          created_at: now,
        });
        if (e.email) {
          leadRows.push({
            email: String(e.email).toLowerCase(),
            source_page: "/quiz",
            funnel_step: "completed-quiz",
            metadata: e.metadata || {},
            session_id: e.session_id ? String(e.session_id) : null,
            created_at: now,
          });
        }
        break;
      case "product_interest":
      case "product_view": {
        const productName = String(e.product_name || "").trim();
        if (productName) {
          bump(productCounters, productName, type === "product_view" ? "views" : "interest_count");
        }
        break;
      }
      default:
        break;
    }
  }

  await insertRows("events", eventRows);
  await insertRows("leads", leadRows);
  await insertRows("funnels", funnelRows);

  if (sessionId) {
    const sid = encodeURIComponent(sessionId);
    const existing = await selectJson(`sessions?id=eq.${sid}&select=id`);
    if (!existing.length) {
      await insertRows("sessions", [{
        id: sessionId,
        user_agent: sessionAgent,
        referrer: sessionReferrer,
        start_time: now,
        end_time: now,
        last_page: sessionPatch.last_page || null,
        page_views: sessionPatch.page_views || 0,
      }]);
    } else {
      await rest(`sessions?id=eq.${sid}`, {
        method: "PATCH",
        body: JSON.stringify({ ...sessionPatch, end_time: now }),
      });
    }
  }

  for (const [name, counters] of assetCounters) {
    await upsertCounter("assets", "asset_name", name, counters);
  }
  for (const [name, counters] of productCounters) {
    await upsertCounter("products", "product_name", name, counters);
  }

  return {
    events_inserted: eventRows.length,
    leads_inserted: leadRows.length,
    funnels_inserted: funnelRows.length,
    assets_touched: assetCounters.size,
    products_touched: productCounters.size,
  };
}

// ------------------------------------------------------------
// Reporting queries
// ------------------------------------------------------------
async function getOverview(days = 30) {
  const since = new Date(Date.now() - days * 86400000).toISOString();
  const [events, leads, sessions, funnels, assets, products] = await Promise.all([
    selectJson(`events?created_at=gte.${since}&select=event_type,page,created_at&order=created_at.desc&limit=5000`),
    selectJson(`leads?created_at=gte.${since}&select=email,source_page,created_at`),
    selectJson(`sessions?select=id,duration_ms,is_bounce`),
    selectJson(`funnels?created_at=gte.${since}&select=funnel_name,step,status`),
    selectJson(`assets?select=asset_name,asset_type,views,clicks,conversions&order=views.desc&limit=15`),
    selectJson(`products?select=product_name,interest_count,views&order=interest_count.desc&limit=20`),
  ]);

  const byType: JsonRecord = {};
  const byPage: JsonRecord = {};
  for (const e of events) {
    const t = String(e.event_type);
    byType[t] = (Number(byType[t]) || 0) + 1;
    const p = String(e.page);
    byPage[p] = (Number(byPage[p]) || 0) + 1;
  }

  const durations = sessions.map((s) => Number(s.duration_ms || 0)).filter((d) => d > 0);
  const avgSessionSeconds = durations.length
    ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length / 1000)
    : 0;
  const bounces = sessions.filter((s) => s.is_bounce === true).length;

  const quizFunnels = funnels.filter((f) => f.funnel_name === "digital-superpower-quiz");
  const quizStarts = quizFunnels.filter((f) => f.step === "started").length;
  const quizCompletes = quizFunnels.filter((f) => f.step === "completed").length;

  const totalViews = Number(byType.page_view) || 0;
  const formSubmits = Number(byType.form_submit) || 0;
  const ctaClicks = Number(byType.cta_click) || 0;
  const leadCount = leads.length;

  const rate = (num: number, den: number) => (den ? Number((num / den).toFixed(4)) : 0);

  return {
    period_days: days,
    generated_at: new Date().toISOString(),
    traffic: {
      page_views: totalViews,
      unique_sessions: sessions.length,
      avg_session_seconds: avgSessionSeconds,
      bounce_rate: rate(bounces, sessions.length),
      top_pages: Object.entries(byPage).sort((a, b) => Number(b[1]) - Number(a[1])).slice(0, 10)
        .map(([page, views]) => ({ page, views })),
    },
    engagement: {
      scroll_events: Number(byType.scroll_depth) || 0,
      avg_scroll_depth_pct: (() => {
        const depths = events
          .filter((e) => e.event_type === "scroll_depth" && typeof e.metadata === "object")
          .map((e) => Number((e.metadata as JsonRecord)?.depth || 0))
          .filter((d) => d > 0);
        return depths.length
          ? Math.round(depths.reduce((a, b) => a + b, 0) / depths.length)
          : 0;
      })(),
    },
    leads: {
      total: leadCount,
      per_day: (() => {
        const dayMap: Record<string, number> = {};
        for (const l of leads) {
          const day = String(l.created_at).slice(0, 10);
          dayMap[day] = (dayMap[day] || 0) + 1;
        }
        return Object.entries(dayMap).sort((a, b) => a[0].localeCompare(b[0]))
          .map(([date, count]) => ({ date, count }));
      })(),
      top_sources: (() => {
        const srcMap: Record<string, number> = {};
        for (const l of leads) srcMap[String(l.source_page)] = (srcMap[String(l.source_page)] || 0) + 1;
        return Object.entries(srcMap).sort((a, b) => b[1] - a[1]).slice(0, 5)
          .map(([source_page, count]) => ({ source_page, count }));
      })(),
    },
    conversions: {
      form_submits: formSubmits,
      cta_clicks: ctaClicks,
      visitor_to_lead_rate: rate(leadCount, totalViews),
      click_to_lead_rate: rate(leadCount, ctaClicks),
      quiz_start_to_complete_rate: rate(quizCompletes, quizStarts),
    },
    funnels: {
      quiz: { started: quizStarts, completed: quizCompletes, completion_rate: rate(quizCompletes, quizStarts) },
    },
    assets,
    products,
    raw_event_counts: byType,
  };
}

// ------------------------------------------------------------
// AI recommendation over live data
// ------------------------------------------------------------
type Candidate = { provider: string; model: string; key: string; url: string };

const getCandidates = (): Candidate[] => {
  // OmniRoute ONLY (single-gateway consolidation)
  const omnirouteKey = Deno.env.get("OMNIROUTE_API_KEY") || "";
  if (!omnirouteKey) {
    console.error("[analytics] OMNIROUTE_API_KEY is not set. AI recommendations will fail.");
    return [];
  }
  const baseUrl = (Deno.env.get("OMNIROUTE_BASE_URL") || "https://api.omniroute.ai/v1").replace(/\/+$/, "");
  return [
    {
      provider: "omniroute",
      model: Deno.env.get("OMNIROUTE_MODEL") || "auto",
      key: omnirouteKey,
      url: `${baseUrl}/chat/completions`,
    },
  ];
};

async function runAI(systemPrompt: string, userPrompt: string) {
  const candidates = getCandidates();
  if (!candidates.length) throw new Error("No AI provider configured in Supabase secrets");
  let lastError = "";
  for (const c of candidates) {
    try {
      const response = await fetch(c.url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${c.key}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: c.model,
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt },
          ],
          temperature: 0.35,
          max_tokens: 1600,
        }),
        signal: AbortSignal.timeout(60000),
      });
      if (!response.ok) {
        lastError = `${c.provider} HTTP ${response.status}: ${await response.text()}`;
        continue;
      }
      const payload = await response.json();
      const reply = payload?.choices?.[0]?.message?.content || "";
      if (reply) return { reply, provider: c.provider, model: c.model };
      lastError = `${c.provider} returned an empty response`;
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }
  }
  throw new Error(lastError || "All AI providers failed");
}

const RECOMMEND_SYSTEM = `You are Hermes, the autonomous business partner inside DigitallyDefined.
Analyze live website analytics and act as a strategic operator for Francesca's digital empire.
Ground every claim in the supplied numbers; never invent data. Be direct and practical, zero fluff.

Return only JSON:
{
  "summary": "one paragraph executive summary of what the data says",
  "opportunities": [{"title":"...","why":"...","expected_impact":"high|medium|low"}],
  "failing_funnels": [{"funnel":"...","symptom":"...","fix":"..."}],
  "high_performing_content": ["..."],
  "content_recommendations": ["new pages / products / automations grounded in observed behavior"],
  "next_actions": ["concrete ordered build tasks"],
  "linear_tasks": [{"title":"...","description":"...","priority":"urgent|high|medium|low"}]
}`;

async function recommend(days = 30) {
  const overview = await getOverview(days);
  const result = await runAI(
    RECOMMEND_SYSTEM,
    `Live analytics snapshot (${days} days):\n${JSON.stringify(overview)}\n\n` +
      `Analyze trends, bottlenecks, high-performing content and failing funnels. ` +
      `Recommend what to build next to scale.`,
  );
  return { analysis: result.reply, provider: result.provider, model: result.model, overview };
}

// ------------------------------------------------------------
// Router
// ------------------------------------------------------------
Deno.serve(async (req: Request) => {
  const origin = req.headers.get("origin") || "";
  const preflight = handleCors(req);
  if (preflight) return preflight;

  const providedKey = req.headers.get("x-api-key") || "";
  const isServiceCall = providedKey === API_KEY;

  if (req.method !== "POST") {
    return json({
      ok: true,
      service: "analytics",
      actions: ["track", "overview", "traffic", "funnels", "assets", "products", "recommend"],
    }, 200, origin);
  }

  let body: JsonRecord;
  try {
    body = await req.json();
  } catch {
    return json({ ok: false, error: "Invalid JSON body" }, 400, origin);
  }

  const action = String(body.action || "");

  // Ingestion is open to the website tracker; all reporting requires
  // the dashboard API key so analytics stay private.
  if (action !== "track" && !isServiceCall) {
    return json({ ok: false, error: "Unauthorized" }, 401, origin);
  }

  try {
    switch (action) {
      case "track": {
        const incoming = Array.isArray(body.events) ? (body.events as TrackedEvent[]) : [];
        if (!incoming.length) {
          return json({ ok: false, error: "events array required" }, 400, origin);
        }
        const result = await ingest(incoming.slice(0, 100));
        return json({ ok: true, ...result }, 200, origin);
      }
      case "overview":
        return json({ ok: true, ...(await getOverview(Number(body.days || 30))) }, 200, origin);
      case "traffic": {
        const o = await getOverview(Number(body.days || 30));
        return json({ ok: true, traffic: o.traffic, engagement: o.engagement }, 200, origin);
      }
      case "funnels": {
        const o = await getOverview(Number(body.days || 30));
        return json({ ok: true, funnels: o.funnels, conversions: o.conversions }, 200, origin);
      }
      case "assets":
        return json({
          ok: true,
          assets: await selectJson(
            "assets?select=asset_name,asset_type,views,clicks,conversions,updated_at&order=views.desc&limit=50",
          ),
        }, 200, origin);
      case "products":
        return json({
          ok: true,
          products: await selectJson(
            "products?select=product_name,category,interest_count,views,updated_at&order=interest_count.desc&limit=50",
          ),
        }, 200, origin);
      case "recommend":
        return json({ ok: true, ...(await recommend(Number(body.days || 30))) }, 200, origin);
      default:
        return json({ ok: false, error: `Unknown action: ${action}` }, 400, origin);
    }
  } catch (error) {
    console.error("[analytics]", error);
    return json(
      { ok: false, error: error instanceof Error ? error.message : String(error) },
      500,
      origin,
    );
  }
});
