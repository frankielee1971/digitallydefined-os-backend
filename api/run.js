export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { agentId, input } = req.body;

  if (!agentId || !input) {
    return res.status(400).json({ error: "Missing agentId or input" });
  }

  try {
    // Forward to Antigravity MCP
    const response = await fetch(process.env.ANTIGRAVITY_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.ANTIGRAVITY_API_KEY}`,
      },
      body: JSON.stringify({
        agent: agentId,
        input,
      }),
    });

    const data = await response.json();

    return res.status(200).json({ output: data.output });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Agent execution failed" });
  }
}
