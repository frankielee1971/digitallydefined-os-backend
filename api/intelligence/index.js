import express from "express";
import { runIntelligencePipeline } from "../../lib/agentOrchestrator.js";
import { supabase } from "../../lib/supabaseClient.js";

const router = express.Router();

router.post("/", async (req, res) => {
  try {
    const { answers, userId } = req.body;

    if (!answers) {
      return res.status(400).json({
        success: false,
        error: "Missing quiz answers"
      });
    }

    // Run full intelligence pipeline
    const intelligence = await runIntelligencePipeline(answers);

    // Store quiz results
    await supabase.from("quiz_results").insert({
      user_id: userId,
      answers,
      superpower: intelligence.superpower,
      persona: intelligence.persona,
      strengths: intelligence.strengths,
      blindspots: intelligence.blindspots,
      business_model: intelligence.businessModel
    });

    // Store roadmap
    await supabase.from("quiz_roadmaps").insert({
      user_id: userId,
      roadmap: intelligence.roadmap
    });

    // Store trends
    await supabase.from("trends").insert({
      user_id: userId,
      data: intelligence.trends
    });

    // Store competition
    await supabase.from("competition").insert({
      user_id: userId,
      data: intelligence.competition
    });

    // Store opportunities
    await supabase.from("opportunities").insert({
      user_id: userId,
      data: intelligence.opportunities
    });

    // Store audience insights
    await supabase.from("audience_insights").insert({
      user_id: userId,
      data: intelligence.audience
    });

    res.json({
      success: true,
      data: intelligence
    });
  } catch (err) {
    console.error("Intelligence API Error:", err);

    res.status(500).json({
      success: false,
      error: "Failed to generate intelligence package"
    });
  }
});

export default router;
