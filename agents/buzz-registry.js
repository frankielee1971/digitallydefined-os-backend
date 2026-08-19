/**
 * Buzz Agent Registry
 * Maps agent keys to their implementations.
 *
 * NOTE: The previous version imported from per-agent subfolders
 * (./digital-superpower-quiz/agent.js etc.) that do not exist in this repo.
 * This registry now wires to the real, implemented agents in this backend.
 */

import { digitalSuperpowerAgent } from './digitalSuperpowerAgent.js';
import { roadmapAgent } from './roadmapAgent.js';
import { audienceInsightAgent } from './audienceInsightAgent.js';
import { competitionAnalyzer } from './competitionAnalyzer.js';
import { trendAnalyzer } from './trendAnalyzer.js';
import { opportunityScanner } from './opportunityScanner.js';
import { hermesBrandBuilderPrompt } from './hermesBrandBuilder.js';
import { hermesQualityAssurance } from './hermesQualityAssurance.js';

export const agentRegistry = {
  // Core agents
  'digital-superpower-quiz': digitalSuperpowerAgent,
  'roadmap-generator': roadmapAgent,
  'audience-insight': audienceInsightAgent,
  'competition-analyzer': competitionAnalyzer,
  'trend-analyzer': trendAnalyzer,
  'opportunity-scanner': opportunityScanner,
  'hermes-brand-builder': hermesBrandBuilderPrompt,
  'hermes-quality-assurance': hermesQualityAssurance,
};

/**
 * Get an agent by key
 */
export function getAgent(agentKey) {
  return agentRegistry[agentKey];
}

/**
 * List all available agents
 */
export function listAgents() {
  return Object.keys(agentRegistry).map((key) => ({
    key,
    name: key.replace(/-/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase()),
  }));
}

export default { agentRegistry, getAgent, listAgents };
