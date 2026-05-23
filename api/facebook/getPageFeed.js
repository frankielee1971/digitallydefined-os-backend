// api/facebook/getPageFeed.js
// GET /api/facebook/getPageFeed
// Reads the DigitallyDefined Facebook Page feed
// Includes posts from the Page which also appear in the linked group

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', 'https://digitallydefined.online');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const PAGE_ID = process.env.FB_PAGE_ID;
  const PAGE_TOKEN = process.env.FB_PAGE_ACCESS_TOKEN;
  const limit = req.query.limit || 10;
  const fields = req.query.fields || 'id,message,story,created_time,full_picture,permalink_url,likes.summary(true),comments.summary(true)';

  try {
    const url = `https://graph.facebook.com/v24.0/${PAGE_ID}/feed?fields=${fields}&limit=${limit}&access_token=${PAGE_TOKEN}`;

    const fbRes = await fetch(url);
    const data = await fbRes.json();

    if (data.error) {
      console.error('FB API error:', data.error);
      return res.status(400).json({ error: data.error.message, code: data.error.code });
    }

    return res.status(200).json({
      success: true,
      count: data.data?.length || 0,
      posts: data.data || [],
      paging: data.paging || null,
    });
  } catch (err) {
    console.error('getPageFeed error:', err);
    return res.status(500).json({ error: 'Internal server error', details: err.message });
  }
}
