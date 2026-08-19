// _shared/email-publish.ts — stub for Supabase
// Ported from lib/email-publish.js
// SendGrid email dispatcher for follow-up campaigns

export async function sendEmail(options: {
  apiKey: string;
  listId: string;
  templateId: string;
  toEmail: string;
  toName: string;
  tag: string;
  variables: Record<string, string>;
}) {
  // For SendGrid v3 Mail Send API
  const SG_TEMPLATE_ID = options.templateId;
  const SG_API_KEY = options.apiKey;
  const TO_EMAIL = options.toEmail;
  const TO_NAME = options.toName;
  const TAG = options.tag;

  if (!SG_TEMPLATE_ID || !SG_API_KEY) {
    console.log("[email-send] DRY RUN — no SendGrid credentials configured");
    return { ok: true, status: "dry_run", email: TO_EMAIL };
  }

  try {
    const res = await fetch("https://api.sendgrid.com/v3/mail/send", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${SG_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        personalizations: [{
          to: [{ email: TO_EMAIL, name: TO_NAME }],
          dynamic_template_data: options.variables,
        }],
        template_id: SG_TEMPLATE_ID,
        from: { email: "hello@digitallydefined.online", name: "DigitallyDefined" },
        categories: [TAG],
      }),
      signal: AbortSignal.timeout(30000),
    });

    if (res.ok) {
      console.log(`[email-send] Sent to ${TO_EMAIL}`);
      return { ok: true, status: "sent", email: TO_EMAIL };
    }
    const text = await res.text().catch(() => "");
    console.error(`[email-send] Failed ${res.status}: ${text}`);
    return { ok: false, status: "failed", email: TO_EMAIL, error: text };
  } catch (e: any) {
    console.error(`[email-send] Exception: ${e.message}`);
    return { ok: false, status: "error", email: TO_EMAIL, error: e.message };
  }
}

export function parseSendgridBody(): Record<string, unknown> { return {}; }
