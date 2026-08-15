/**
 * OmniRoute Agent Registry
 * Central registry for all Hermes agents
 * 
 * Each agent has a unique key, name, description, and system prompt.
 * Agents are callable via OmniRoute using their agentKey.
 */

import { hermesBrandBuilderPrompt } from './hermesBrandBuilder.js';
import { hermesQualityAssurance } from './hermesQualityAssurance.js';
import { digitalSuperpowerAgent } from './digitalSuperpowerAgent.js';
import { roadmapAgent } from './roadmapAgent.js';
import { audienceInsightAgent } from './audienceInsightAgent.js';
import { competitionAnalyzer } from './competitionAnalyzer.js';
import { trendAnalyzer } from './trendAnalyzer.js';
import { opportunityScanner } from './opportunityScanner.js';

/**
 * Agent Registry
 * Add new agents here to make them available system-wide
 */
export const agents = {
  /**
   * Hermes Brand Builder
   * Visual identity architect for the entire DigitallyDefined ecosystem
   * Enforces the official Soft Brutalism brand system
   */
  hermes_brand_builder: {
    name: "Hermes Brand Builder",
    description: "Applies DigitallyDefined's official brand system to all design outputs.",
    systemPrompt: hermesBrandBuilderPrompt,
    category: "design",
    version: "1.0.0"
  },

  /**
   * Hermes Quality Assurance
   * Final review agent that checks all work before publishing
   */
  hermes_quality_assurance: hermesQualityAssurance,

  /**
   * Core intelligence agents — wired into the orchestrator, quiz API, and
   * intelligence pipeline.
   */
  digital_superpower: {
    name: "Digital Superpower",
    description: "Interprets quiz answers and returns the user's superpower profile plus a personalized roadmap.",
    fn: digitalSuperpowerAgent,
    category: "intelligence",
    version: "1.0.0"
  },
  roadmap: {
    name: "Roadmap",
    description: "Generates a faceless digital real estate roadmap from a superpower profile and market signals.",
    fn: roadmapAgent,
    category: "intelligence",
    version: "1.0.0"
  },
  audience_insight: {
    name: "Audience Insight",
    description: "Extracts audience pain points, desires, motivations, and buying triggers.",
    fn: audienceInsightAgent,
    category: "intelligence",
    version: "1.0.0"
  },
  competition_analyzer: {
    name: "Competition Analyzer",
    description: "Evaluates competitors, strengths, weaknesses, and positioning.",
    fn: competitionAnalyzer,
    category: "intelligence",
    version: "1.0.0"
  },
  trend_analyzer: {
    name: "Trend Analyzer",
    description: "Analyzes niche trends, rising topics, and platform momentum.",
    fn: trendAnalyzer,
    category: "intelligence",
    version: "1.0.0"
  },
  opportunity_scanner: {
    name: "Opportunity Scanner",
    description: "Identifies gaps, underserved audiences, and unmet needs.",
    fn: opportunityScanner,
    category: "intelligence",
    version: "1.0.0"
  },
};

/**
 * Get agent by key
 * @param {string} agentKey - The agent key (e.g., 'hermes_brand_builder')
 * @returns {object|null} Agent configuration or null if not found
 */
export function getAgent(agentKey) {
  return agents[agentKey] || null;
}

/**
 * List all registered agents
 * @returns {Array} Array of agent keys
 */
export function listAgents() {
  return Object.keys(agents);
}

/**
 * Validate agent key exists
 * @param {string} agentKey - The agent key to validate
 * @returns {boolean} True if agent exists
 */
export function isValidAgent(agentKey) {
  return agentKey in agents;
}

export default agents;