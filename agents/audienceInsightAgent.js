/**
 * Audience Insight Agent
 * Extracts audience pain points, desires, motivations, and buying triggers.
 */
export async function audienceInsightAgent(niche) {
  return {
    niche,
    painPoints: [
      "Overwhelm from too much information",
      "Not knowing where to start",
      "Fear of choosing the wrong niche",
      "Confusion about tech setup"
    ],
    desires: [
      "Clarity",
      "Confidence",
      "A simple roadmap",
      "Fast wins"
    ],
    motivations: [
      "Freedom",
      "Flexibility",
      "Extra income",
      "Creative expression"
    ],
    buyingTriggers: [
      "Clear step‑by‑step guidance",
      "Fast setup",
      "Beginner‑friendly tools",
      "Proof of results"
    ]
  };
}
