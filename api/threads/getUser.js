export default async function handler(req, res) {
  const { token } = req.query;

  const response = await fetch(
    `https://graph.threads.net/v1.0/me?fields=id,username&access_token=${token}`
  );

  const data = await response.json();
  res.status(200).json(data);
}
