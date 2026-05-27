// /api/backend.js

import { google } from "googleapis";
import { Client as NotionClient } from "@notionhq/client";

// These still live outside /api and do NOT count as functions:
import { getGoogleAuth } from "../_utils/googleAuth.js";
import { getFirestore } from "../_utils/firebaseAdmin.js";
import { routeTask } from "@/lib/antigravity/router";
import { TASK_TYPES } from "@/lib/antigravity/taskTypes";

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

// ─── Google Sheets ──────────────────────────────────────────────────────────

async function fetchSheetsData() {
  const sheetsUrl = process.env.SHEETS_WEBHOOK_URL;
  if (!sheetsUrl) return null;

  try {
    const res = await fetch(
      `${sheetsUrl}${sheetsUrl.includes("?") ? "&" : "?"}t=${Date.now()}`,
      { headers: { "Cache-Control": "no-store" } }
    );

    if (!res.ok) return null;
    return await res.json();
  } catch {
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
    // ── Simple health check (replaces status.js) ────────────────────────────
    if (!action || action === "status") {
      return res.status(200).json({
        status: "ok",
        message: "DigitallyDefined OS backend is running",
      });
    }

    // ── Auth verify (replaces auth/verify.ts) ───────────────────────────────
    if (action === "auth.verify") {
      if (!checkDashboardApiKey(req)) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      return res.status(200).json({ ok: true });
    }

    // ── AI Recommendations (static) ────────────────────────────────────────
    if (action === "ai.recommendations") {
      return res.status(200).json({
        recommendations: [
          "Update the Rank & Rent asset for 'CT Roofing' — competitor activity increased.",
          "Create a new review follow‑up workflow for Customer OS.",
          "Sync Vault — 12 new assets detected.",
        ],
      });
    }

    // ── Brain Brief (converted from edge) ──────────────────────────────────
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

    // ── Automation (replaces automation.js) ─────────────────────────────────
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

    // ── Dashboard payload (replaces dashboard.ts) ──────────────────────────
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

      const communityMetrics = {
        newMembers:
          community.filter((m) =>
            (m.status || "").toLowerCase().includes("new")
          ).length || community.length,
        activeMembers: community.filter(
          (m) => (m.activity || "").toLowerCase() === "active"
        ).length,
        engagementRate: safeString(
          sheetsData?.communityEngagementRate,
          "0%"
        ),
        welcomeCompletion: safeString(sheetsData?.welcomeCompletion, "0%"),
        topPosts,
      };

      const payload = {
        assetValue,
        communityCount,
        siteHealth,
        sentiment,
        reviews: sheetsData?.reviews || [],
        competitors: sheetsData?.competitors || [],
        community,
        leadMagnets: sheetsData?.leadMagnets || [],
        payments: sheetsData?.payments || [],
        campaigns,

        revenue,
        leads,
        communityGrowth,
        emailGrowth,
        conversionRate,
        topAsset,
        churnRisk,

        assets,
        email: {
          subscribers: spData.totalSubscribers,
          openRate: spData.emailOpenRate,
          clickRate: spData.emailClickRate,
          replyRate: spData.emailReplyRate,
          revenuePerCampaign: spData.emailRevenuePerCampaign,
          ...email,
        },

        aiBrief,
        alerts,
        communityMetrics,

        sourceHealth: {
          facebook: fbData.error ? "error" : "connected",
          sendpulse: spData.error ? "error" : "connected",
          sheets: sheetsData ? "connected" : "not_connected",
          openrouter: process.env.OPENROUTER_API_KEY
            ? "connected"
            : "not_connected",
        },

        meta: {
          groupName: fbData.name,
          groupMembers: communityCount,
        },

        lastUpdated: new Date().toISOString(),
      };

      return res.status(200).json(payload);
    }

    // ── Drive list (replaces drive/list.ts) ─────────────────────────────────
    if (action === "drive.list") {
      const { folderId } = req.query;

      if (!folderId || typeof folderId !== "string") {
        return res.status(400).json({ error: "Missing folderId" });
      }

      const scopes = ["https://www.googleapis.com/auth/drive.readonly"];
      const auth = getGoogleAuth(scopes);
      const drive = google.drive({ version: "v3", auth });

      const response = await drive.files.list({
        q: `'${folderId}' in parents and trashed = false`,
        fields: "files(id, name, mimeType)",
      });

      return res.status(200).json(response.data);
    }

    // ── Sheets read (replaces sheets/read.ts) ───────────────────────────────
    if (action === "sheets.read") {
      const { sheetId, range } = req.query;

      if (!sheetId || !range) {
        return res
          .status(400)
          .json({ error: "Missing sheetId or range" });
      }

      const auth = getGoogleAuth([
        "https://www.googleapis.com/auth/spreadsheets.readonly",
      ]);

      const sheets = google.sheets({ version: "v4", auth });

      const response = await sheets.spreadsheets.values.get({
        spreadsheetId: String(sheetId),
        range: String(range),
      });

      return res.status(200).json({
        values: response.data.values || [],
      });
    }

    // ── Firestore get (replaces firestore/get.ts) ───────────────────────────
    if (action === "firestore.get") {
      if (req.method !== "GET") {
        res.setHeader("Allow", "GET");
        return res.status(405).json({ error: "Method not allowed" });
      }

      const { collection, id } = req.query;

      if (!collection || typeof collection !== "string") {
        return res.status(400).json({ error: "Missing collection" });
      }

      if (!id || typeof id !== "string") {
        return res.status(400).json({ error: "Missing id" });
      }

      const snapshot = await getFirestore()
        .collection(collection)
        .doc(id)
        .get();

      if (!snapshot.exists) {
        return res.status(404).json({ error: "Document not found" });
      }

      return res.status(200).json({
        id: snapshot.id,
        data: snapshot.data(),
      });
    }

    // ── Analytics realtime (replaces analytics/realtime.ts) ────────────────
    if (action === "analytics.realtime") {
      const auth = getGoogleAuth([
        "https://www.googleapis.com/auth/analytics.readonly",
      ]);

      const analytics = google.analytics("v3");

      const response = await analytics.data.realtime.get({
        auth,
        ids: `ga:${process.env.GA_VIEW_ID}`,
        metrics: "rt:activeUsers",
      });

      return res.status(200).json({
        activeUsers:
          response.data.totalsForAllResults?.["rt:activeUsers"] || 0,
      });
    }

    // ── Chat (converted from edge chat.ts) ─────────────────────────────────
    if (action === "chat") {
      try {
        const { messages } = req.body || {};

        const response = await fetch(
          "https://openrouter.ai/api/v1/chat/completions",
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              model: "google/gemini-2.0-flash",
              messages: [
                {
                  role: "system",
                  content: `
You are DigitallyDefined AI — a calm, intelligent, editorial guide for Gen X women building digital independence, digital real estate, and recurring revenue. Your tone is grounded, sovereign, and high‑signal. You speak with clarity, warmth, and respect for the user’s intelligence and lived experience.

Your role:
- Help Gen X women understand digital leverage, digital real estate, automation, and online reputation.
- Translate complex digital concepts into clear, empowering explanations.
- Offer practical next steps without hype, pressure, or sales energy.
- Encourage sovereignty, clarity, and self‑trust.
- Maintain a faceless, cosmic‑minimalist aesthetic in your language — clean, intentional, and uncluttered.

Voice & Tone:
- Calm, confident, grounded.
- Editorial, not chatty.
- No fluff, no bro‑marketing, no exclamation marks unless truly needed.
- Short, intentional sentences.
- Respect autonomy. Never talk down to the user.
- Speak to Gen X women as peers — experienced, capable, discerning.

Brand Principles:
- High‑signal, low‑noise.
- Digital sovereignty over digital chaos.
- Practical clarity over motivational hype.
- Empowerment through understanding, not pressure.
- Faceless identity: avoid references to appearance, age, or physical traits.

Content Guidelines:
- Provide clear explanations and practical steps.
- When asked for strategy, give structured, actionable guidance.
- When asked for definitions, keep them crisp and intelligent.
- When asked for opinions, frame them as insights, not absolutes.
- When asked about tools or platforms, explain tradeoffs calmly.
- When asked about digital real estate, emphasize ownership, leverage, and long‑term value.
- When asked about automation, emphasize clarity, simplicity, and reducing cognitive load.

Boundaries:
- Never pretend to be human.
- Never use slang, hype language, or infantilizing tone.
- Never pressure the user to buy anything.
- Never use emojis unless the user uses them first.
- Never break the calm, sovereign editorial voice.

Your purpose:
Be the quiet, intelligent presence that helps Gen X women build digital superpowers — one clear insight at a time.
                  `,
                },
                ...(Array.isArray(messages) ? messages : []),
              ],
            }),
          }
        );

        const data = await response.json();

        const reply =
          data?.choices?.[0]?.message?.content ||
          "I'm here — ask me anything about digital real estate, automation, or building your digital sovereignty.";

        return res.status(200).json({ reply });
      } catch (err) {
        return res
          .status(200)
          .json({ reply: "Something went wrong. Try again." });
      }
    }

    // ── Create Customer OS (replaces create-customer.js) ────────────────────
    if (action === "customer.create") {
      if (req.method !== "POST") {
        return res.status(405).json({ error: "Method not allowed" });
      }

      const notion = new NotionClient({
        auth: process.env.NOTION_API_KEY,
      });

      try {
        const templateId = process.env.NOTION_CUSTOMER_TEMPLATE_ID;

        if (!templateId) {
          return res.status(500).json({
            error: "Missing NOTION_CUSTOMER_TEMPLATE_ID",
          });
        }

        const duplicated = await notion.pages.create({
          parent: { type: "page_id", page_id: templateId },
          properties: {},
        });

        return res.status(200).json({
          success: true,
          newPageId: duplicated.id,
          url: "url" in duplicated ? duplicated.url : undefined,
        });
      } catch (error) {
        console.error("Error duplicating customer OS:", error);
        return res.status(500).json({
          error: error.message || "Unknown error",
        });
      }
    }

    // ── Antigravity run (replaces run.js) ───────────────────────────────────
    if (action === "run.task") {
      if (req.method !== "POST") {
        return res.status(405).json({ error: "Method not allowed" });
      }

      try {
        const { taskType, input } = req.body || {};

        if (!taskType) {
          return res.status(400).json({ error: "Missing taskType" });
        }

        const validTypes = Object.values(TASK_TYPES);
        if (!validTypes.includes(taskType)) {
          return res.status(400).json({
            error: `Invalid taskType: ${taskType}`,
            validTypes,
          });
        }

        const agentId = routeTask({ type: taskType });

        const payload = {
          agentId,
          input,
          metadata: {
            taskType,
            timestamp: new Date().toISOString(),
            source: "digitallydefined-backend",
          },
        };

        const response = await fetch(process.env.ANTIGRAVITY_ENDPOINT, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });

        const data = await response.json();

        return res.status(200).json({
          success: true,
          agentId,
          taskType,
          result: data,
        });
      } catch (error) {
        console.error("Antigravity run error:", error);
        return res.status(500).json({
          success: false,
          error: error.message || "Unknown error",
        });
      }
    }

    // ── Fallback for unknown actions ────────────────────────────────────────
    return res.status(400).json({
      status: "error",
      message: "Invalid or unsupported action",
      action,
    });
  } catch (err) {
    console.error("Unified backend error:", err);
    return res.status(500).json({
      status: "error",
      message: "Internal server error",
    });
  }
}
