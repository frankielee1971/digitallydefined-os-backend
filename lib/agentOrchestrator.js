import { digitalSuperpowerAgent } from "../agents/digitalSuperpowerAgent.js";
import { trendAnalyzer } from "../agents/trendAnalyzer.js";
import { competitionAnalyzer } from "../agents/competitionAnalyzer.js";
import { opportunityScanner } from "../agents/opportunityScanner.js";
import { audienceInsightAgent } from "../agents/audienceInsightAgent.js";

/**
 * Agent Orchestrator
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
  const superpowerPackage = await digitalSuperpowerAgent(quizAnswers);

  // Extract the niche from the roadmap or persona
  const niche =
    superpowerPackage.superpower ||
    superpowerPackage.persona ||
    "digital business";

  // Step 2: Run trend analysis
  const trends = await trendAnalyzer(niche);

  // Step 3: Run competition analysis
  const competition = await competitionAnalyzer(niche);

  // Step 4: Run opportunity scanning
  const opportunities = await opportunityScanner(niche);

  // Step 5: Run audience insights
  const audience = await audienceInsightAgent(niche);

  // Step 6: Build unified intelligence package
  return {
    superpower: superpowerPackage.superpowerName,
    superpowerName: superpowerPackage.superpowerName,
    superpowerDescription: superpowerPackage.superpowerDescription,
    persona: superpowerPackage.persona,
    strengths: superpowerPackage.strengths,
    blindspots: superpowerPackage.blindspots,
    businessModel: superpowerPackage.businessModel,
    recommendedPathways: superpowerPackage.recommendedPathways,
    confidenceScore: superpowerPackage.confidenceScore,
    roadmap: {
      steps: superpowerPackage.steps,
      estimatedTime: superpowerPackage.estimatedTime,
      tools: superpowerPackage.tools,
      aiTools: superpowerPackage.aiTools,
      nextAction: superpowerPackage.nextAction,
    },
    profitabilityScore: superpowerPackage.profitabilityScore,
    competitionLevel: superpowerPackage.competitionLevel,
    trendStrength: superpowerPackage.trendStrength,
    nicheViability: superpowerPackage.nicheViability,
    audienceInsight: superpowerPackage.audienceInsight,
    opportunityGaps: superpowerPackage.opportunityGaps,
    privacyNeeds: superpowerPackage.privacyNeeds,
    energyLevel: superpowerPackage.energyLevel,
    burnoutRisk: superpowerPackage.burnoutRisk,
    aiTools: superpowerPackage.aiTools,

    trends,
    competition,
    opportunities,
    audience
  };
}
