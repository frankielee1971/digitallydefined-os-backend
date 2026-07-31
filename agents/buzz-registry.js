/**
 * Buzz Agent Registry
 * Maps agent keys to their implementations
 */

import { quizAgent } from './digital-superpower-quiz/agent.js';
import { reputationIntelligence } from './reputation-intelligence/agent.js';
import { roadmapGenerator } from './roadmap-generator/agent.js';
import { aiRankandRentBuilder } from './ai-rankand-rent-builder/agent.js';
import { contentRepurposer } from './content-repurposer/agent.js';
import { nicheKeywordDiscovery } from './niche-keyword-discovery/agent.js';
import { jsonSchemaGenerator } from './json-schema-generator/agent.js';
import { digitalWealthCalculator } from './digital-wealth-calculator/agent.js';
import { facebookCommunityAgent } from './facebook-community-agent/agent.js';

export const agentRegistry = {
  // Core agents
  'digital-superpower-quiz': quizAgent,
  'reputation-intelligence': reputationIntelligence,
  'roadmap-generator': roadmapGenerator,
  'ai-rankand-rent-builder': aiRankandRentBuilder,
  'content-repurposer': contentRepurposer,
  'niche-keyword-discovery': nicheKeywordDiscovery,
  'json-schema-generator': jsonSchemaGenerator,
  'digital-wealth-calculator': digitalWealthCalculator,
  'facebook-community-agent': facebookCommunityAgent,
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
