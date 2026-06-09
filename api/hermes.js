export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "https://dashboard.digitallydefined.online");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  return res.status(200).json({ status: "Hermes Gateway active" });
}
