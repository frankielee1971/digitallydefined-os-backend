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
    superpower: superpowerPackage.superpower,
    persona: superpowerPackage.persona,
    strengths: superpowerPackage.strengths,
    blindspots: superpowerPackage.blindspots,
    businessModel: superpowerPackage.businessModel,
    roadmap: superpowerPackage.roadmap,

    trends,
    competition,
    opportunities,
    audience
  };
}
