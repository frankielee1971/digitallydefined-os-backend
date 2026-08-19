import {
  templates,
  buildPostText,
  parseResult,
  computeDayKey,
} from '../cron-content-sources.js';
import { listRoadmaps, getRoadmapById } from './roadmaps/store.js';
import fs from 'node:fs/promises';
import path from 'node:path';

const CONTENT_BASE = path.join(process.cwd(), 'content');
const ALLOWED_TEMPLATES = new Set(templates.map((t) => t.id));

function loadContentEntry(filePath) {
  try {
    const raw = fs.readFileSync(filePath, 'utf8');
    return raw;
  } catch {
    return null;
  }
}

function scanContentFolder(baseDir, maxFiles = 20) {
  let results = [];
  try {
    const entries = fs.readdirSync(baseDir, { recursive: true, withFileTypes: true });
    let count = 0;
    for (const entry of entries) {
      if (count >= maxFiles) break;
      const fullPath = path.join(baseDir, entry.name);
      if (!entry.isFile()) continue;
      const ext = path.extname(entry.name).toLowerCase();
      if (!['.md', '.txt', '.json'].includes(ext)) continue;
      const text = loadContentEntry(fullPath);
      if (!text) continue;
      results.push({ name: entry.name, path: fullPath, text: text.slice(0, 400) });
      count += 1;
    }
  } catch {
    // ignore missing content folder
  }
  return results;
}

function summarizePillarFromContent(pillarText) {
  if (!pillarText) return null;
  const sentences = pillarText
    .replace(/\s+/g, ' ')
    .split('.')
    .map((s) => s.trim())
    .filter((s) => s.length > 10);
  return sentences.slice(0, 3).join('. ') + '.';
}

function pickContentSource({ source, resultKey }) {
  const snippets = [];
  try {
    const roadmaps = listRoadmaps ? [] : [];
  } catch {
    // ignore store failures
  }
  try {
    const folderContent = scanContentFolder(CONTENT_BASE);
    for (const item of folderContent) {
      const summary = summarizePillarFromContent(item.text);
      if (summary) snippets.push({ name: item.name, summary });
    }
  } catch {
    // ignore
  }
  return snippets.slice(0, 3);
}

export function enrichContext(rawBody) {
  const parsed = parseResult(rawBody);
  if (!parsed) return { source: 'cron', templates: templates.map((t) => t.id), postText: null, contentSummary: null };

  const postText = buildPostText({
    source: parsed.source,
    resultKey: parsed.resultKey,
    scorecardTier: parsed.scorecardTier,
    calculatorInsight: parsed.calculatorInsight,
    pillarSummary: parsed.pillarSummary,
    niche: parsed.niche,
    tool: parsed.tool,
  });

  const contentSummary = pickContentSource({ source: parsed.source, resultKey: parsed.resultKey });

  return {
    ...parsed,
    templates: templates.map((t) => t.id),
    postText,
    contentSummary,
  };
}

export { pickContentSource, summarizePillarFromContent, scanContentFolder, loadContentEntry };
