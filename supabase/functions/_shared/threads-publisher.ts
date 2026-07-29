const INSTAGRAM_API = 'https://graph.facebook.com/v21.0';

function getInstagramAccountId() {
  return (
    Deno.env.get('INSTAGRAM_ACCOUNT_ID') ||
    Deno.env.get('INSTAGRAM_BUSINESS_ACCOUNT_ID') ||
    ''
  ).trim();
}

function getPageToken() {
  return (Deno.env.get('FACEBOOK_ACCESS_TOKEN') || '').trim();
}

function headers() {
  const token = getPageToken();
  return {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  };
}

function requireThreadsEnv() {
  const accountId = getInstagramAccountId();
  const token = getPageToken();
  if (!accountId || !token) {
    throw new Error('Missing Instagram/Threads Account ID or access token');
  }
  return { accountId, token };
}

async function createThreadsMedia({ accountId, text, imageUrl }) {
  const body = {
    media_type: imageUrl ? 'IMAGE' : 'TEXT',
    text: text || '',
  };

  if (imageUrl) {
    body.image_url = imageUrl;
  }

  const res = await fetch(
    `${INSTAGRAM_API}/${accountId}/threads_media`,
    {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify(body),
    }
  );

  const textResp = await res.text();
  let data = null;
  try {
    data = JSON.parse(textResp);
  } catch {
    // ignore
  }

  if (!res.ok) {
    const msg = data?.error?.message || textResp || `Threads media create error ${res.status}`;
    throw new Error(msg);
  }

  return data;
}

async function publishThreadsMedia({ accountId, creationId }) {
  const res = await fetch(
    `${INSTAGRAM_API}/${accountId}/threads_publish`,
    {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({
        creation_id: creationId,
        access_token: getPageToken(),
      }),
    }
  );

  const text = await res.text();
  let data = null;
  try {
    data = JSON.parse(text);
  } catch {
    // ignore
  }

  if (!res.ok) {
    const msg = data?.error?.message || text || `Threads publish error ${res.status}`;
    throw new Error(msg);
  }

  return data;
}

export async function publishToThreads({ message = '', imageUrl = '' } = {}) {
  return guardLivePost({
    target: 'threads',
    ok: false,
    error: 'Live cron posts are disabled. Set LIVE_CRON_POSTS=1 after wiring tokens.',
    liveDisabled: true,
  });
}

export async function publishThreadsFromNotionItem(item = {}) {
  return {
    id: item.id,
    title: item.title,
    contentType: item.contentType,
    target: 'threads',
    result: await publishToThreads({ message: item.title }),
  };
}

export const threadsEnv = {
  hasAccountId: !!getInstagramAccountId(),
  hasToken: !!getPageToken(),
};
