export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { prospect_name, email } = req.body || {};

    if (!prospect_name || !email) {
      return res.status(400).json({ error: "Name and email are required" });
    }

    // Payload for Gumloop
    const payload = {
      landing_page: "digitallydefined-coming-soon",
      prospect_name,
      asset_downloaded: "waitlist",
      source: "coming-soon-page",
      email,
      nurture_level: "warm",
      created_at: new Date().toISOString()
    };

    // Send to Gumloop
    const gumloopRes = await fetch(process.env.GUMLOOP_WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });

    if (!gumloopRes.ok) {
      throw new Error(`Gumloop failed: ${gumloopRes.status}`);
    }

    // Get SendPulse token
    const tokenRes = await fetch("https://api.sendpulse.com/oauth/access_token", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        grant_type: "client_credentials",
        client_id: process.env.SENDPULSE_CLIENT_ID,
        client_secret: process.env.SENDPULSE_CLIENT_SECRET
      })
    });

    const tokenData = await tokenRes.json();

    if (!tokenData.access_token) {
      throw new Error("Failed to get SendPulse access token");
    }

    // Add subscriber to SendPulse
    const sendpulseRes = await fetch(
      `https://api.sendpulse.com/addressbooks/${process.env.SENDPULSE_BOOK_ID}/emails`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${tokenData.access_token}`
        },
        body: JSON.stringify({
          emails: [
            {
              email,
              variables: {
                prospect_name,
                source: "coming-soon-page",
                asset_downloaded: "waitlist",
                nurture_level: "warm",
                landing_page: "digitallydefined-coming-soon"
              }
            }
          ]
        })
      }
    );

    if (!sendpulseRes.ok) {
      const errText = await sendpulseRes.text();
      throw new Error(`SendPulse failed: ${errText}`);
    }

    return res.status(200).json({ ok: true });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: error.message || "Server error" });
  }
}
