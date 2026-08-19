// Supabase Edge Functions _shared sellable-auth module
// Ported from lib/sellable-auth.js for use in Deno/Supabase runtime
// Common auth, dry-run flag, CORS, and mask helpers for sellable automation.

const DRY_RUN = String(Deno.env.get('SELLABLE_DRY_RUN') || 'true').trim().toLowerCase() === 'true';
const LIVE_APPROVAL = String(Deno.env.get('SELLABLE_LIVE_APPROVAL') || '').trim().toLowerCase();

export function dryRunEnabled(): boolean {
  return DRY_RUN;
}

export function isLiveExecutionAllowed(): boolean {
  const approved = LIVE_APPROVAL === 'phase19';
  return approved;
}

export function buildEnvelope({ ok = true, action, status = 'success', data = null, error = null, debug = null, meta = {} }: {
  ok?: boolean;
  action: string;
  status?: string;
  data?: unknown;
  error?: string | null;
  debug?: unknown;
  meta?: Record<string, unknown>;
}): Record<string, unknown> {
  return {
    ok,
    action,
    status,
    data,
    error,
    debug: Deno.env.get('NODE_ENV') !== 'production' ? debug : null,
    meta: {
      dryRun: dryRunEnabled(),
      liveApproved: isLiveExecutionAllowed(),
      generatedAt: new Date().toISOString(),
      ...meta,
    },
  };
}

export function dryRunPayload(prefix = 'Dry-run'): Record<string, unknown> {
  return buildEnvelope({
    ok: true,
    action: 'dry_run',
    status: 'drilled',
    data: null,
    error: null,
    meta: { message: `${prefix} mode: no live write or external call was made.` },
  });
}

export function safeStringify(value: unknown, fallback = '{}'): string {
  try {
    return JSON.stringify(value);
  } catch {
    return fallback;
  }
}

export function maskError(err: Error, source = 'External service'): string {
  const message = err?.message || 'Unknown error';
  const isAuth = /unauthorized|forbidden|token|credential|secret|apikey|api key|access denied/i.test(message);
  const isRate = /rate limit|too many requests|quota/i.test(message);
  const isTimeout = /timeout|timed out|aborted/i.test(message);

  if (isAuth) return `${source} request failed due to authentication or permission settings.`;
  if (isRate) return `${source} request was rate limited.`;
  if (isTimeout) return `${source} request timed out.`;
  return `${source} request failed.`;
}
