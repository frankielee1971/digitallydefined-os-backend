export default async function handler(req, res) {
  // ✅ Allow dashboard domain to talk to backend
  res.setHeader('Access-Control-Allow-Origin', 'https://dashboard.digitallydefined.online');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-api-key, Authorization');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  // Only allow POST for actual requests
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { message } = JSON.parse(req.body);

    const hermesSystemPrompt = "You are Hermes, the DigitallyDefined business partner. RESPOND USING PLAIN TEXT ONLY. NO MARKDOWN. NO FORMATTING. NO BOLD. NO ITALICS. NO LISTS. NO BULLETS. NO NUMBERED LISTS. NO CODE BLOCKS. NO SYMBOLS. NO SPECIAL CHARACTERS. Use simple sentences with normal punctuation only.";

    // Strip ALL markdown formatting to ensure plain text only
    const stripMarkdown = (text) => {
      return text
        .replace(/```[\s\S]*?```/g, '')
        .replace(/\*\*\*[^\*]+\*\*\*/g, '')
        .replace(/\*\*[^\*]+\*\*/g, '')
        .replace(/\*[^\*]+\*/g, '')
        .replace(/_[^_]+_/g, '')
        .replace(/`[^`]+`/g, '')
        .replace(/^>\s*/gm, '')
        .replace(/^\s*[-*+]\s+/gm, '')
        .replace(/^\s*\d+\.\s+/gm, '')
        .replace(/[\n\r]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
    };

    let reply = null;

    // Try Antigravity MCP first
    const antigravityApiKey = process.env.ANTIGRAVITY_API_KEY;
    if (antigravityApiKey) {
      try {
        console.log('[Hermes] Trying Antigravity MCP...');
        const agResponse = await fetch('https://api.antigravity.so/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${antigravityApiKey.trim()}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: process.env.ANTIGRAVITY_MODEL || 'default',
            messages: [
              { role: "system", content: hermesSystemPrompt },
              { role: "user", content: message },
            ],
            temperature: 0.35,
            max_tokens: 650,
          }),
        });

        const agData = await agResponse.json();
        if (agResponse.ok && agData?.choices?.[0]?.message?.content) {
          reply = stripMarkdown(agData.choices[0].message.content);
          console.log('[Hermes] Antigravity MCP response received');
        }
      } catch (agErr) {
        console.error('[Hermes] Antigravity MCP error:', agErr.message);
      }
    }

    // Fall back to NousResearch if Antigravity not available or failed
    if (!reply) {
      const nousApiKey = process.env.NOUS_API_KEY;
      if (!nousApiKey) {
        return res.status(200).json({
          reply: 'Hermes is ready but AI model is not configured. Please set ANTIGRAVITY_API_KEY or NOUS_API_KEY to enable AI responses.',
        });
      }

      console.log('[Hermes] Falling back to NousResearch...');
      const response = await fetch("https://api.nousresearch.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${nousApiKey}`
        },
        body: JSON.stringify({
          model: "qwen-3.7-pro",
          messages: [
            { role: "system", content: hermesSystemPrompt },
            { role: "user", content: message }
          ]
        })
      });

      const data = await response.json();
      reply = stripMarkdown(data.choices?.[0]?.message?.content || "No response from Hermes.");
    }

    return res.status(200).json({ reply });
  } catch (error) {
    console.error("Hermes API Error:", error);
    return res.status(500).json({ error: "Hermes integration failed" });
  }
}
