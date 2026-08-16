// src/index.js
// DigitallyDefined backend entry point.
// Runs as a Node server (npm start) and exports an Express app for Vercel serverless.
// Wires the quiz, superpower, intelligence, roadmap, scorecard, and trends routes.

import express from "express";
import cors from "cors";
import "dotenv/config";

import quizHandler from "./handlers/quiz.js";
import intelligenceRouter from "./handlers/intelligence.js";
import roadmapHandler from "./handlers/roadmap.js";

const app = express();
app.use(cors());
app.use(express.json({ limit: "2mb" }));

const api = express.Router();

// Quiz → digitalSuperpowerAgent (answers → superpower profile + roadmap)
api.post("/quiz", (req, res) => quizHandler(req, res));
api.post("/superpower", (req, res) => quizHandler(req, res)); // same pipeline, clearer name

// Intelligence → full 6-agent aggregate (superpower, roadmap, trends, competition, opportunity, audience)
api.use("/intelligence", intelligenceRouter);

// Roadmap persistence
api.get("/roadmap", (req, res) => roadmapHandler(req, res));
api.post("/roadmap", (req, res) => roadmapHandler(req, res));

// Niche profitability scorecard interpretation (1-10 / 1-20 style inputs)
api.post("/scorecard", async (req, res) => {
  try {
    const { scores, nicheName } = req.body || {};
    if (!scores || typeof scores !== "object") {
      return res.status(400).json({ success: false, error: "Missing scorecard scores" });
    }
    // Reuse the quiz agent pipeline with the supplied market signals so the roadmap
    // builder receives profitability, competition, trend, viability, and AI-tool context.
    const { digitalSuperpowerAgent } = await import("../agents/digitalSuperpowerAgent.js");
    const profile = await digitalSuperpowerAgent({
      ...(req.body || {}),
      profitabilityScore: req.body.profitabilityScore,
      competitionLevel: req.body.competitionLevel,
      trendStrength: req.body.trendStrength,
      nicheViability: req.body.nicheViability,
      aiTools: req.body.aiTools,
    });
    return res.json({ success: true, data: profile });
  } catch (err) {
    return res.status(500).json({ success: false, error: err?.message || String(err) });
  }
});

app.get("/health", (_req, res) => res.json({ ok: true, status: "running" }));
app.use("/api", api);

// Only listen when running as a Node process (not under Vercel serverless).
if (!process.env.VERCEL) {
  const port = process.env.PORT || 3001;
  app.listen(port, () => console.log(`[backend] listening on :${port}`));
}

export default app;