/**
 * OmniRoute Agent Registry
 * Central registry for all Hermes agents
 * 
 * Each agent has a unique key, name, description, and system prompt.
 * Agents are callable via OmniRoute using their agentKey.
 */

import { hermesBrandBuilderPrompt } from './hermesBrandBuilder.js';
import { hermesQualityAssurance } from './hermesQualityAssurance.js';

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

  // Future agents can be added here:
  // hermes_main: { ... },
  // hermes_researcher: { ... },
  // hermes_writer: { ... },
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