/**
 * lib/notion-client.mjs
 *
 * Live Notion API client for DigitallyDefined Phase 21 operations.
 *
 * This module intentionally uses scrubbed environment-configurable
 * endpoints/tokens. Replace the env var values when wiring live.
 */

const NOTION_VERSION = process.env.NOTION_VERSION || '2022-06-28';
const BASE_URL = (() => {
  let base = (process.env.NOTION_BASE_URL || 'https://api.notion.com/v1').replace(/\/+$/, '');
  if (!base.endsWith('/v1')) base = `${base}/v1`;
  return base;
})();
const TOKEN = process.env.NOTION_TOKEN || null;

function headers(extra = {}) {
  if (!TOKEN) {
    throw new Error('NOTION_TOKEN is not configured');
  }
  return {
    'Authorization': `Bearer ${TOKEN}`,
    'Notion-Version': NOTION_VERSION,
    'Content-Type': 'application/json',
    ...extra,
  };
}

async function notion(pathname, body = null, method = 'GET') {
  const url = `${BASE_URL}/${pathname.replace(/^\/+/, '')}`;
  const response = await fetch(url, {
    method,
    headers: headers(),
    body: body ? JSON.stringify(body) : null,
  });

  const contentType = response.headers.get('content-type') || '';
  let data;
  if (contentType.includes('application/json')) {
    data = await response.json();
  } else {
    data = { raw: await response.text() };
  }

  if (!response.ok) {
    const err = new Error(data.message || data.raw || `Notion ${response.status}`);
    err.status = response.status;
    err.body = data;
    throw err;
  }

  return data;
}

function parseNotionResponse(body) {
  const text = typeof body === 'string' ? body : JSON.stringify(body);
  try {
    const data = JSON.parse(text);
    if (data && typeof data === 'object' && data.object === 'error') {
      const err = new Error(data.message || 'Notion API error');
      err.status = data.status;
      err.code = data.code;
      err.body = data;
      throw err;
    }
    return data;
  } catch (err) {
    if (err.status) throw err;
    throw new Error(`Invalid Notion response: ${err.message}`);
  }
}

export async function createDatabase({ parentId, title, properties = {} }) {
  const createDatabasePayload = {
    parent: { type: 'page_id', page_id: parentId },
    title: Array.isArray(title) ? title : [{ type: 'text', text: { content: title } }],
    properties,
  };
  const url = `${BASE_URL}/databases`;
  const response = await fetch(url, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify(createDatabasePayload),
  });
  const raw = await response.text();
  const created = parseNotionResponse(raw);
  return {
    ok: true,
    id: created?.id,
    url: created?.url,
    title: created?.title?.[0]?.plain_text || created?.properties?.Name?.title?.[0]?.plain_text || '',
  };
}

export async function getDatabase(databaseId) {
  return notion(`/databases/${databaseId}`);
}

export async function patchDatabase(databaseId, properties) {
  return notion(`/databases/${databaseId}`, { properties }, 'PATCH');
}

export async function createPage({ databaseId, properties = {}, parent = null }) {
  const payload = {
    parent: databaseId ? { database_id: databaseId } : parent,
    properties,
  };
  return notion('/pages', payload, 'POST');
}

export async function queryDatabase(databaseId, body = {}) {
  return notion(`/databases/${databaseId}/query`, body, 'POST');
}

export const hasNotionEnv = Boolean(TOKEN && BASE_URL);
