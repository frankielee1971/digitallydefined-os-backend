export type AgentSchema = {
  title: string;
  required: string[];
  properties: Record<string, { type: "string" | "number" | "boolean" | "array" | "object" }>;
};

export const AGENT_SCHEMAS: Record<string, AgentSchema> = {
  quiz: {
    title: "Digital Superpower Result",
    required: ["superpowerName", "superpowerDescription", "recommendedPathways", "confidenceScore"],
    properties: {
      superpowerName: { type: "string" },
      superpowerDescription: { type: "string" },
      recommendedPathways: { type: "array" },
      confidenceScore: { type: "number" },
    },
  },
  niche: {
    title: "Niche Discovery Result",
    required: ["niche", "keywords", "demand", "competition", "recommendation"],
    properties: {
      niche: { type: "string" },
      keywords: { type: "array" },
      demand: { type: "string" },
      competition: { type: "string" },
      recommendation: { type: "string" },
    },
  },
  roadmap: {
    title: "Personalized Faceless Asset Roadmap",
    required: ["steps", "estimatedTime", "tools", "nextAction"],
    properties: {
      steps: { type: "array" },
      estimatedTime: { type: "string" },
      tools: { type: "array" },
      nextAction: { type: "string" },
    },
  },
  reputation: {
    title: "Niche Reputation Intelligence",
    required: ["niche", "demandScore", "competitionScore", "reputationSignals", "recommendation"],
    properties: {
      niche: { type: "string" },
      demandScore: { type: "number" },
      competitionScore: { type: "number" },
      reputationSignals: { type: "array" },
      recommendation: { type: "string" },
    },
  },
  scorecard: {
    title: "Niche Scorecard Interpretation",
    required: ["summary", "strongestSignals", "riskFlags", "validationExperiments", "monetizationPaths", "nextAction"],
    properties: {
      summary: { type: "string" },
      strongestSignals: { type: "array" },
      riskFlags: { type: "array" },
      validationExperiments: { type: "array" },
      monetizationPaths: { type: "array" },
      nextAction: { type: "string" },
    },
  },
  "retirement-guide": {
    title: "Retirement Gap Interpretation",
    required: ["plainLanguageSummary", "planningSignals", "questionsToReview", "digitalAssetRole", "nextAction", "disclaimer"],
    properties: {
      plainLanguageSummary: { type: "string" },
      planningSignals: { type: "array" },
      questionsToReview: { type: "array" },
      digitalAssetRole: { type: "string" },
      nextAction: { type: "string" },
      disclaimer: { type: "string" },
    },
  },
  "asset-plan": {
    title: "Digital Asset Portfolio Interpretation",
    required: ["portfolioSummary", "assumptions", "concentrationRisks", "buildOrder", "nextAction", "disclaimer"],
    properties: {
      portfolioSummary: { type: "string" },
      assumptions: { type: "array" },
      concentrationRisks: { type: "array" },
      buildOrder: { type: "array" },
      nextAction: { type: "string" },
      disclaimer: { type: "string" },
    },
  },
  "offer-architect": {
    title: "Schema-Driven Offer Architecture",
    required: ["funnelStage", "offer", "validationChecklist", "nextAction"],
    properties: {
      funnelStage: { type: "string" },
      offer: { type: "object" },
      validationChecklist: { type: "array" },
      nextAction: { type: "string" },
    },
  },
};

const actualType = (value: unknown) => {
  if (Array.isArray(value)) return "array";
  if (value === null) return "null";
  return typeof value;
};

export function validateAgentOutput(schemaName: string, value: unknown) {
  const schema = AGENT_SCHEMAS[schemaName];
  const errors: string[] = [];
  if (!schema) return { valid: false, errors: [`Unknown schema: ${schemaName}`] };
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { valid: false, errors: [`${schema.title} must be an object`] };
  }

  const record = value as Record<string, unknown>;
  for (const field of schema.required) {
    if (record[field] === undefined || record[field] === null || record[field] === "") {
      errors.push(`Missing required field: ${field}`);
      continue;
    }
    const expected = schema.properties[field]?.type;
    const actual = actualType(record[field]);
    if (expected && actual !== expected) errors.push(`${field} must be ${expected}, received ${actual}`);
  }

  return { valid: errors.length === 0, errors };
}

export function schemaPrompt(schemaName: string) {
  const schema = AGENT_SCHEMAS[schemaName];
  if (!schema) throw new Error(`Unknown schema: ${schemaName}`);
  return JSON.stringify({
    title: schema.title,
    type: "object",
    required: schema.required,
    properties: Object.fromEntries(
      Object.entries(schema.properties).map(([key, definition]) => [key, { type: definition.type }]),
    ),
    additionalProperties: false,
  });
}
