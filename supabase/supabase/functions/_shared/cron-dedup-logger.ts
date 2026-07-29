import fs from 'node:fs/promises';
import path from 'node:path';

const LOG_PATH = Deno.env.get('CRON_LOG_PATH') ? path.resolve(process.cron_LOG_PATH || Deno.env.get('CRON_LOG_PATH')) : null;
const DEDUP_PATH = Deno.env.get('CRON_DEDUP_STORE_PATH') ? path.resolve(Deno.env.get('CRON_DEDUP_STORE_PATH')) : null;

async function ensureDir(filePath) {
  const dir = path.dirname(filePath);
  await fs.mkdir(dir, { recursive: true });
}

async function appendLog(line) {
  if (!LOG_PATH) return;
  try {
    await ensureDir(LOG_PATH);
    const entry = `${new Date().toISOString()} ${line}\n`;
    await fs.appendFile(LOG_PATH, entry, 'utf8');
  } catch {
    // ignore log failures
  }
}

async function loadDedup() {
  if (!DEDUP_PATH) return new Set();
  try {
    const raw = await fs.readFile(DEDUP_PATH, 'utf8');
    const lines = raw.split('\n').filter((l) => l.trim());
    return new Set(lines);
  } catch {
    return new Set();
  }
}

async function saveDedup(set) {
  if (!DEDUP_PATH) return;
  try {
    await ensureDir(DEDUP_PATH);
    const lines = Array.from(set).slice(-10000);
    await fs.writeFile(DEDUP_PATH, lines.join('\n') + '\n', 'utf8');
  } catch {
    // ignore dedup persistence failures
  }
}

function hashString(input) {
  let h = 0;
  const str = String(input || '');
  for (let i = 0; i < str.length; i += 1) {
    h = (h * 31 + str.charCodeAt(i)) | 0;
  }
  return `dedup-${Math.abs(h)}-${str.length}`;
}

async function isDuplicate(key) {
  const set = await loadDedup();
  if (set.has(key)) return true;
  set.add(key);
  await saveDedup(set);
  return false;
}

export { appendLog, loadDedup, saveDedup, hashString, isDuplicate };
