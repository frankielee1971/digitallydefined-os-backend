// api/facebook/group.ts
// GET /api/facebook/group
// Returns FB Group metadata and links to Page-based endpoints
// NOTE: Meta deprecated the Facebook Groups API (April 2024)
// Direct group read/write via API is no longer available.
// The DigitallyDefined Page (ID: FB_PAGE_ID) is an admin of the group.
// Use /api/facebook/publishPost to post (appears on Page + group)
// Use /api/facebook/getPageFeed to read Page posts

import type { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', 'https://digitallydefined.online');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();

  return res.status(200).json({
    group_id: process.env.FB_GROUP_ID,
    page_id: process.env.FB_PAGE_ID,
    app_id: process.env.FB_APP_ID,
    status: 'Groups API deprecated April 2024 - using Page API',
    endpoints: {
      post_to_page_and_group: 'POST /api/facebook/publishPost',
      read_page_feed: 'GET /api/facebook/getPageFeed',
      page_info: 'GET /api/facebook/getPageInfo',
      send_message: 'POST /api/facebook/sendMessage',
    },
    docs: 'https://developers.facebook.com/docs/pages-api',
  });
}
