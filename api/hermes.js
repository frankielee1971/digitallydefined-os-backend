export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { message } = JSON.parse(req.body);

    const response = await fetch("https://api.nousresearch.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${process.env.NOUS_API_KEY}`
      },
      body: JSON.stringify({
        model: "qwen-3.7-pro",
        messages: [
          { role: "system", content: "You are Hermes, the DigitallyDefined business partner." },
          { role: "user", content: message }
        ]
      })
    });

    const data = await response.json();
    const reply = data.choices?.[0]?.message?.content || "No response from Hermes.";

    return res.status(200).json({ reply });

  } catch (error) {
    console.error("Hermes API Error:", error);
    return res.status(500).json({ error: "Hermes integration failed" });
  }
}


