import type { VercelRequest, VercelResponse } from '@vercel/node';
import { google } from 'googleapis';
import { getGoogleAuth } from '../_utils/googleAuth.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    const auth = getGoogleAuth([
      'https://www.googleapis.com/auth/analytics.readonly'
    ]);

    const analytics = google.analytics('v3');

    const response = await analytics.data.realtime.get({
      auth,
      ids: `ga:${process.env.GA_VIEW_ID}`,
      metrics: 'rt:activeUsers'
    });

    return res.status(200).json({
      activeUsers: response.data.totalsForAllResults?.['rt:activeUsers'] || 0
    });
  } catch (error: any) {
    console.error('Analytics Realtime Error:', error);
    return res.status(500).json({ error: error.message || 'Internal server error' });
  }
}

