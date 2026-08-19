function requireLiveCronPosts() {
  const flag = String(Deno.env.get('LIVE_CRON_POSTS') || Deno.env.get('CRON_LIVE_POSTS') || '0').trim().toLowerCase();
  return flag === '1' || flag === 'true' || flag === 'yes';
}

function guardLivePost(result) {
  if (!requireLiveCronPosts()) {
    return { ...result, ok: false, target: result.target, error: 'Live cron posts are disabled. Set LIVE_CRON_POSTS=1 after wiring tokens.', liveDisabled: true };
  }
  return result;
}

function safeMetaImport() {
  try {
    const mod = require('../config/meta.json');
    return mod && mod.facebook ? mod.facebook : {};
  } catch {
    return {};
  }
}

const FACEBOOK_API = 'https://graph.facebook.com/v21.0';

function getPageToken() {
  const fromEnv = (Deno.env.get('FACEBOOK_ACCESS_TOKEN') || '').trim();
  if (fromEnv) return fromEnv;
  const fromMeta = safeMetaImport();
  return (fromMeta.access_token || '').trim();
}

function getGroupId() {
  const fromEnv = Deno.env.get('FACEBOOK_GROUP_ID') || '';
  if (fromEnv) return fromEnv;
  const fromMeta = safeMetaImport();
  return fromMeta.group_id || '';
}

function getPageId() {
  const fromEnv = Deno.env.get('FACEBOOK_PAGE_ID') || '';
  if (fromEnv) return fromEnv;
  const fromMeta = safeMetaImport();
  return fromMeta.page_id || '';
}

function headers() {
  const token = getPageToken();
  return {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  };
}

export async function postToPage(message) {
  return guardLivePost({
    target: 'facebook-page',
    ok: false,
    error: 'Live cron posts are disabled. Set LIVE_CRON_POSTS=1 after wiring tokens.',
    liveDisabled: true,
  });
}

export async function postToGroup(message) {
  return guardLivePost({
    target: 'facebook-group',
    ok: false,
    error: 'Live cron posts are disabled. Set LIVE_CRON_POSTS=1 after wiring tokens.',
    liveDisabled: true,
  });
}

export async function publishToFacebook(options = {}) {
  const {
    message = '',
    toPage = false,
    toGroup = false,
  } = options;

  const results = [];
  const errors = [];

  if (toPage) {
    try {
      const pageResult = await postToPage(message);
      results.push({ target: 'page', ...pageResult });
    } catch (e) {
      errors.push({ target: 'page', error: e.message });
    }
  }

  if (toGroup) {
    try {
      const groupResult = await postToGroup(message);
      results.push({ target: 'group', ...groupResult });
    } catch (e) {
      errors.push({ target: 'group', error: e.message });
    }
  }

  return {
    ok: results.length > 0,
    results,
    errors,
  };
}

export const facebookEnv = {
  hasToken: !!getPageToken(),
  hasPageId: !!getPageId(),
  hasGroupId: !!getGroupId(),
};
