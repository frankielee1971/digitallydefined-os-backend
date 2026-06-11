export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "https://dashboard.digitallydefined.online");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, x-api-key");
  res.setHeader("Access-Control-Allow-Credentials", "true");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const apiKey = req.headers['x-api-key'];
  const expectedKey = process.env.DASHBOARD_API_KEY;

  if (!expectedKey || apiKey !== expectedKey) {
    return res.status(401).json({ error: "Unauthorized - API key required" });
  }

  try {
    const body = await req.json();
    const message = body?.message;

    if (!message || typeof message !== 'string') {
      return res.status(400).json({ error: "Missing or invalid message field" });
    }

    return res.status(200).json({
      reply: `Hermes received: ${message.substring(0, 200)}`
    });
  } catch (error) {
    console.error("[Hermes] Error:", error);
    return res.status(500).json({
      error: "Hermes request failed",
      reply: "Sorry, I encountered an error. Please try again."
    });
  }
}