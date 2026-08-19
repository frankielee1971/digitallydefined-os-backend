/**
 * Digital Superpower Quiz Agent
 * Interprets quiz answers and generates the user's superpower profile.
 * Then calls the Roadmap Agent to produce a faceless digital real estate roadmap.
 *
 * Input (actual quiz format):  { q1: 'builder', q2: 'creator', ... q7: 'strategist' }
 * Output (matches agent-schemas.ts):
 *   { superpowerName, superpowerDescription, recommendedPathways,
 *     steps, estimatedTime, tools, nextAction, ... }
 */
import { roadmapAgent } from './roadmapAgent.js';

// Persona profiles — aligned with QuizLogic.js RESULT_TYPES and src/lib/roadmaps.js
const PERSONA_PROFILES = {
  builder: {
    superpowerName: 'Digital Architect',
    superpowerDescription: 'You turn ideas into infrastructure. Your superpower is building systems, assets, and automation that keep running on autopilot, freeing you to focus on what matters — family, legacy, and real wealth.',
    strengths: ['Turns complex workflows into simple, repeatable systems', 'Tests small and scales what works', 'Prefers tools and assets over talk and visibility'],
    blindspots: ['May over-build before validating demand', 'Can underestimate the importance of a clear monetization story', 'Sometimes delays launch in search of a better system'],
    businessModel: 'Owner of faceless digital real estate (rank-and-rent, templates, micro-SaaS)',
    persona: 'The Builder',
  },
  creator: {
    superpowerName: 'Content Alchemist',
    superpowerDescription: 'You think in story, insight, and audience experience. Your superpower is turning private insights into assets that keep generating value long after you publish them — faceless income without a public persona.',
    strengths: ['Turns insight into publishable assets without needing to be on camera', 'Senses audience emotion and shapes messaging quickly', 'Builds content that keeps generating value after publication'],
    blindspots: ['Private output can feel invisible without a public persona', 'Distribution may feel like self-promotion', 'Monetization paths are not always clear for content-first models'],
    businessModel: 'Content-driven products with automated delivery pipelines',
    persona: 'The Creator',
  },
  educator: {
    superpowerName: 'Clarity Catalyst',
    superpowerDescription: 'You learn deeply and translate complexity into simple, trusted paths for others. Your superpower is packaging hard-won knowledge into evergreen assets that compound over time — building authority without the spotlight.',
    strengths: ['Organizes confusing topics into simple, proven paths', 'Builds trust through clarity and consistency', 'Creates assets that serve audiences at scale'],
    blindspots: ['May wait too long for the perfect curriculum', 'Can underestimate the value of lightweight, scrappy content', 'Sometimes struggles with self-promotion'],
    businessModel: 'Guides, templates, courses, and teaching systems on autopilot',
    persona: 'The Educator',
  },
  strategist: {
    superpowerName: 'Opportunity Scout',
    superpowerDescription: 'You prioritize outcomes over activity and cut through noise to find what actually works. Your superpower is choosing the right model and killing the rest — preventing wasted effort while others chase trends.',
    strengths: ['Chooses the right model and cuts the rest', 'Prevents wasted effort by aligning assets with outcomes', 'Makes faster decisions with less noise'],
    blindspots: ['May over-plan and under-build', 'Can delay launch waiting for the perfect model', 'Sometimes needs a forcing function to commit to one asset'],
    businessModel: 'High-leverage planning tools and portfolio-style digital assets',
    persona: 'The Strategist',
  },
  connector: {
    superpowerName: 'Network Weaver',
    superpowerDescription: 'You see relationships, partnerships, and group dynamics that others miss. Your superpower is matching people, offers, and opportunities to create shared wins — building faceless income through network effects and referral systems.',
    strengths: ['Sees relationship opportunities others miss', 'Creates win-win partnerships that compound', 'Builds trust quickly through genuine connection'],
    blindspots: ['May rely on relationships before building owned assets', 'Can spread thin across too many people or offers', 'Sometimes needs a clear monetization path separate from introductions'],
    businessModel: 'Community, referrals, and partner-offer ecosystems',
    persona: 'The Connector',
  },
};

const PERSONA_PATHWAYS = {
  builder: ['Rank-and-rent landing pages in local home services', 'Template and checklist products for organized professionals', 'Micro-SaaS wrappers for repetitive tasks'],
  creator: ['Private content libraries with automated email delivery', 'AI-assisted content repurpose pipelines', 'Quiet hobby communities with faceless product sales'],
  educator: ['Workbook and checklist products for niche professionals', 'Email course sequences built on proven frameworks', 'Notion template bundles for common workflows'],
  strategist: ['Portfolio of small rank-and-rent assets', 'Decision-framework products for busy professionals', 'Automated lead-generation funnels with clear ROI tracking'],
  connector: ['Referral and partner-introduction systems', 'Micro-community platforms around shared values', 'Affiliate and joint-venture ecosystems'],
};

/**
 * Score quiz answers by counting persona frequencies.
 * Each answer value is one of: builder | creator | educator | strategist | connector
 */
export function scoreQuiz(answers = {}) {
  const counts = {};
  for (const key of Object.keys(answers)) {
    const value = answers[key];
    if (!value) continue;
    counts[value] = (counts[value] || 0) + 1;
  }

  let topResult = 'builder';
  let topCount = 0;
  for (const [key, count] of Object.entries(counts)) {
    if (count > topCount) {
      topCount = count;
      topResult = key;
    }
  }

  const total = Object.keys(answers).filter((k) => answers[k]).length;
  const confidenceScore = total > 0 ? Math.round((topCount / total) * 1000) / 1000 : 0.5;
  return { topResult, confidenceScore, counts };
}

/**
 * Interpret quiz answers → build superpower profile
 */
function interpretQuizAnswers(answers) {
  const { topResult, confidenceScore, counts } = scoreQuiz(answers);
  const profile = PERSONA_PROFILES[topResult] || PERSONA_PROFILES.builder;
  return {
    superpowerName: profile.superpowerName,
    superpowerDescription: profile.superpowerDescription,
    persona: profile.persona,
    strengths: profile.strengths,
    blindspots: profile.blindspots,
    businessModel: profile.businessModel,
    recommendedPathways: PERSONA_PATHWAYS[topResult],
    confidenceScore,
    personaCounts: counts,
  };
}

/**
 * Digital Superpower Quiz Agent
 * 1. Interprets quiz answers → superpower profile
 * 2. Generates a faceless digital real estate roadmap
 * 3. Returns combined result matching agent-schemas.ts output
 */
export async function digitalSuperpowerAgent(input = {}) {
  // Support multiple input formats:
  // 1. Direct quiz answers:    { q1: 'builder', q2: 'creator', ... }
  // 2. Agent call with input: { answers: { q1: 'builder', ... } }
  // 3. Roadmap call:          { name, superpower, answers: {...}, profile, goal }
  const answers = input.answers || input;
  const profile = interpretQuizAnswers(answers);
  const roadmap = await roadmapAgent(profile);
  return {
    superpowerName: profile.superpowerName,
    superpowerDescription: profile.superpowerDescription,
    persona: profile.persona,
    recommendedPathways: profile.recommendedPathways,
    confidenceScore: profile.confidenceScore,
    strengths: profile.strengths,
    blindspots: profile.blindspots,
    businessModel: profile.businessModel,
    steps: roadmap.steps,
    estimatedTime: roadmap.estimatedTime,
    tools: roadmap.tools,
    nextAction: roadmap.nextAction,
    // Fields roadmapAgent consumes to tailor the build sequence to the user + market signals.
    profitabilityScore: input.profitabilityScore ?? null,
    competitionLevel: input.competitionLevel ?? null,
    trendStrength: input.trendStrength ?? null,
    nicheViability: input.nicheViability ?? null,
    audienceInsight: input.audienceInsight ?? null,
    opportunityGaps: input.opportunityGaps ?? [],
    privacyNeeds: input.privacyNeeds ?? null,
    energyLevel: input.energyLevel ?? null,
    burnoutRisk: input.burnoutRisk ?? null,
    aiTools: input.aiTools ?? [],
  };
}

export { interpretQuizAnswers, PERSONA_PROFILES };
export default digitalSuperpowerAgent;
