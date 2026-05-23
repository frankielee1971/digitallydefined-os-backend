// api/facebook/publishPost.js
// POST /api/facebook/publishPost
// Posts a message to the DigitallyDefined Facebook Page
// The Page is an admin of the FB Group, so posts appear in both

export default async function handler(req, res) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', 'https://digitallydefined.online');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { message, link, image_url } = req.body;

  if (!message) {
    return res.status(400).json({ error: 'message is required' });
  }

  const PAGE_ID = process.env.FB_PAGE_ID;
  const PAGE_TOKEN = process.env.FB_PAGE_ACCESS_TOKEN;

  try {
    const body = new URLSearchParams();
    body.append('message', message);
    body.append('access_token', PAGE_TOKEN);
    if (link) body.append('link', link);

    const fbRes = await fetch(
      `https://graph.facebook.com/v24.0/${PAGE_ID}/feed`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: body.toString(),
      }
    );

    const data = await fbRes.json();

    if (data.error) {
      console.error('FB API error:', data.error);
      return res.status(400).json({ error: data.error.message, code: data.error.code });
    }

    return res.status(200).json({
      success: true,
      post_id: data.id,
      message: 'Posted to DigitallyDefined Page successfully',
    });
  } catch (err) {
    console.error('publishPost error:', err);
    return res.status(500).json({ error: 'Internal server error', details: err.message });
  }
}
