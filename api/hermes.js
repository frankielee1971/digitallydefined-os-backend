// Dashboard Hermes - Strategic Business Partner
// URL: https://digitallydefined-os-backend.vercel.app/api/hermes
// Purpose: Internal assistant with Notion access

export default async function handler(req, res) {
  // ✅ CORS - Allow dashboard domain
  res.setHeader('Access-Control-Allow-Origin', 'https://dashboard.digitallydefined.online');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-api-key, Authorization');

  // Handle preflight
  if (req.method === 'OPTIONS') return res.status(200).end();

  // Only POST allowed
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Verify Notion is connected
    const notionConnected = !!(process.env.NOTION_API_KEY &&
      process.env.NOTION_IDEAS_DB_ID &&
      process.env.NOTION_CONTENT_DB_ID);

    // Return gateway status
    return res.status(200).json({
      status: "Hermes Gateway active",
      notion: notionConnected ? "connected" : "not_configured",
      environment: "dashboard",
      role: "Strategic Business Partner",
      model: process.env.ANTIGRAVITY_API_KEY ? process.env.ANTIGRAVITY_MODEL || "antigravity" : 
             process.env.NOUS_API_KEY ? "nous-qwen-3.7-pro" :
             "basic"
    });
  } catch (error) {
    console.error('[Hermes Gateway] Error:', error.message);
    return res.status(500).json({
      status: "error",
      error: error.message || "Gateway error"
    });
  }
}
