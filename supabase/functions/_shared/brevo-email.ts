// _shared/brevo-email.ts — Brevo email service with dev/test/blackhole modes
// Protects Brevo quota during testing while maintaining full production capability

const BLACKHOLE_EMAIL = 'blackhole@brevo.com';

export type EmailMode = 'dev' | 'test' | 'blackhole' | 'live';

export interface BrevoConfig {
  apiKey: string | null;
  listId: string | null;
  fromEmail: string | null;
  fromName: string;
}

export interface QuizEmailPayload {
  toEmail: string;
  toName: string;
  superpower: string;
  roadmap?: Record<string, unknown>;
  answers?: Record<string, string>;
}

export interface EmailResult {
  ok: boolean;
  mode: EmailMode;
  emailSent: boolean;
  email?: string;
  originalEmail?: string;
  brevoUsed?: boolean;
  emailSkipped?: boolean;
  meta?: Record<string, unknown>;
  error?: string;
}

/**
 * Determine email mode from request body flags
 */
export function detectEmailMode(
  body: Record<string, unknown>,
  config: BrevoConfig
): EmailMode {
  const devMode = body.devMode === true || body.dev === true;
  const brevoTest = body.brevoTest === true;
  const testEmail = body.testEmail === true;
  const email = String(body.email || '').toLowerCase();

  if (devMode) return 'dev';
  if (brevoTest) return 'test';
  if (testEmail || email === BLACKHOLE_EMAIL) return 'blackhole';
  if (!config.apiKey || !config.listId) return 'dev'; // fallback to dev if not configured
  return 'live';
}

/**
 * Send quiz completion email with mode-aware routing
 */
export async function sendQuizEmail(
  payload: QuizEmailPayload,
  mode: EmailMode,
  config: BrevoConfig
): Promise<EmailResult> {
  const { toEmail, toName, superpower, roadmap, answers } = payload;

  // DEV MODE: Skip entirely, log to console
  if (mode === 'dev') {
    console.log('[quiz-email] DEV MODE — skipping Brevo send');
    console.log('[quiz-email] Would send to:', {
      to: toEmail,
      name: toName,
      superpower,
      hasRoadmap: !!roadmap,
      answerCount: Object.keys(answers || {}).length,
    });
    return {
      ok: true,
      mode: 'dev',
      emailSent: false,
      email: toEmail,
      emailSkipped: true,
      brevoUsed: false,
    };
  }

  // TEST MODE: Send with X-Brevo-Test header
  if (mode === 'test') {
    console.log('[quiz-email] TEST MODE — sending with X-Brevo-Test header');
    return await sendWithTestHeader(toEmail, toName, superpower, roadmap, answers, config);
  }

  // BLACKHOLE MODE: Send to blackhole address
  if (mode === 'blackhole') {
    console.log('[quiz-email] BLACKHOLE MODE — sending to blackhole@brevo.com');
    return await sendToBlackhole(toEmail, toName, superpower, roadmap, answers, config);
  }

  // LIVE MODE: Send real email
  console.log('[quiz-email] LIVE MODE — sending real email');
  return await sendLiveEmail(toEmail, toName, superpower, roadmap, answers, config);
}

/**
 * Send email with X-Brevo-Test header (sandbox mode)
 */
async function sendWithTestHeader(
  toEmail: string,
  toName: string,
  superpower: string,
  roadmap: Record<string, unknown> | undefined,
  answers: Record<string, string> | undefined,
  config: BrevoConfig
): Promise<EmailResult> {
  if (!config.apiKey) {
    return { ok: false, mode: 'test', emailSent: false, error: 'Brevo API key not configured' };
  }

  try {
    const htmlContent = buildQuizEmailHtml(toName, superpower, roadmap);

    const res = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'Api-Key': config.apiKey,
        'X-Brevo-Test': 'true', // Sandbox mode - no delivery, no quota
      },
      body: JSON.stringify({
        sender: {
          email: config.fromEmail || 'hello@digitallydefined.online',
          name: config.fromName || 'DigitallyDefined',
        },
        to: [{ email: toEmail, name: toName }],
        subject: `${toName}, your Digital Superpower roadmap is ready`,
        contentMigration: 'replace',
        htmlContent,
        tags: ['quiz-roadmap', 'test-mode'],
      }),
      signal: AbortSignal.timeout(30000),
    });

    if (res.ok) {
      const data = await res.json().catch(() => ({}));
      console.log('[quiz-email] TEST mode response:', { messageId: data.messageId, messageIdGroup: data.messageIdGroup });
      return {
        ok: true,
        mode: 'test',
        emailSent: true,
        email: toEmail,
        brevoUsed: true,
        meta: data,
      };
    }

    const text = await res.text().catch(() => '');
    console.error('[quiz-email] TEST mode failed:', res.status, text);
    return {
      ok: false,
      mode: 'test',
      emailSent: false,
      email: toEmail,
      brevoUsed: true,
      error: `Brevo test send failed: ${res.status} ${text.slice(0, 100)}`,
    };
  } catch (error) {
    console.error('[quiz-email] TEST mode exception:', error);
    return {
      ok: false,
      mode: 'test',
      emailSent: false,
      email: toEmail,
      brevoUsed: true,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Send to blackhole address (accepts but doesn't deliver)
 */
async function sendToBlackhole(
  originalEmail: string,
  toName: string,
  superpower: string,
  roadmap: Record<string, unknown> | undefined,
  answers: Record<string, string> | undefined,
  config: BrevoConfig
): Promise<EmailResult> {
  if (!config.apiKey) {
    return { ok: false, mode: 'blackhole', emailSent: false, error: 'Brevo API key not configured' };
  }

  try {
    const htmlContent = buildQuizEmailHtml(toName, superpower, roadmap);

    const res = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'Api-Key': config.apiKey,
      },
      body: JSON.stringify({
        sender: {
          email: config.fromEmail || 'hello@digitallydefined.online',
          name: config.fromName || 'DigitallyDefined',
        },
        to: [{ email: BLACKHOLE_EMAIL, name: toName }],
        subject: `${toName}, your Digital Superpower roadmap is ready`,
        contentMigration: 'replace',
        htmlContent,
        variables: {
          NAME: toName,
          SUPERPOWER: superpower,
          ORIGINAL_EMAIL: originalEmail,
        },
        tags: ['quiz-roadmap', 'blackhole-test'],
      }),
      signal: AbortSignal.timeout(30000),
    });

    if (res.ok) {
      const data = await res.json().catch(() => ({}));
      console.log('[quiz-email] BLACKHOLE mode response:', { messageId: data.messageId });
      return {
        ok: true,
        mode: 'blackhole',
        emailSent: true,
        email: BLACKHOLE_EMAIL,
        originalEmail,
        brevoUsed: true,
        meta: data,
      };
    }

    const text = await res.text().catch(() => '');
    console.error('[quiz-email] BLACKHOLE mode failed:', res.status, text);
    return {
      ok: false,
      mode: 'blackhole',
      emailSent: false,
      email: BLACKHOLE_EMAIL,
      originalEmail,
      brevoUsed: true,
      error: `Brevo blackhole send failed: ${res.status} ${text.slice(0, 100)}`,
    };
  } catch (error) {
    console.error('[quiz-email] BLACKHOLE mode exception:', error);
    return {
      ok: false,
      mode: 'blackhole',
      emailSent: false,
      email: BLACKHOLE_EMAIL,
      originalEmail,
      brevoUsed: true,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Send live production email
 */
async function sendLiveEmail(
  toEmail: string,
  toName: string,
  superpower: string,
  roadmap: Record<string, unknown> | undefined,
  answers: Record<string, string> | undefined,
  config: BrevoConfig
): Promise<EmailResult> {
  if (!config.apiKey || !config.listId) {
    return { ok: false, mode: 'live', emailSent: false, error: 'Brevo configuration incomplete' };
  }

  try {
    const htmlContent = buildQuizEmailHtml(toName, superpower, roadmap);

    const res = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'Api-Key': config.apiKey,
      },
      body: JSON.stringify({
        sender: {
          email: config.fromEmail || 'hello@digitallydefined.online',
          name: config.fromName || 'DigitallyDefined',
        },
        to: [{ email: toEmail, name: toName }],
        subject: `${toName}, your Digital Superpower roadmap is ready`,
        contentMigration: 'replace',
        htmlContent,
        tags: ['quiz-roadmap', 'live'],
      }),
      signal: AbortSignal.timeout(30000),
    });

    if (res.ok) {
      const data = await res.json().catch(() => ({}));
      console.log('[quiz-email] LIVE send successful:', { messageId: data.messageId });
      return {
        ok: true,
        mode: 'live',
        emailSent: true,
        email: toEmail,
        brevoUsed: true,
        meta: data,
      };
    }

    const text = await res.text().catch(() => '');
    console.error('[quiz-email] LIVE send failed:', res.status, text);
    return {
      ok: false,
      mode: 'live',
      emailSent: false,
      email: toEmail,
      brevoUsed: true,
      error: `Brevo send failed: ${res.status} ${text.slice(0, 100)}`,
    };
  } catch (error) {
    console.error('[quiz-email] LIVE send exception:', error);
    return {
      ok: false,
      mode: 'live',
      emailSent: false,
      email: toEmail,
      brevoUsed: true,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Build HTML email content for quiz completion
 */
function buildQuizEmailHtml(
  name: string,
  superpower: string,
  roadmap: Record<string, unknown> | undefined
): string {
  const steps = roadmap?.steps as string[] | undefined;
  const nextAction = roadmap?.nextAction as string | undefined;

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Your Digital Superpower Roadmap</title>
</head>
<body style="margin: 0; padding: 0; background-color: #0a0a12; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #0a0a12; padding: 40px 20px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background-color: #1a1a2e; border: 1px solid #2a2a4a; border-radius: 4px;">
          <!-- Header -->
          <tr>
            <td style="padding: 40px 40px 20px; border-bottom: 1px solid #2a2a4a;">
              <h1 style="margin: 0; color: #c9a84c; font-size: 24px; font-weight: 600;">
                DigitallyDefined
              </h1>
            </td>
          </tr>
          
          <!-- Greeting -->
          <tr>
            <td style="padding: 40px;">
              <p style="margin: 0 0 20px; color: #c9a84c; font-size: 14px; text-transform: uppercase; letter-spacing: 1px;">
                Your result is ready
              </p>
              <h2 style="margin: 0 0 20px; color: #ffffff; font-size: 28px; font-weight: 600;">
                Hello ${name},
              </h2>
              <p style="margin: 0 0 30px; color: #a0a0b0; font-size: 16px; line-height: 1.6;">
                Based on your answers, your digital superpower is:
              </p>
              <div style="background-color: #0a0a12; border: 1px solid #c9a84c; padding: 20px; border-radius: 4px; margin-bottom: 30px;">
                <p style="margin: 0; color: #c9a84c; font-size: 20px; font-weight: 600; text-transform: capitalize;">
                  ${superpower}
                </p>
              </div>
            </td>
          </tr>
          
          <!-- Roadmap Steps -->
          ${steps && steps.length > 0 ? `
          <tr>
            <td style="padding: 0 40px 40px;">
              <h3 style="margin: 0 0 20px; color: #ffffff; font-size: 18px; font-weight: 600;">
                Your Personalized Roadmap
              </h3>
              <ol style="margin: 0; padding-left: 20px; color: #a0a0b0; font-size: 15px; line-height: 1.8;">
                ${steps.map((step: string) => `<li style="margin-bottom: 10px;">${step}</li>`).join('\n                ')}
              </ol>
            </td>
          </tr>
          ` : ''}
          
          <!-- Next Action -->
          ${nextAction ? `
          <tr>
            <td style="padding: 0 40px 40px;">
              <div style="background-color: #0a0a12; border-left: 3px solid #c9a84c; padding: 20px;">
                <p style="margin: 0 0 10px; color: #c9a84c; font-size: 12px; text-transform: uppercase; letter-spacing: 1px;">
                  Your next action
                </p>
                <p style="margin: 0; color: #ffffff; font-size: 16px;">
                  ${nextAction}
                </p>
              </div>
            </td>
          </tr>
          ` : ''}
          
          <!-- CTA -->
          <tr>
            <td style="padding: 0 40px 40px; text-align: center;">
              <a href="https://digitallydefined.online/tools/scorecard" 
                 style="display: inline-block; background-color: #c9a84c; color: #0a0a12; padding: 14px 32px; text-decoration: none; font-weight: 600; font-size: 16px; border-radius: 4px; margin-top: 20px;">
                Score My Niche →
              </a>
            </td>
          </tr>
          
          <!-- Footer -->
          <tr>
            <td style="padding: 40px; border-top: 1px solid #2a2a4a; text-align: center;">
              <p style="margin: 0 0 10px; color: #666677; font-size: 13px;">
                You're receiving this because you completed the Digital Superpower Quiz at DigitallyDefined.online
              </p>
              <p style="margin: 0; color: #666677; font-size: 12px;">
                © 2026 DigitallyDefined. All rights reserved.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`.trim();
}

/**
 * Get Brevo configuration from environment
 */
export function getBrevoConfig(): BrevoConfig {
  return {
    apiKey: Deno.env.get('BREVO_API_KEY') || null,
    listId: Deno.env.get('BREVO_LIST_ID') || null,
    fromEmail: Deno.env.get('BREVO_FROM_EMAIL') || Deno.env.get('SELLABLE_FROM_EMAIL') || null,
    fromName: Deno.env.get('BREVO_FROM_NAME') || Deno.env.get('SELLABLE_FROM_NAME') || 'DigitallyDefined',
  };
}
