const LINKEDIN_API = 'https://api.linkedin.com/v2';

function getAccessToken() {
  return (Deno.env.get('LINKEDIN_ACCESS_TOKEN') || '').trim();
}

function getAuthorUrn() {
  return (Deno.env.get('LINKEDIN_AUTHOR_URN') || '').trim();
}

function headers() {
  const token = getAccessToken();
  return {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
    'X-Restli-Protocol-Version': '2.0.0',
  };
}

function requireLinkedInEnv() {
  const token = getAccessToken();
  const author = getAuthorUrn();
  if (!token || !author) {
    throw new Error('Missing LinkedIn access token or author URN');
  }
  return { token, author };
}

export async function publishToLinkedIn({ message = '', imageUrl = '' } = {}) {
  const { author } = requireLinkedInEnv();
  const token = getAccessToken();

  if (!message && !imageUrl) {
    return {
      ok: false,
      target: 'linkedin',
      error: 'LinkedIn requires a message or image URL to publish.',
      details: { hasMessage: !!message, hasImageUrl: !!imageUrl },
    };
  }

  try {
    const payload = {
      author,
      lifecycleState: 'PUBLISHED',
      specificContent: {
        'com.linkedin.ugc.ShareContent': {
          shareCommentary: {
            text: message || '',
          },
          shareMediaCategory: imageUrl ? 'IMAGE' : 'NONE',
          media: imageUrl
            ? [
                {
                  status: 'READY',
                  description: {
                    text: '',
                  },
                  media: imageUrl,
                },
              ]
            : undefined,
        },
      },
      visibility: {
        'com.linkedin.ugc.MemberNetworkVisibility': 'PUBLIC',
      },
    };

    const cleaned = JSON.parse(JSON.stringify(payload));
    if (!cleaned.specificContent['com.linkedin.ugc.ShareContent'].media) {
      delete cleaned.specificContent['com.linkedin.ugc.ShareContent'].media;
    }

    const res = await fetch(`${LINKEDIN_API}/ugcPosts`, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify(cleaned),
    });

    const text = await res.text();
    let data = null;
    try {
      data = JSON.parse(text);
    } catch {
      // ignore
    }

    if (!res.ok) {
      const msg = data?.message || data?.error?.message || text || `LinkedIn publish error ${res.status}`;
      return {
        ok: false,
        target: 'linkedin',
        error: msg,
        details: data,
        status: res.status,
      };
    }

    return {
      ok: true,
      target: 'linkedin',
      id: data?.id || null,
      details: data,
    };
  } catch (e) {
    return {
      ok: false,
      target: 'linkedin',
      error: e.message || 'LinkedIn publish failed',
    };
  }
}

export async function publishLinkedInFromNotionItem(item = {}) {
  const message = [item.title, item.source || item.excerpt || '']
    .filter(Boolean)
    .join('\n\n');

  const imageUrl = String(item.imageUrl || item.mediaUrl || item.coverImage || '').trim();

  const result = await publishToLinkedIn({ message, imageUrl });

  return {
    id: item.id,
    title: item.title,
    contentType: item.contentType,
    target: 'linkedin',
    result,
  };
}

export const linkedInEnv = {
  hasToken: !!getAccessToken(),
  hasAuthor: !!getAuthorUrn(),
};
