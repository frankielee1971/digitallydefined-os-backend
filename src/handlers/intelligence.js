import express from 'express';
import { runIntelligencePipeline } from '../../lib/agentOrchestrator.js';
import { supabase } from '../../lib/supabaseClient.js';

const router = express.Router();

router.post('/', async (req, res) => {
  try {
    const { answers, userId } = req.body;

    if (!answers) {
      return res.status(400).json({
        success: false,
        error: 'Missing quiz answers',
      });
    }

    const intelligence = await runIntelligencePipeline(answers);

    const guardInsert = async (table, payload) => {
      try {
        await supabase.from(table).insert(payload);
      } catch (e) {
        console.warn(`[intelligence] Skipped store to "${table}":`, e?.message || e);
      }
    };

    await guardInsert('superpower_profiles', {
      user_id: userId,
      superpower_name: intelligence.superpowerName,
      persona: intelligence.persona,
      strengths: intelligence.strengths,
      blindspots: intelligence.blindspots,
      business_model: intelligence.businessModel,
      recommended_pathways: intelligence.recommendedPathways,
      confidence_score: intelligence.confidenceScore,
      data: intelligence,
    });

    await guardInsert('quiz_results', {
      user_id: userId,
      answers,
      superpower: intelligence.superpower,
      persona: intelligence.persona,
      strengths: intelligence.strengths,
      blindspots: intelligence.blindspots,
      business_model: intelligence.businessModel,
    });

    await guardInsert('quiz_roadmaps', {
      user_id: userId,
      roadmap: intelligence.roadmap,
    });

    await guardInsert('intelligence_results', {
      user_id: userId,
      data: intelligence,
    });

    if (intelligence.profitabilityScore != null) {
      await guardInsert('niche_scores', {
        user_id: userId,
        profitability_score: intelligence.profitabilityScore,
        competition_level: intelligence.competitionLevel,
        trend_strength: intelligence.trendStrength,
        niche_viability: intelligence.nicheViability,
        data: intelligence,
      });
    }

    await guardInsert('trends', {
      user_id: userId,
      data: intelligence.trends,
    });

    await guardInsert('competition', {
      user_id: userId,
      data: intelligence.competition,
    });

    await guardInsert('opportunities', {
      user_id: userId,
      data: intelligence.opportunities,
    });

    await guardInsert('audience_insights', {
      user_id: userId,
      data: intelligence.audience,
    });

    res.json({
      success: true,
      data: intelligence,
    });
  } catch (err) {
    console.error('Intelligence API Error:', err);

    res.status(500).json({
      success: false,
      error: 'Failed to generate intelligence package',
    });
  }
});

export default router;
