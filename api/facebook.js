// api/facebook.js
// Consolidated Facebook API handler for Vercel Hobby plan (12 function limit)
// Routes: GET ?action=getFeed | GET ?action=getPageInfo | POST ?action=publishPost
//         POST ?action=sendMessage | GET ?action=getGroup

export default async function handler(req, res) {
  const CORS_ORIGIN = 'https://digitallydefined.online';
  res.setHeader('Access-Control-Allow-Origin', CORS_ORIGIN);
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const PAGE_ID = process.env.FB_PAGE_ID;
  const PAGE_TOKEN = process.env.FB_PAGE_ACCESS_TOKEN;
  const action = req.query.action;

  if (!PAGE_ID || !PAGE_TOKEN) {
    return res.status(500).json({ error: 'Missing FB env vars' });
  }

  // --- GET FEED ---
  if (req.method === 'GET' && action === 'getFeed') {
    const limit = req.query.limit || 10;
    const fields = req.query.fields || 'id,message,story,created_time,full_picture,permalink_url,likes.summary(true),comments.summary(true)';
    try {
      const url = `https://graph.facebook.com/v24.0/${PAGE_ID}/feed?fields=${fields}&limit=${limit}&access_token=${PAGE_TOKEN}`;
      const fbRes = await fetch(url);
      const data = await fbRes.json();
      if (data.error) return res.status(400).json({ error: data.error.message, code: data.error.code });
      return res.status(200).json({ success: true, count: data.data?.length || 0, posts: data.data || [], paging: data.paging || null });
    } catch (err) {
      return res.status(500).json({ error: 'Internal server error', details: err.message });
    }
  }

  // --- GET PAGE INFO ---
  if (req.method === 'GET' && action === 'getPageInfo') {
    try {
      const fields = req.query.fields || 'id,name,about,fan_count,picture,cover,link';
      const url = `https://graph.facebook.com/v24.0/${PAGE_ID}?fields=${fields}&access_token=${PAGE_TOKEN}`;
      const fbRes = await fetch(url);
      const data = await fbRes.json();
      if (data.error) return res.status(400).json({ error: data.error.message, code: data.error.code });
      return res.status(200).json({ success: true, page: data });
    } catch (err) {
      return res.status(500).json({ error: 'Internal server error', details: err.message });
    }
  }

  // --- GET GROUP INFO (Page-based, Groups API deprecated Apr 2024) ---
  if (req.method === 'GET' && action === 'getGroup') {
    const GROUP_ID = process.env.FB_GROUP_ID || '998061985979436';
    return res.status(200).json({
      notice: 'Meta deprecated the Facebook Groups API in April 2024. Direct group read/write is unavailable.',
      group_id: GROUP_ID,
      page_id: PAGE_ID,
      workaround: 'Posts made to the Page via publishPost appear in the linked Group automatically.',
      endpoints: {
        getFeed: '/api/facebook?action=getFeed',
        publishPost: '/api/facebook?action=publishPost (POST)',
        getPageInfo: '/api/facebook?action=getPageInfo',
      }
    });
  }

  // --- PUBLISH POST ---
  if (req.method === 'POST' && action === 'publishPost') {
    const { message, link } = req.body || {};
    if (!message) return res.status(400).json({ error: 'message is required' });
    try {
      const body = new URLSearchParams();
      body.append('message', message);
      body.append('access_token', PAGE_TOKEN);
      if (link) body.append('link', link);
      const fbRes = await fetch(`https://graph.facebook.com/v24.0/${PAGE_ID}/feed`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: body.toString(),
      });
      const data = await fbRes.json();
      if (data.error) return res.status(400).json({ error: data.error.message, code: data.error.code });
      return res.status(200).json({ success: true, post_id: data.id, message: 'Posted to DigitallyDefined Page (cross-posts to linked Group)' });
    } catch (err) {
      return res.status(500).json({ error: 'Internal server error', details: err.message });
    }
  }

  // --- SEND MESSAGE (Page Messaging) ---
  if (req.method === 'POST' && action === 'sendMessage') {
    const { recipient_id, message_text } = req.body || {};
    if (!recipient_id || !message_text) return res.status(400).json({ error: 'recipient_id and message_text are required' });
    try {
      const fbRes = await fetch(`https://graph.facebook.com/v24.0/${PAGE_ID}/messages?access_token=${PAGE_TOKEN}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ recipient: { id: recipient_id }, message: { text: message_text } }),
      });
      const data = await fbRes.json();
      if (data.error) return res.status(400).json({ error: data.error.message, code: data.error.code });
      return res.status(200).json({ success: true, message_id: data.message_id });
    } catch (err) {
      return res.status(500).json({ error: 'Internal server error', details: err.message });
    }
  }

  return res.status(400).json({
    error: 'Invalid action or method',
    usage: {
      'GET ?action=getFeed': 'Read Page feed (appears in linked Group)',
      'GET ?action=getPageInfo': 'Get Page metadata',
      'GET ?action=getGroup': 'Group info + API status',
      'POST ?action=publishPost': 'Publish post to Page (body: {message, link?})',
      'POST ?action=sendMessage': 'Send Page message (body: {recipient_id, message_text})',
    }
  });
}
