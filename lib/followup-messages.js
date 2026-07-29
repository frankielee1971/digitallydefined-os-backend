const FOLLOWUP_DAYS = ['day1', 'day3', 'day5', 'day7', 'day10', 'day14'];
const DAY_META = {
  day1: { label: 'Day 1', subject: 'Your first move is already clear' },
  day3: { label: 'Day 3', subject: 'The quiet path from quiz to offer' },
  day5: { label: 'Day 5', subject: 'Pick one tool, then build one asset' },
  day7: { label: 'Day 7', subject: 'If it feels awkward, simplify' },
  day10: { label: 'Day 10', subject: 'Your next step is smaller than you think' },
  day14: { label: 'Day 14', subject: 'You do not need visibility to build income' },
};

function buildIndicator(options = {}) {
  const meta = options.dayMeta || DAY_META[options.day];
  return {
    day: options.day,
    delivered: false,
    subject: meta?.subject || '',
    sentAt: options.ts ? new Date(options.ts).toISOString() : null,
  };
}

function buildMessage({ resultKey, tags = [], profile = null, roadmap = null }) {
  const fallback = getFallbackUser(resultKey);
  const user = {
    name: profile?.name || 'You',
    resultKey: resultKey || fallback.resultKey,
  };

  const day = FOLLOWUP_DAYS.find((d) => tags.includes(`followup-${d}`)) || null;

  return {
    day,
    summary: buildSummary({ user, day, tags }),
    body: buildBody({ user, day, roadmap }),
    ctas: buildCtas({ user, day, roadmap }),
  };
}

function buildSummary({ user, day, tags }) {
  if (day) {
    return `${user.name ? user.name + ', this is your ' + day + ' check-in.' : 'This is your ' + day + ' check-in.'}`;
  }
  return 'This is a DigitallyDefined coaching note tied to your quiz result.';
}

function buildBody({ user, day, roadmap }) {
  if (!roadmap) {
    return 'You built the first part already by taking the quiz. The next step is to choose one asset path and stay with it long enough to see whether it pays.';
  }

  const superpower = roadmap?.superpowerType || user.resultKey || 'creator';
  const parts = [roadmap.overview];
  if (day && DAY_META[day]) parts.push(`Today's reminder: ${DAY_META[day].subject.toLowerCase()}.`);

  const niches = Array.isArray(roadmap.recommendedNiches) ? roadmap.recommendedNiches.slice(0, 2) : [];
  if (niches.length) parts.push(`Niche direction worth keeping for now: ${niches.join(' or ')}.`);

  const tools = Array.isArray(roadmap.toolsToUse) ? roadmap.toolsToUse.slice(0, 2) : [];
  if (tools.length) parts.push(`Build smallest first: ${tools.join(' | ')}.`);

  return parts.join(' ');
}

function buildCtas({ user, day, roadmap }) {
  const ctaBase = {
    startHere: 'https://digitallydefined.online/start-here',
    scorecard: 'https://digitallydefined.online/tools/scorecard',
    calculator: 'https://digitallydefined.online/tools/calculator',
    community: 'https://digitallydefined.online',
  };

  if (!roadmap?.cta) return ctaBase;

  return {
    community: roadmap.cta.community || ctaBase.community,
    scorecard: roadmap.cta.scorecard || ctaBase.scorecard,
    calculator: roadmap.cta.calculator || ctaBase.calculator,
    startHere: roadmap.cta.startHere || ctaBase.startHere,
  };
}

function getFallbackUser(resultKey) {
  const key = FOLLOWUP_DAYS.includes(resultKey) ? DAY_META[resultKey] && 'strategist' : resultKey;
  return {
    resultKey: resultKey || 'strategist',
    title: 'Strategist',
    tagline: 'Direction beats speed.',
    description:
      'You prioritize outcomes over activity. This follow-up flow keeps you aligned without turning you into a public persona.',
    recommendedFirstStep: 'Run the Niche Profitability Scorecard before building anything new.',
    toolPreference: 'Scorecard, 10x ROI Calculator, portfolio tracker',
  };
}

export { FOLLOWUP_DAYS, DAY_META, buildIndicator, buildMessage, buildSummary, buildBody, buildCtas, getFallbackUser };
