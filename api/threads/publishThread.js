export default async function handler(req, res) {
  const { token, message } = req.body;

  const response = await fetch(
    `https://graph.threads.net/v1.0/me/threads`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message, access_token: token })
    }
  );

  const data = await response.json();
  res.status(200).json(data);
}
