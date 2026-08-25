import {
  templates,
  buildPostText,
  parseResult,
  computeDayKey,
} from "../cron-content-sources.js";

import { listRoadmaps, getRoadmapById } from "./roadmaps/store.js";
import fs from "node:fs/promises";
import path from "node:path";

const CONTENT_BASE = path.join(process.cwd(), "content");
const ALLOWED_TEMPLATES = new Set(templates.map((t) => t.id));

/**
 * Safe async loader
 */
async function loadContentEntry(filePath) {
  try {
    return await fs.readFile(filePath, "utf8");
  } catch {
    return null;
  }
}

/**
 * Recursive folder scan (safe + async)
 */
async function scanContentFolder(baseDir, maxFiles = 20) {
  const results = [];

  async function walk(dir) {
    const entries = await fs.readdir(dir, { withFileTypes: true });

    for (const entry of entries) {
      if (results.length >= maxFiles) return;

      const fullPath = path.join(dir, entry.name);

      if (entry.isDirectory()) {
        await walk(fullPath);
        continue;
      }

      const ext = path.extname(entry.name).toLowerCase();
      if (![".md", ".txt", ".json"].includes(ext)) continue;

      const text = await loadContentEntry(fullPath);
      if (!text) continue;

      results.push({
        name: entry.name,
        path: fullPath,
        text: text.slice(0, 800), // more context
      });
    }
  }

  try {
    await walk(baseDir);
  } catch {
    // ignore missing folder
  }

  return results;
}

/**
 * Brand-aware summarizer (DigitallyDefined tone)
 */
function summarizePillarFromContent(text) {
  if (!text) return null;

  const cleaned = text
    .replace(/\s+/g, " ")
    .replace(/[\r\n]+/g, " ")
    .trim();

  const sentences = cleaned
    .split(/\.|\?|!/g)
    .map((s) => s.trim())
    .filter((s) => s.length > 20);

  const summary = sentences.slice(0, 3).join(". ");

  return summary
    ? `${summary}.`
    : null;
}

/**
 * Pull content from:
 * - content folder
 * - roadmap summaries
 * - NotebookLM → Notion intake (future)
 */
async function pickContentSource({ source, resultKey }) {
  const snippets = [];

  // Roadmap summaries
  try {
    const roadmaps = await listRoadmaps();
    for (const r of roadmaps.slice(0, 3)) {
      if (r.summary) {
        snippets.push({
          name: `roadmap-${r.id}`,
          summary: summarizePillarFromContent(r.summary),
        });
      }
    }
  } catch {
    // ignore roadmap failures
  }

  // Content folder
  try {
    const folderContent = await scanContentFolder(CONTENT_BASE);
    for (const item of folderContent) {
      const summary = summarizePillarFromContent(item.text);
      if (summary) snippets.push({ name: item.name, summary });
    }
  } catch {
    // ignore
  }

  return snippets.slice(0, 3);
}

/**
 * Main enrichment function
 */
export async function enrichContext(rawBody) {
  const parsed = parseResult(rawBody);

  if (!parsed) {
    return {
      source: "cron",
      templates: templates.map((t) => t.id),
      postText: null,
      contentSummary: null,
    };
  }

  const postText = buildPostText({
    source: parsed.source,
    resultKey: parsed.resultKey,
    scorecardTier: parsed.scorecardTier,
    calculatorInsight: parsed.calculatorInsight,
    pillarSummary: parsed.pillarSummary,
    niche: parsed.niche,
    tool: parsed.tool,
  });

  const contentSummary = await pickContentSource({
    source: parsed.source,
    resultKey: parsed.resultKey,
  });

  return {
    ...parsed,
    templates: templates.map((t) => t.id),
    postText,
    contentSummary,
  };
}

export {
  pickContentSource,
  summarizePillarFromContent,
  scanContentFolder,
  loadContentEntry,
};
