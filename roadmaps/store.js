import fs from 'node:fs/promises';
import path from 'node:path';

const DATA_DIR = path.join(process.cwd(), 'data', 'roadmaps');

async function ensureDataDir() {
  await fs.mkdir(DATA_DIR, { recursive: true });
}

export async function storeRoadmap(entry) {
  await ensureDataDir();
  const id = entry.id || `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  const payload = {
    ...entry,
    id,
    storedAt: new Date().toISOString(),
  };

  const filePath = path.join(DATA_DIR, `${id}.json`);
  await fs.writeFile(filePath, JSON.stringify(payload, null, 2), 'utf8');
  return payload;
}

export async function listRoadmaps() {
  await ensureDataDir();
  const files = await fs.readdir(DATA_DIR);
  const items = [];

  for (const file of files) {
    if (!file.endsWith('.json')) continue;
    const filePath = path.join(DATA_DIR, file);
    const raw = await fs.readFile(filePath, 'utf8');
    try {
      items.push(JSON.parse(raw));
    } catch {
      // skip corrupt file
    }
  }

  return items.sort((a, b) => new Date(b.storedAt) - new Date(a.storedAt));
}

export async function getRoadmapById(id) {
  const filePath = path.join(DATA_DIR, `${id}.json`);
  const raw = await fs.readFile(filePath, 'utf8');
  return JSON.parse(raw);
}
