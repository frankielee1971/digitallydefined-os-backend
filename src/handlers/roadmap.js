import { storeRoadmap, listRoadmaps } from '../../roadmaps/store.js';

export default async function roadmapHandler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Max-Age', '86400');

  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    if (req.method === 'GET') {
      const items = await listRoadmaps();
      return res.status(200).json({ ok: true, count: items.length, items });
    }

    if (req.method === 'POST') {
      const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body || {};
      const entry = {
        superpowerType: body.superpowerType || null,
        title: body.title || 'Roadmap',
        roadmap: body.roadmap || null,
        contact: body.contact || null,
        source: body.source || 'quiz',
        resultKey: body.resultKey || null,
        tags: Array.isArray(body.tags) ? body.tags : [],
      };

      const saved = await storeRoadmap(entry);
      return res.status(200).json({ ok: true, id: saved.id, tags: saved.tags });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    return res.status(500).json({ error: `Roadmap API failed: ${err?.message || err}` });
  }
}
