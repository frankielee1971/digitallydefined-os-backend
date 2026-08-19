// _shared/roadmaps-store.ts
// Filesystem-based roadmap store — converted from api/roadmaps/store.js
import * as fs from "node:fs";
import { join } from "node:path";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const DATA_DIR = join(__dirname, "..", "..", "data", "roadmaps");

function ensureDataDir() {
  try { fs.mkdirSync(DATA_DIR, { recursive: true }); } catch {}
}

function filePath(id: string) {
  return join(DATA_DIR, `${String(id).replace(/[^a-z0-9_-]/gi, "")}.json`);
}

function readJson(id: string): unknown | null {
  const fp = filePath(id);
  try {
    const raw = fs.readFileSync(fp, "utf8");
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function writeJson(id: string, payload: unknown) {
  ensureDataDir();
  fs.writeFileSync(filePath(id), JSON.stringify(payload, null, 2), "utf8");
}

export function storeRoadmap(entry: Record<string, unknown>) {
  ensureDataDir();
  const id = String(entry.id || `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`).trim();
  const payload = Object.assign({}, entry, { id, storedAt: new Date().toISOString() });
  writeJson(id, payload);
  return payload;
}

export function getRoadmapById(id: string) {
  const raw = readJson(id);
  if (!raw) throw new Error(`Roadmap not found: ${id}`);
  return raw;
}

export function listRoadmaps() {
  ensureDataDir();
  let files: string[] = [];
  try { files = fs.readdirSync(DATA_DIR); } catch { return []; }
  const items: unknown[] = [];
  for (const file of files) {
    if (!file.endsWith(".json")) continue;
    try {
      const raw = fs.readFileSync(join(DATA_DIR, file), "utf8");
      items.push(JSON.parse(raw));
    } catch { /* skip corrupt */ }
  }
  return items.sort((a: any, b: any) => new Date(b.storedAt || 0) - new Date(a.storedAt || 0));
}
