import type { VercelRequest, VercelResponse } from '@vercel/node';
import { google } from 'googleapis';
import { getGoogleAuth } from '../_utils/googleAuth.js';


export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    const { folderId } = req.query;

    if (!folderId || typeof folderId !== 'string') {
      return res.status(400).json({ error: 'Missing folderId' });
    }

    const scopes = ['https://www.googleapis.com/auth/drive.readonly'];
    const auth = getGoogleAuth(scopes);

    const drive = google.drive({ version: 'v3', auth });

    const response = await drive.files.list({
      q: `'${folderId}' in parents and trashed = false`,
      fields: 'files(id, name, mimeType)',
    });

    return res.status(200).json(response.data);
  } catch (error: any) {
    console.error('Drive list error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
