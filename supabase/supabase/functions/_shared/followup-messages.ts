// _shared/followup-messages.ts — converted from lib/followup-messages.js
const FOLLOWUP_DAYS = ['day1', 'day3', 'day5', 'day7', 'day10', 'day14'];

interface DayMeta {
  label: string;
  subject: string;
}

const DAY_META: Record<string, DayMeta> = {
  day1: { label: 'Day 1', subject: 'Your first move is already clear' },
  day3: { label: 'Day 3', subject: 'The quiet path from quiz to offer' },
  day5: { label: 'Day 5', subject: 'Pick one tool, then build one asset' },
  day7: { label: 'Day 7', subject: 'If it feels awkward, simplify' },
  day10: { label: 'Day 10', subject: 'Your next step is smaller than you think' },
  day14: { label: 'Day 14', subject: 'You do not need visibility to build income' },
};

interface FallbackUser { resultKey: string; profile: { name?: string } }

const FALLBACK_USERS: Record<string, FallbackUser> = {
  roadmap_generator: { resultKey: 'roadmap_generator', profile: { name: 'Builder' } },
  niche_scorecard: { resultKey: 'niche_scorecard', profile: { name: 'Strategist' } },
  calculator: { resultKey: 'calculator', profile: { name: 'Operator' } },
  digital_superpower: { resultKey: 'digital_superpower', profile: { name: 'Creator' } },
};

function getFallbackUser(resultKey: string): FallbackUser {
  return FALLBACK_USERS[resultKey] || { resultKey: 'unknown', profile: { name: 'You' } };
}

export interface BuildIndicatorOptions { day?: string; dayMeta?: DayMeta; ts?: string | number }

export function buildIndicator(options: BuildIndicatorOptions) {
  const meta = options.dayMeta || DAY_META[options.day || ''];
  return {
    day: options.day,
    delivered: false,
    subject: meta?.subject || '',
    sentAt: options.ts ? new Date(options.ts).toISOString() : null,
  };
}

export interface BuildMessageOptions {
  resultKey?: string; tags?: string[]; profile?: { name?: string }; roadmap?: object; tags2?: string[];
}

export function buildMessage({ resultKey, tags = [], profile = null, roadmap = null }: BuildMessageOptions): string {
  const fallback = getFallbackUser(resultKey || '');
  const user = { name: profile?.name || 'You', resultKey: resultKey || fallback.resultKey };
  if (!user.name || user.name === '') user.name = 'You';

  let body = '';
  if (resultKey && DAY_META[resultKey as keyof typeof DAY_META]) {
    const meta = DAY_META[resultKey as keyof typeof DAY_META];
    body = `${meta.subject}`;
    if (roadmap && typeof roadmap === 'object') {
      const r = roadmap as Record<string, unknown>;
      if (r.overview) body += `\n\n${String(r.overview)}`;
    }
  } else {
    body = `Keep going — ${fallback.resultKey}`;
  }
  return body.trim();
}

export function buildSummary({ user, day, tags }: { user?: { name?: string }; day?: string; tags?: string[] }): string {
  return `${user?.name || 'Builder'} ${day ? '— Day ' + day + ' ' : ''}followup`;
}

export function buildBody(): string { return ''; }
export function buildCtas(): string { return ''; }
export { FOLLOWUP_DAYS, DAY_META, getFallbackUser };
