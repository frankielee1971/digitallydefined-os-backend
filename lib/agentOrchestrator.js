import { digitalSuperpowerAgent } from "../agents/digitalSuperpowerAgent.js";
import { trendAnalyzer } from "../agents/trendAnalyzer.js";
import { competitionAnalyzer } from "../agents/competitionAnalyzer.js";
import { opportunityScanner } from "../agents/opportunityScanner.js";
import { audienceInsightAgent } from "../agents/audienceInsightAgent.js";

/**
 * DigitallyDefined Intelligence Orchestrator
 * Runs the full intelligence pipeline:
 * 1. Quiz → Superpower Profile
 * 2. Roadmap Generation
 * 3. Trend Analysis
 * 4. Competition Analysis
 * 5. Opportunity Scanning
 * 6. Audience Insights
 */
export async function runIntelligencePipeline(quizAnswers) {
  // Step 1: Run the quiz + roadmap agent
  const pkg = await digitalSuperpowerAgent(quizAnswers);

  // Extract niche correctly
  const niche =
    pkg.niche ||
    pkg.personaNiche ||
    pkg.superpowerNiche ||
    "digital business";

  // Step 2: Trend analysis
  const trends = await trendAnalyzer(niche);

  // Step 3: Competition analysis
  const competition = await competitionAnalyzer(niche);

  // Step 4: Opportunity scanning
  const opportunities = await opportunityScanner(niche);

  // Step 5: Audience insights
  const audience = await audienceInsightAgent(niche);

  // Step 6: Build unified intelligence package
  return {
    // Identity
    superpowerName: pkg.superpowerName,
    superpowerDescription: pkg.superpowerDescription,
    persona: pkg.persona,
    personaDescription: pkg.personaDescription,

    // Strengths & blindspots
    strengths: pkg.strengths,
    blindspots: pkg.blindspots,

    // Business model
    businessModel: pkg.businessModel,
    recommendedPathways: pkg.recommendedPathways,

    // Emotional signals
    confidenceScore: pkg.confidenceScore,
    energyLevel: pkg.energyLevel,
    burnoutRisk: pkg.burnoutRisk,
    privacyNeeds: pkg.privacyNeeds,
    overwhelmLevel: pkg.overwhelmLevel || null,
    readinessLevel: pkg.readinessLevel || null,
    facelessComfort: pkg.facelessComfort || null,

    // Niche & viability
    niche,
    profitabilityScore: pkg.profitabilityScore,
    competitionLevel: pkg.competitionLevel,
    trendStrength: pkg.trendStrength,
    nicheViability: pkg.nicheViability,
    audienceInsight: pkg.audienceInsight,
    opportunityGaps: pkg.opportunityGaps,

    // Roadmap
    roadmap: {
      steps: pkg.roadmapSteps || pkg.steps || [],
      estimatedTime: pkg.estimatedTime,
      tools: pkg.tools,
      aiTools: pkg.aiTools,
      nextAction: pkg.nextAction,
    },

    // Intelligence modules
    trends,
    competition,
    opportunities,
    audience,
  };
}
