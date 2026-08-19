export const digitalSuperpowerRoadmapSchema = {
  type: "object",
  required: [
    "superpower",
    "persona",
    "coreStrengths",
    "blindspots",
    "businessModel",
    "roadmap",
    "milestones",
    "recommendedTools",
    "contentPlan",
    "automationPlan"
  ],
  properties: {
    superpower: {
      type: "string",
      description: "The user's primary digital superpower distilled from quiz answers."
    },
    persona: {
      type: "string",
      description: "A branded persona name that matches the user's superpower."
    },
    coreStrengths: {
      type: "array",
      items: { type: "string" },
      description: "Top strengths that define how the user creates value."
    },
    blindspots: {
      type: "array",
      items: { type: "string" },
      description: "Common pitfalls or weaknesses the user should be aware of."
    },
    businessModel: {
      type: "string",
      description: "The best business model for this persona (e.g., educator, curator, builder, analyst)."
    },
    roadmap: {
      type: "array",
      description: "A step-by-step roadmap broken into phases.",
      items: {
        type: "object",
        required: ["phase", "description", "actions"],
        properties: {
          phase: { type: "string" },
          description: { type: "string" },
          actions: {
            type: "array",
            items: { type: "string" }
          }
        }
      }
    },
    milestones: {
      type: "array",
      description: "Key milestones the user should hit to stay on track.",
      items: { type: "string" }
    },
    recommendedTools: {
      type: "array",
      description: "Tools that match the user's persona and business model.",
      items: { type: "string" }
    },
    contentPlan: {
      type: "array",
      description: "Content ideas tailored to the user's persona.",
      items: { type: "string" }
    },
    automationPlan: {
      type: "array",
      description: "Automations the user should set up to scale their digital business.",
      items: { type: "string" }
    }
  }
};
