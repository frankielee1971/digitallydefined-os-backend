import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getFirestore } from '../_utils/firebaseAdmin.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { collection, id } = req.query;

    if (!collection || typeof collection !== 'string') {
      return res.status(400).json({ error: 'Missing collection' });
    }

    if (!id || typeof id !== 'string') {
      return res.status(400).json({ error: 'Missing id' });
    }

    const snapshot = await getFirestore().collection(collection).doc(id).get();

    if (!snapshot.exists) {
      return res.status(404).json({ error: 'Document not found' });
    }

    return res.status(200).json({
      id: snapshot.id,
      data: snapshot.data(),
    });
  } catch (error: any) {
    console.error('Firestore get error:', error);
    return res.status(500).json({ error: error.message || 'Internal server error' });
  }
}
