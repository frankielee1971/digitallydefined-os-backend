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

function requireInstagramEnv() {
  const accountId = getInstagramAccountId();
  const token = getPageToken();
  if (!accountId || !token) {
    throw new Error('Missing Instagram Account ID or access token');
  }
  return { accountId, token };
}

async function createInstagramMedia({ accountId, caption, imageUrl }) {
  const body = { caption };
  if (imageUrl) {
    body.image_url = imageUrl;
  }

  const res = await fetch(
    `${INSTAGRAM_API}/${accountId}/media`,
    {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify(body),
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
    const msg = data?.error?.message || text || `Instagram media create error ${res.status}`;
    throw new Error(msg);
  }

  return data;
}

async function publishInstagramMedia({ accountId, creationId }) {
  const res = await fetch(
    `${INSTAGRAM_API}/${accountId}/media_publish`,
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
    const msg = data?.error?.message || text || `Instagram publish error ${res.status}`;
    throw new Error(msg);
  }

  return data;
}

export async function publishToInstagram({ message = '', imageUrl = '' } = {}) {
  return guardLivePost({
    target: 'instagram',
    ok: false,
    error: 'Live cron posts are disabled. Set LIVE_CRON_POSTS=1 after wiring tokens.',
    liveDisabled: true,
  });
}

export async function publishInstagramFromNotionItem(item = {}) {
  return {
    id: item.id,
    title: item.title,
    contentType: item.contentType,
    target: 'instagram',
    result: await publishToInstagram({ message: item.title }),
  };
}

export const instagramEnv = {
  hasAccountId: !!getInstagramAccountId(),
  hasToken: !!getPageToken(),
};
