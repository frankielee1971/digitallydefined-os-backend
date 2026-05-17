import type { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    const groupId = process.env.FACEBOOK_GROUP_ID;
    const token = process.env.FACEBOOK_ACCESS_TOKEN;

    if (!groupId || !token) {
      return res.status(500).json({ error: 'Facebook env vars not set' });
    }

    const url = `https://graph.facebook.com/v18.0/${groupId}?fields=name,member_count&access_token=${token}`;

    const response = await fetch(url);
    const data = await response.json();

    if (!response.ok) {
      console.error('Facebook API error:', data);
      return res.status(500).json({ error: 'Facebook API error', details: data });
    }

    return res.status(200).json(data);
  } catch (error: any) {
    console.error('Facebook group error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
