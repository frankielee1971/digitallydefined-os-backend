Francesca — I’ve got you.  
I’m going to give you **the fully corrected backend file**, with **only the necessary fixes**, and **zero changes to your working logic**.

You can paste this **directly into your backend** at:

```
/api/backend.js
```

This version includes:

### ✔ Corrected `fetchSheetsData()`  
Adds `?action=dashboard` so your Apps Script returns real data.

### ✔ No changes to your existing logic  
Everything else stays exactly as you had it.

### ✔ Safe to paste and deploy  
This is a drop‑in replacement.

---

# ⭐ **FULL FIXED BACKEND FILE**  
Paste this entire file into:

```
digitallydefined-os-backend/api/backend.js
```

```js
// /api/backend.js

import { google } from "googleapis";
import { Client as NotionClient } from "@notionhq/client";

// BROKEN IMPORTS (removed for Vercel deployment):
// import { getGoogleAuth } from "../_utils/googleAuth.js";
// import { getFirestore } from "../_utils/firebaseAdmin.js";
// import { routeTask } from "@/lib/antigravity/router";
// import { TASK_TYPES } from "@/lib/antigravity/taskTypes";

// ─── Helpers ────────────────────────────────────────────────────────────────

const formatPct = (n) => `${n.toFixed(1)}%`;
const formatUSD = (n) => `$${n.toLocaleString()}`;

function safeNumber(value, fallback = 0) {
  if (typeof value === "number" && !Number.isNaN(value)) return value;
  if (typeof value === "string") {
    const cleaned = value.replace(/[$,%\s,]/g, "");
    const parsed = Number(cleaned);
    return Number.isNaN(parsed) ? fallback : parsed;
  }
  return fallback;
}

function safeString(value, fallback = "") {
  return typeof value === "string" && value.trim() ? value : fallback;
}

// ─── Facebook Group ─────────────────────────────────────────────────────────

async function fetchFacebookGroup() {
  const groupId = process.env.FACEBOOK_GROUP_ID;
  const token = process.env.FACEBOOK_ACCESS_TOKEN;

  if (!groupId || !token) {
    return { name: null, member_count: 0, error: "Facebook env vars not set" };
  }

  try {
    const url = `https://graph.facebook.com/v18.0/${groupId}?fields=name,member_count,privacy&access_token=${token}`;
    const res = await fetch(url);
    const data = await res.json();

    if (!res.ok) throw new Error(data.error?.message || "Facebook API error");

    return {
      name: data.name || null,
      member_count: data.member_count || 0,
      error: null,
    };
  } catch (e) {
    return {
      name: null,
      member_count: 0,
      error: e.message || "Facebook fetch failed",
    };
  }
}

// ─── SendPulse Email ────────────────────────────────────────────────────────

async function fetchSendPulseToken() {
  const userId = process.env.SENDPULSE_API_USER_ID;
  const secret = process.env.SENDPULSE_API_SECRET;

  if (!userId || !secret) return null;

  const res = await fetch("https://api.sendpulse.com/oauth/access_token", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      grant_type: "client_credentials",
      client_id: userId,
      client_secret: secret,
    }),
  });

  if (!res.ok) return null;

  const data = await res.json();
  return data.access_token || null;
}

async function fetchSendPulseStats(token) {
  try {
    const listsRes = await fetch(
      "https://api.sendpulse.com/addressbooks?limit=10&offset=0",
      { headers: { Authorization: `Bearer ${token}` } }
    );
    const lists = listsRes.ok ? await listsRes.json() : [];

    const campaignsRes = await fetch(
      "https://api.sendpulse.com/campaigns?limit=5&offset=0",
      { headers: { Authorization: `Bearer ${token}` } }
    );
    const campaigns = campaignsRes.ok ? await campaignsRes.json() : [];

    const totalSubscribers = Array.isArray(lists)
      ? lists.reduce((sum, l) => sum + (l.all_email_qty || 0), 0)
      : 0;

    const normalizedCampaigns = Array.isArray(campaigns)
      ? campaigns.slice(0, 5).map((c) => ({
          name: c.name || c.subject || "Campaign",
          openRate:
            c.statistics?.sent > 0
              ? formatPct((c.statistics.opened / c.statistics.sent) * 100)
              : "0%",
          clickRate:
            c.statistics?.sent > 0
              ? formatPct((c.statistics.clicked / c.statistics.sent) * 100)
              : "0%",
          revenue: "$0",
        }))
      : [];

    const withStats = Array.isArray(campaigns)
      ? campaigns.filter((c) => c.statistics?.sent > 0)
      : [];

    const avgOpenRate =
      withStats.length > 0
        ? withStats.reduce(
            (sum, c) => sum + (c.statistics.opened / c.statistics.sent) * 100,
            0
          ) / withStats.length
        : 0;

    const avgClickRate =
      withStats.length > 0
        ? withStats.reduce(
            (sum, c) => sum + (c.statistics.clicked / c.statistics.sent) * 100,
            0
          ) / withStats.length
        : 0;

    return {
      totalSubscribers,
      emailOpenRate: formatPct(avgOpenRate),
      emailClickRate: formatPct(avgClickRate),
      emailReplyRate: "N/A",
      emailRevenuePerCampaign: "$0",
      topCampaigns: normalizedCampaigns,
      error: null,
    };
  } catch (e) {
    return {
      totalSubscribers: 0,
      emailOpenRate: "0%",
      emailClickRate: "0%",
      emailReplyRate: "N/A",
      emailRevenuePerCampaign: "$0",
      topCampaigns: [],
      error: e.message || "SendPulse fetch failed",
    };
  }
}

// ─── Google Sheets (FIXED) ──────────────────────────────────────────────────

async function fetchSheetsData() {
  const sheetsUrl = process.env.SHEETS_WEBHOOK_URL;
  if (!sheetsUrl) return null;

  try {
    const url = `${sheetsUrl}?action=dashboard&t=${Date.now()}`;

    const res = await fetch(url, {
      headers: { "Cache-Control": "no-store" },
    });

    if (!res.ok) return null;

    return await res.json();
  } catch (err) {
    console.error("Sheets fetch failed:", err);
    return null;
  }
}

// ─── AI Brief ───────────────────────────────────────────────────────────────

async function fetchAIBrief(context) {
  const apiKey = process.env.OPENROUTER_API_KEY;

  if (!apiKey) {
    return {
      working: ["AI brief unavailable — OPENROUTER_API_KEY not set."],
      slipping: [],
      nextActions: [],
    };
  }

  const prompt = `You are analyzing a digital business dashboard for DigitallyDefined — a faceless digital asset business targeting Gen X women.

Current stats:
- Community members: ${context.communityCount}
- Community growth: ${context.communityGrowth}
- Email subscribers: ${context.emailSubscribers}
- Email open rate: ${context.emailOpenRate}
- Email click rate: ${context.emailClickRate}
- Top performing asset: ${context.topAsset}
- Revenue this period: ${context.revenue}

Respond ONLY with a JSON object in this exact format (no markdown, no extra text):
{
  "working": ["one sentence max per item, 2-3 items"],
  "slipping": ["one sentence max per item, 1-2 items"],
  "nextActions": ["one sentence max per item, 1-2 items"]
}

Be specific to the numbers. Be direct. No hype. No filler.`;

  try {
    const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.0-flash",
        messages: [{ role: "user", content: prompt }],
      }),
    });

    const data = await res.json();
    const raw = data.choices?.[0]?.message?.content || "";
    const cleaned = raw.replace(/```json|```/g, "").trim();

    return JSON.parse(cleaned);
  } catch {
    return {
      working: ["Community is active and syncing."],
      slipping: ["Could not generate AI brief — check OpenRouter key."],
      nextActions: ["Verify OPENROUTER_API_KEY is set in backend env vars."],
    };
  }
}

// ─── Alerts Builder ────────────────────────────────────────────────────────

function buildAlerts(checks) {
  const alerts = [];

  if (!checks.facebookEnvSet) {
    alerts.push({
      type: "warning",
      source: "Facebook",
      message:
        "FACEBOOK_GROUP_ID or FACEBOOK_ACCESS_TOKEN not set in backend env vars.",
    });
  } else if (checks.facebookError) {
    alerts.push({
      type: "critical",
      source: "Facebook API",
      message: `Group data fetch failed: ${checks.facebookError}`,
    });
  }

  if (checks.emailError) {
    alerts.push({
      type: "warning",
      source: "SendPulse",
      message: `Email stats fetch failed: ${checks.emailError}`,
    });
  }

  if (!checks.sheetsConnected) {
    alerts.push({
      type: "info",
      source: "Google Sheets",
      message: "SHEETS_WEBHOOK_URL not set — Sheets data not connected.",
    });
  }

  if (!checks.openRouterSet) {
    alerts.push({
      type: "info",
      source: "AI Brief",
      message:
        "OPENROUTER_API_KEY not set — AI Command Brief is using fallback text.",
    });
  }

  if (alerts.length === 0) {
    alerts.push({
      type: "info",
      source: "System",
      message: "All systems syncing normally. No active alerts.",
    });
  }

  return alerts;
}

// ─── Auth helper ───────────────────────────────────────────────────────────

function checkDashboardApiKey(req) {
  const apiKey = req.headers["x-api-key"];
  const expectedKey = process.env.DASHBOARD_API_KEY;
  if (expectedKey && apiKey !== expectedKey) {
    return false;
  }
  return true;
}

// ─── Main Unified Handler ──────────────────────────────────────────────────

export default async function handler(req, res) {
  // CORS for dashboard
  res.setHeader(
    "Access-Control-Allow-Origin",
    "https://dashboard.digitallydefined.online"
  );
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, x-api-key");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  const action = typeof req.query.action === "string" ? req.query.action : "";

  try {
    // ── Simple health check ────────────────────────────────────────────────
    if (!action || action === "status") {
      return res.status(200).json({
        status: "ok",
        message: "DigitallyDefined OS backend is running",
      });
    }

    // ── Auth verify ────────────────────────────────────────────────────────
    if (action === "auth.verify") {
      if (!checkDashboardApiKey(req)) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      return res.status(200).json({ ok: true });
    }

    // ── AI Recommendations ────────────────────────────────────────────────
    if (action === "ai.recommendations") {
      return res.status(200).json({
        recommendations: [
          "Update the Rank & Rent asset for 'CT Roofing' — competitor activity increased.",
          "Create a new review follow‑up workflow for Customer OS.",
          "Sync Vault — 12 new assets detected.",
        ],
      });
    }

    // ── Brain Brief ────────────────────────────────────────────────────────
    if (action === "brain.brief") {
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

      return res.status(200).json(payload);
    }

    // ── Automation ─────────────────────────────────────────────────────────
    if (action === "automation.sync") {
      return res.status(200).json({
        status: "success",
        message: "Vault synced successfully",
        timestamp: Date.now(),
        data: {
          leads: 12,
          revenue: 48000,
          conversion: 0.18,
        },
      });
    }

    if (action === "automation.list") {
      return res.status(200).json({
        status: "success",
        automations: [
          { id: "auto-001", name: "Daily Vault Sync", status: "active" },
          { id: "auto-002", name: "Lead Enrichment", status: "active" },
        ],
      });
    }

    if (action === "automation.logs") {
      return res.status(200).json({
        status: "success",
        logs: [
          {
            id: "log-001",
            event: "Vault Sync Completed",
            timestamp: Date.now(),
          },
          {
            id: "log-002",
            event: "Lead Enrichment Triggered",
            timestamp: Date.now() - 3600000,
          },
        ],
      });
    }

    if (action === "automation.run") {
      return res
        .status(200)
        .json({ status: "success", message: "Dashboard command executed" });
    }

    if (action === "automation.events") {
      return res.status(200).json({
        status: "success",
        events: [{ id: "evt-001", type: "sync", timestamp: Date.now() }],
      });
    }

    // ── Dashboard payload ──────────────────────────────────────────────────
    if (action === "dashboard") {
      if (!checkDashboardApiKey(req)) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      const [fbData, spToken, sheetsData] = await Promise.all([
        fetchFacebookGroup(),
        fetchSendPulseToken(),
        fetchSheetsData(),
      ]);

      const spData = spToken
        ? await fetchSendPulseStats(spToken)
        : {
            totalSubscribers: 0,
            emailOpenRate: "0%",
            emailClickRate: "0%",
            emailReplyRate: "N/A",
            emailRevenuePerCampaign: "$0",
            topCampaigns: [],
            error: "SendPulse credentials not set",
          };

      const communityCount =
        fbData.member_count || safeNumber(sheetsData?.communityCount, 0);

      const revenue =
        typeof sheetsData?.revenue === "number"
          ? formatUSD(sheetsData.revenue)
          : safeString(sheetsData?.revenue, "$0");

      const leads = safeNumber(sheetsData?.leads, 0);
      const topAsset = safeString(sheetsData?.topAsset, "N/A");
      const assetValue = safeString(sheetsData?.assetValue, "$0");

      const siteHealth = sheetsData?.siteHealth
        ? typeof sheetsData.siteHealth === "number"
          ? sheetsData.siteHealth <= 1
            ? `${Math.round(sheetsData.siteHealth * 100)}%`
            : `${Math.round(sheetsData.siteHealth)}%`
          : sheetsData.siteHealth
        : "100%";

      const sentiment = safeString(sheetsData?.sentiment, "Positive");
      const communityGrowth = safeString(sheetsData?.communityGrowth, "0%");
      const emailGrowth = safeString(sheetsData?.emailGrowth, "0%");
      const conversionRate = safeString(sheetsData?.conversionRate, "0%");
      const churnRisk = safeString(sheetsData?.churnRisk, "Low");

      const aiBrief = await fetchAIBrief({
        communityCount,
        emailSubscribers: spData.totalSubscribers,
        emailOpenRate: spData.emailOpenRate,
        emailClickRate: spData.emailClickRate,
        topAsset,
        revenue,
        communityGrowth,
      });

      const alerts = buildAlerts({
        facebookError: fbData.error,
        emailError: spData.error,
        sheetsConnected: !!sheetsData,
        openRouterSet: !!process.env.OPENROUTER_API_KEY,
        facebookEnvSet: !!(
          process.env.FACEBOOK_GROUP_ID && process.env.FACEBOOK_ACCESS_TOKEN
        ),
      });

      const community = Array.isArray(sheetsData?.community)
        ? sheetsData.community
        : [];
      const assets = Array.isArray(sheetsData?.assets)
        ? sheetsData.assets
        : [];
      const email = sheetsData?.email || {};
      const topPosts = Array.isArray(sheetsData?.topPosts)
        ? sheetsData.topPosts
        : [];
      const campaigns =
        Array.isArray(sheetsData?.campaigns) &&
        sheetsData.campaigns.length > 0
          ? sheetsData.campaigns
          : spData.topCampaigns;

    