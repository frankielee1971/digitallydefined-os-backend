import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DATA_DIR = path.join(__dirname, '..', '..', 'data', 'roadmaps');

function ensureDataDir() {
  try { fs.mkdirSync(DATA_DIR, { recursive: true }); } catch {}
}

function filePath(id) {
  return path.join(DATA_DIR, `${String(id).replace(/[^a-z0-9_-]/gi, '')}.json`);
}

function readJson(id) {
  const fp = filePath(id);
  try {
    const raw = fs.readFileSync(fp, 'utf8');
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function writeJson(id, payload) {
  ensureDataDir();
  fs.writeFileSync(filePath(id), JSON.stringify(payload, null, 2), 'utf8');
}

function listAll() {
  ensureDataDir();
  let files = [];
  try { files = fs.readdirSync(DATA_DIR); } catch { return []; }
  const items = [];
  for (const file of files) {
    if (!file.endsWith('.json')) continue;
    const fp = path.join(DATA_DIR, file);
    try {
      const raw = fs.readFileSync(fp, 'utf8');
      items.push(JSON.parse(raw));
    } catch {
      // skip corrupt file
    }
  }
  return items.sort((a, b) => new Date(b.storedAt || 0) - new Date(a.storedAt || 0));
}

export function storeRoadmap(entry) {
  const id = String(entry.id || `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`).trim();
  const payload = Object.assign({}, entry, { id, storedAt: new Date().toISOString() });
  writeJson(id, payload);
  return Promise.resolve(payload);
}

export function getRoadmapById(id) {
  const raw = readJson(id);
  if (!raw) throw new Error(`Roadmap not found: ${id}`);
  return Promise.resolve(raw);
}

export function listRoadmaps() {
  return Promise.resolve(listAll());
}
