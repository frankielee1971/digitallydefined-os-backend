/**
 * lib/notion-client.js
 *
 * Real Notion API client for live writes.
 * Handles database creation and updates with proper error handling.
 */

const NOTION_API_BASE = 'https://api.notion.com/v1';

/**
 * Create a new Notion database
 * @param {string} secret - Notion integration token
 * @param {object} payload - Database creation payload
 * @returns {Promise<object>} Created database response
 */
export async function createDatabase(secret, payload) {
  const res = await fetch(`${NOTION_API_BASE}/databases`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${secret}`,
      'Notion-Version': '2022-06-28',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Notion API error (${res.status}): ${text}`);
  }

  return res.json();
}

/**
 * Update an existing Notion database
 * @param {string} secret - Notion integration token
 * @param {string} databaseId - Database ID to update
 * @param {object} payload - Database update payload
 * @returns {Promise<object>} Updated database response
 */
export async function updateDatabase(secret, databaseId, payload) {
  const res = await fetch(`${NOTION_API_BASE}/databases/${databaseId}`, {
    method: 'PATCH',
    headers: {
      'Authorization': `Bearer ${secret}`,
      'Notion-Version': '2022-06-28',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Notion API error (${res.status}): ${text}`);
  }

  return res.json();
}