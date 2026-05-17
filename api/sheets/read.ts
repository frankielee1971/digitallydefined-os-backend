import type { VercelRequest, VercelResponse } from '@vercel/node';
import { google } from 'googleapis';
import { getGoogleAuth } from '../_utils/googleAuth.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    const { sheetId, range } = req.query;

    if (!sheetId || !range) {
      return res.status(400).json({ error: 'Missing sheetId or range' });
    }

    // Authenticate using service account
    const auth = getGoogleAuth([
      'https://www.googleapis.com/auth/spreadsheets.readonly'
    ]);

    const sheets = google.sheets({ version: 'v4', auth });

    // Fetch data from Google Sheets
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: String(sheetId),
      range: String(range)
    });

    return res.status(200).json({
      values: response.data.values || []
    });
  } catch (error: any) {
    console.error('Sheets API error:', error);
    return res.status(500).json({ error: error.message || 'Internal server error' });
  }
}
