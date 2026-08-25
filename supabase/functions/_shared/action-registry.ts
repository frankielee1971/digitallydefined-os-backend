// _shared/action-registry.ts
// SINGLE SOURCE OF TRUTH for Hermes action names + access rules.
// Used by: supabase/functions/hermes/index.ts (edge dispatcher)
// Mirrored by: api/index.js (Vercel dispatcher) — keep both in sync.

/** Form/community actions that never require an API key. */
export const PUBLIC_FORM_ACTIONS = [
  "subscribe",
  "contact",
  "quiz.complete",
  "public.chat",
] as const;

/** Action prefixes that are public (rate-limited only). */
export const PUBLIC_ACTION_PREFIXES = ["agent."] as const;

/** Actions any authenticated caller (x-api-key) may use via GET or POST. */
export const AUTHED_ACTIONS = [
  "status",
  "routes",
  "auth.verify",
  "test-env",
  "dashboard",
  "ai.recommendations",
  "brain.brief",
  "chat",
  "mentor.dev",
  "hermes.agent",
  "intelligence",
  "automation.list",
  "automation.logs",
  "automation.events",
  "automation.sync",
  "automation.run",
  "integration.googleAnalytics",
  "integration.social",
  "integration.email",
  "integration.community",
  "license.verify",
] as const;

/** GET-only actions. */
export const GET_ONLY_ACTIONS = [
  "status",
  "routes",
  "auth.verify",
  "test-env",
  "dashboard",
  "automation.list",
  "automation.logs",
  "automation.events",
] as const;

/** POST-only actions (state mutations). */
export const POST_ONLY_ACTIONS = [
  "automation.sync",
  "automation.run",
] as const;

export function isPublicAction(action: string): boolean {
  return (
    (PUBLIC_FORM_ACTIONS as readonly string[]).includes(action) ||
    PUBLIC_ACTION_PREFIXES.some((p) => action.startsWith(p))
  );
}

export function isKnownAction(action: string): boolean {
  return (
    isPublicAction(action) ||
    (AUTHED_ACTIONS as readonly string[]).includes(action)
  );
}
