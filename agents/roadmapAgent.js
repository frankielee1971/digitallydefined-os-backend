/**
 * Roadmap Agent
 * Generates a faceless digital real estate roadmap based on the user's
 * superpower profile. Uses LLM with JSON schema prompting when AI
 * providers are configured; falls back to persona-specific hardcoded
 * roadmaps otherwise.
 *
 * Input (from digitalSuperpowerAgent):
 *   { superpowerName, persona, strengths, blindspots, businessModel,
 *     recommendedPathways, confidenceScore }
 *
 * Output (matches supabase agent-schemas.ts "roadmap" schema):
 *   { steps: string[], estimatedTime: string, tools: string[], nextAction: string }
 */
import { callLLM, parseJsonReply, validateAgainstSchema } from '../lib/llmClient.js';

// Schema for LLM output validation (mirrors supabase/functions/_shared/agent-schemas.ts)
const ROADMAP_SCHEMA = {
  steps: 'array',
  estimatedTime: 'string',
  tools: 'array',
  nextAction: 'string',
};

const SYSTEM_PROMPT = `You are Hermes, the Digital Roadmap Architect for DigitallyDefined.\n\nYour job:\n- Analyze the user's digital superpower profile\n- Recommend faceless digital real estate assets (rank-and-rent, templates, content libraries, micro-SaaS, communities)\n- Build a step-by-step build sequence\n- Follow the required JSON schema exactly\n- Return valid JSON only`;

function buildPrompt(profile) {
  return `Generate a personalized faceless digital real estate roadmap.\n\nSuperpower: ${profile.superpowerName}\nPersona: ${profile.persona}\nStrengths: ${profile.strengths.join(', ')}\nBlindspots: ${profile.blindspots.join(', ')}\nBusiness Model: ${profile.businessModel}\nRecommended Pathways: ${profile.recommendedPathways.join(', ')}\n\nReturn JSON with exactly these fields:\n- steps: array of 5-7 actionable build steps as strings\n- estimatedTime: total timeframe string (e.g., "4-6 weeks")\n- tools: array of recommended tool names\n- nextAction: the single most important next action\n\nFocus on building profitable, faceless digital assets that work on autopilot.`;
}

// Hardcoded fallbacks per persona (used when LLM/API is unavailable)
const FALLBACKS = {
  'the builder': {
    steps: ['Run the Niche Profitability Scorecard on one local-service niche', 'Build a minimum viable landing page with one lead magnet', 'Set up automated email capture + delivery', 'Launch, collect 5-10 qualified leads, then iterate', 'Scale to 3 assets once the first is profitable'],
    estimatedTime: '6-8 weeks to first paying lead',
    tools: ['Niche Scorecard', 'Carrd or Next.js', 'Supabase', 'Brevo', 'Zapier / n8n'],
    nextAction: 'Open the Niche Profitability Scorecard and pick one niche to test.',
  },
  'the creator': {
    steps: ['Pick one quiet niche with an underserved audience', 'Write one pillar article or guide', 'Build an automated email delivery sequence', 'Promote via SEO + Pinterest (no personal brand needed)', 'Package into a micro-product once you have 50 subscribers'],
    estimatedTime: '4-6 weeks to first asset live',
    tools: ['AI writer', 'Ghost or Notion', 'Buttondown or Substack', 'Pinterest', 'Brevo'],
    nextAction: 'Choose one niche from your result and draft your first pillar article outline.',
  },
  'the educator': {
    steps: ['Document one micro-system you already use daily', 'Turn it into a downloadable checklist or workbook', 'Set up a simple 3-5 email course', 'Gate it behind an email capture form', 'Repurpose each lesson into weekly content'],
    estimatedTime: '3-5 weeks to first educational asset',
    tools: ['Notion', 'Canva', 'PDF engine', 'Email provider', 'Landing page builder'],
    nextAction: 'Write down one process you do without thinking — that is your first asset.',
  },
  'the strategist': {
    steps: ['Run the Niche Scorecard on 3 potential niches', 'Pick the one with clearest monetization signal', 'Build a single automated lead funnel', 'Track conversion for 2 weeks before scaling', 'Expand to 2-3 assets once ROAS is positive'],
    estimatedTime: '8-10 weeks to profitable funnel',
    tools: ['Scorecard', 'Analytics', 'Landing page builder', 'Email provider', 'Spreadsheet'],
    nextAction: 'Open the Niche Profitability Scorecard and score 3 niche ideas.',
  },
  'the connector': {
    steps: ['Map one referral or partner path inside your niche', 'Create a value-exchange asset (checklist, template, or guide)', 'Share it through your network + partner channels', 'Capture emails and follow up with a referral-friendly sequence', 'Build a community hub once you have 100 engaged contacts'],
    estimatedTime: '5-7 weeks to first community touchpoint',
    tools: ['Scorecard', 'Community platform', 'Email provider', 'Template builder', 'Partnership tracker'],
    nextAction: 'List 3 people in your network who solve problems for your target niche.',
  },
};

export async function roadmapAgent(superpowerProfile) {
  const personaKey = (superpowerProfile.persona || 'The Builder').toLowerCase();

  // Try LLM with JSON schema prompting
  try {
    const response = await callLLM(SYSTEM_PROMPT, buildPrompt(superpowerProfile));
    const parsed = parseJsonReply(response.reply);
    const errors = validateAgainstSchema(ROADMAP_SCHEMA, parsed);

    if (!errors.length && Array.isArray(parsed.steps) && parsed.steps.length > 0) {
      return {
        steps: parsed.steps,
        estimatedTime: parsed.estimatedTime || '',
        tools: parsed.tools || [],
        nextAction: parsed.nextAction || '',
      };
    }

    console.warn('[roadmapAgent] LLM output failed schema validation:', errors);
    throw new Error('Schema validation failed');
  } catch (err) {
    console.warn('[roadmapAgent] LLM failed, using hardcoded fallback:', err.message);
  }

  return FALLBACKS[personaKey] || FALLBACKS['the builder'];
}

export default roadmapAgent;
