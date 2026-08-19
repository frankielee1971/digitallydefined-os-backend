// lib/sync-aggregator.js
// Shared aggregation logic for /sync and /api?action=dashboard routes.
// Centralizes all data-fetching so both endpoints return the same truth.

const parseJsonSafe = async (res, fallback = null) => {
  try {
    const contentType = res.headers.get('content-type') || '';
    if (!contentType.includes('application/json')) {
      const text = await res.text();
      return text ? JSON.parse(text) : fallback;
    }
    return await res.json();
  } catch {
    return fallback;
  }
};

function safeNumber(value, fallback = 0) {
  if (typeof value === 'number' && !Number.isNaN(value)) return value;
  if (typeof value === 'string') {
    const cleaned = value.replace(/[$,%\s,]/g, '');
    const parsed = Number(cleaned);
    return Number.isNaN(parsed) ? fallback : parsed;
  }
  return fallback;
}

function safeString(value, fallback = '') {
  if (typeof value === 'string' && value.trim()) return value;
  return fallback;
}

function formatPct(n) {
  return `${Number.isFinite(n) ? n.toFixed(1) : '0.0'}%`;
}

function formatUSD(n) {
  return `$${Number.isFinite(n) ? n.toLocaleString() : '0'}`;
}

async function fetchFacebookGroup() {
  const groupId = Deno.env.get('FACEBOOK_GROUP_ID');
  const token = Deno.env.get('FACEBOOK_ACCESS_TOKEN');

  if (!groupId || !token) {
    return { name: null, member_count: 0, error: 'Facebook env vars not set', debug: null };
  }

  try {
    const url = new URL(`https://graph.facebook.com/v21.0/${groupId}`);
    url.searchParams.set('fields', 'name');
    url.searchParams.set('access_token', token.trim());

    const res = await fetch(url.toString());
    const data = await parseJsonSafe(res, {});

    if (!res.ok) {
      const fbError = data?.error?.message || 'Facebook API error';
      console.error('[Facebook] API error:', fbError, '| code:', data?.error?.code, '| type:', data?.error?.type);
      throw new Error(fbError);
    }

    return {
      name: data?.name || null,
      member_count: 0,
      error: null,
      debug: null,
    };
  } catch (e) {
    console.error('[Facebook] fetchFacebookGroup failed:', e.message);
    return {
      name: null,
      member_count: 0,
      error: e.message || 'Facebook fetch failed',
      debug: Deno.env.get('NODE_ENV') || 'production' !== 'production' ? e.message || 'Facebook fetch failed' : null,
    };
  }
}

async function fetchBrevoStats() {
  const apiKey = Deno.env.get('BREVO_API_KEY');
  const listId = Deno.env.get('BREVO_LIST_ID') || '2';

  if (!apiKey) {
    return {
      totalSubscribers: 0,
      emailOpenRate: '0.0%',
      emailClickRate: '0.0%',
      emailReplyRate: 'N/A',
      emailRevenuePerCampaign: '$0',
      topCampaigns: [],
      error: 'Brevo API key not set',
      debug: null,
    };
  }

  try {
    console.log('[Brevo] Fetching account and contact stats...');
    
    // Get account info
    const accountResponse = await fetch('https://api.brevo.com/v3/account', {
      headers: {
        'api-key': apiKey.trim(),
      },
    });

    if (!accountResponse.ok) {
      const errorData = await parseJsonSafe(accountResponse, {});
      console.error('[Brevo] Account request failed:', accountResponse.status, errorData);
      throw new Error(`Brevo account request failed: ${accountResponse.status}`);
    }

    const accountData = await accountResponse.json();
    console.log('[Brevo] Account validated:', accountData.email || 'Connected');

    // Get list info and subscriber count
    let totalSubscribers = 0;
    let listName = 'List ' + listId;
    
    try {
      const listResponse = await fetch(`https://api.brevo.com/v3/contacts/lists/${listId}`, {
        headers: {
          'api-key': apiKey.trim(),
        },
      });

      if (listResponse.ok) {
        const listData = await parseJsonSafe(listResponse, {});
        listName = listData?.name || listName;
        totalSubscribers = safeNumber(listData?.totalSubscribers, 0);
        console.log(`[Brevo] List found: ${listName} with ${totalSubscribers} subscribers`);
      } else {
        console.log(`[Brevo] List ${listId} not found, will use 0 subscribers`);
      }
    } catch (listError) {
      console.warn('[Brevo] List fetch failed:', listError.message);
    }

    // Get recent email campaigns
    let topCampaigns = [];
    try {
      const campaignsResponse = await fetch('https://api.brevo.com/v3/emailCampaigns?limit=5&offset=0', {
        headers: {
          'api-key': apiKey.trim(),
        },
      });

      if (campaignsResponse.ok) {
        const campaignsData = await parseJsonSafe(campaignsResponse, {});
        const campaigns = Array.isArray(campaignsData?.campaigns) ? campaignsData.campaigns : [];
        
        topCampaigns = campaigns.slice(0, 5).map((campaign) => {
          const sent = safeNumber(campaign?.statistics?.sent, 0);
          const opened = safeNumber(campaign?.statistics?.open, 0);
          const clicked = safeNumber(campaign?.statistics?.click, 0);
          return {
            name: campaign?.name || campaign?.subject || 'Campaign',
            openRate: sent > 0 ? formatPct((opened / sent) * 100) : '0.0%',
            clickRate: sent > 0 ? formatPct((clicked / sent) * 100) : '0.0%',
            revenue: '$0',
          };
        });
        
        console.log(`[Brevo] Found ${topCampaigns.length} campaigns`);
      }
    } catch (campaignError) {
      console.warn('[Brevo] Campaigns fetch failed:', campaignError.message);
    }

    console.log('[Brevo] Stats obtained successfully');

    return {
      totalSubscribers,
      emailOpenRate: '0.0%',
      emailClickRate: '0.0%',
      emailReplyRate: 'N/A',
      emailRevenuePerCampaign: '$0',
      topCampaigns,
      error: null,
      debug: null,
    };
  } catch (e) {
    console.error('[Brevo] fetchBrevoStats failed:', e.message);
    return {
      totalSubscribers: 0,
      emailOpenRate: '0.0%',
      emailClickRate: '0.0%',
      emailReplyRate: 'N/A',
      emailRevenuePerCampaign: '$0',
      topCampaigns: [],
      error: e.message || 'Brevo fetch failed',
      debug: Deno.env.get('NODE_ENV') || 'production' !== 'production' ? e.message || 'Brevo fetch failed' : null,
    };
  }
}

async function fetchSheetsData() {
  const sheetsUrl = Deno.env.get('SHEETS_WEBHOOK_URL');
  if (!sheetsUrl) return { data: null, error: 'Sheets webhook not set', debug: null };

  try {
    const url = new URL(sheetsUrl);
    url.searchParams.set('action', 'dashboard');
    url.searchParams.set('t', String(Date.now()));

    const res = await fetch(url.toString(), {
      headers: { 'Cache-Control': 'no-store' },
    });

    if (!res.ok) {
      throw new Error(`Sheets returned ${res.status}`);
    }

    return { data: await parseJsonSafe(res, null), error: null, debug: null };
  } catch (err) {
    console.error('Sheets fetch failed:', err);
    return {
      data: null,
      error: err.message || 'Sheets fetch failed',
      debug: Deno.env.get('NODE_ENV') || 'production' !== 'production' ? err.message || 'Sheets fetch failed' : null,
    };
  }
}

async function fetchNotionData() {
  const apiKey = Deno.env.get('NOTION_API_KEY');
  const ideasDbId = Deno.env.get('NOTION_IDEAS_DB_ID');
  const contentDbId = Deno.env.get('NOTION_CONTENT_DB_ID');
  const automationsDbId = Deno.env.get('NOTION_AUTOMATIONS_DB_ID');

  if (!apiKey) {
    return { data: null, error: 'Notion API key not set', debug: null };
  }

  const databaseIds = [
    { key: 'ideas', id: ideasDbId },
    { key: 'content', id: contentDbId },
    { key: 'automations', id: automationsDbId },
  ].filter(({ id }) => id);

  if (databaseIds.length === 0) {
    return { data: null, error: 'No Notion database IDs configured', debug: null };
  }

  try {
    const notionData = {};
    const errors = [];

    for (const { key, id } of databaseIds) {
      try {
        const url = new URL(`https://api.notion.com/v1/databases/${id}/query`);

        const res = await fetch(url.toString(), {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${apiKey.trim()}`,
            'Notion-Version': '2022-06-28',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({}),
        });

        if (!res.ok) {
          const errorData = await parseJsonSafe(res, {});
          const errorMsg = errorData?.message || `Notion API returned ${res.status}`;
          console.error(`[Notion] API error for ${key}:`, errorMsg, '| status:', res.status);
          errors.push(`${key}: ${errorMsg}`);
          notionData[key] = { error: errorMsg };
          continue;
        }

        const data = await parseJsonSafe(res, {});
        console.log(`[Notion] Fetched ${key} data successfully`);
        notionData[key] = data;
      } catch (err) {
        console.error(`[Notion] Failed to fetch ${key}:`, err.message);
        errors.push(`${key}: ${err.message}`);
        notionData[key] = { error: err.message };
      }
    }

    const combinedData = {
      ideas: notionData.ideas || null,
      content: notionData.content || null,
      automations: notionData.automations || null,
    };

    return {
      data: combinedData,
      error: errors.length > 0 ? errors.join('; ') : null,
      debug: null,
    };
  } catch (err) {
    console.error('[Notion] fetchNotionData failed:', err.message);
    return {
      data: null,
      error: err.message || 'Notion fetch failed',
      debug: Deno.env.get('NODE_ENV') || 'production' !== 'production' ? err.message || 'Notion fetch failed' : null,
    };
  }
}

async function fetchNotionIntake() {
  const ideasDatabaseId = Deno.env.get('NOTION_IDEAS_DB_ID');
  const commandCenterDatabaseId = Deno.env.get('NOTION_COMMAND_CENTER_DB_ID');

  if (!ideasDatabaseId) {
    return {
      ok: false,
      alerts: [],
      reviewQueue: [],
      ideas: [],
      publishingQueue: [],
      approvals: [],
      buyerSignals: [],
      aiDrafts: [],
      error: 'Missing NOTION_IDEAS_DB_ID',
    };
  }

  try {
    const notionKey = (Deno.env.get('NOTION_API_KEY') || '').trim();
    const notionHeaders = {
      'Authorization': `Bearer ${notionKey}`,
      'Notion-Version': '2022-06-28',
      'Content-Type': 'application/json',
    };

    const postJson = async (url, body = {}) => {
      const res = await fetch(url.toString(), {
        method: 'POST',
        headers: notionHeaders,
        body: JSON.stringify(body),
      });
      const data = await parseJsonSafe(res, {});
      if (!res.ok) {
        const msg = data?.message || `Notion query failed with status ${res.status}`;
        console.error('[Notion] Query error:', msg, '| status:', res.status);
        throw new Error(msg);
      }
      return data;
    };

    const extractText = (prop) => {
      if (!prop || typeof prop !== 'object') return '';
      if (typeof prop === 'string') return prop;
      if (prop.rich_text) return prop.rich_text.map((t) => t.plain_text).join('').trim();
      if (prop.title) return prop.title.map((t) => t.plain_text).join('').trim();
      return '';
    };

    const extractSelect = (prop) => {
      if (!prop || typeof prop !== 'object') return '';
      return (prop.select?.name || '').trim();
    };

    const extractMultiSelect = (prop) => {
      if (!prop || typeof prop !== 'object') return [];
      return Array.isArray(prop.multi_select) ? prop.multi_select.map((s) => s.name) : [];
    };

    const extractUrl = (prop) => {
      if (!prop || typeof prop !== 'object') return '';
      return prop.url || '';
    };

    const extractDate = (prop) => {
      if (!prop || typeof prop !== 'object') return '';
      return prop.start || '';
    };

    const mapPage = (page, propsMap) => {
      const props = page.properties || {};
      const out = { id: page.id, url: page.url || '', lastEdited: page.last_edited_time || '' };
      for (const [key, source] of Object.entries(propsMap)) {
        if (source === 'title') out[key] = extractText(props.Title || props.Name);
        else if (source === 'text') out[key] = extractText(props[key]);
        else if (source === 'select') out[key] = extractSelect(props[key]);
        else if (source === 'multiselect') out[key] = extractMultiSelect(props[key]);
        else if (source === 'url') out[key] = extractUrl(props[key]);
        else if (source === 'date') out[key] = extractDate(props[key]);
        else out[key] = extractText(props[key]);
      }
      return out;
    };

    // Ideas & Intake
    const ideasData = await postJson(new URL(`https://api.notion.com/v1/databases/${ideasDatabaseId}/query`), {
      page_size: 20,
      sorts: [{ timestamp: 'created_time', direction: 'descending' }],
    });
    const ideas = Array.isArray(ideasData?.results)
      ? ideasData.results.map((page) =>
          mapPage(page, {
            title: 'title',
            status: 'select',
            route: 'select',
            score: 'select',
            products: 'multiselect',
            type: 'select',
          })
        )
      : [];

    const unscored = ideas.filter((idea) => !idea.score && (!idea.status || ['New', 'IDEA'].includes(idea.status)));
    const readyForReview = ideas.filter((idea) => ['Ready', 'Review', 'Build Now', 'Pending Approval'].includes(idea.status));

    const alerts = [
      { type: 'warning', source: 'Ideas & Intake', message: `${unscored.length} intake items need to be scored.` },
      ...(readyForReview.length > 0
        ? [{ type: 'warning', source: 'CEO Command Center', message: `${readyForReview.length} items are ready for review before publishing.` }]
        : []),
    ];

    const reviewQueue = alerts.map((a) => a.message);

    // Publishing Queue
    const publishingQueueId = Deno.env.get('NOTION_PUBLISHING_QUEUE_DB_ID');
    let publishingQueue = [];
    if (publishingQueueId) {
      try {
        const pqData = await postJson(new URL(`https://api.notion.com/v1/databases/${publishingQueueId}/query`), {
          page_size: 20,
          sorts: [{ timestamp: 'created_time', direction: 'descending' }],
        });
        publishingQueue = Array.isArray(pqData?.results)
          ? pqData.results.map((page) =>
              mapPage(page, {
                title: 'title',
                contentType: 'select',
                status: 'select',
                source: 'text',
                due: 'date',
                url: 'url',
              })
            )
          : [];
      } catch (e) {
        console.error('[Notion] Publishing queue query failed:', e.message);
      }
    }

    // Content Approvals
    const approvalsId = Deno.env.get('NOTION_CONTENT_APPROVALS_DB_ID');
    let approvals = [];
    if (approvalsId) {
      try {
        const apData = await postJson(new URL(`https://api.notion.com/v1/databases/${approvalsId}/query`), {
          page_size: 20,
          sorts: [{ timestamp: 'created_time', direction: 'descending' }],
        });
        approvals = Array.isArray(apData?.results)
          ? apData.results.map((page) =>
              mapPage(page, {
                title: 'title',
                contentType: 'select',
                status: 'select',
                requestedAt: 'date',
                approvedAt: 'date',
                notes: 'text',
              })
            )
          : [];
      } catch (e) {
        console.error('[Notion] Content approvals query failed:', e.message);
      }
    }

    // Buyer Signals
    const buyerSignalsId = Deno.env.get('NOTION_BUYER_SIGNALS_DB_ID');
    let buyerSignals = [];
    if (buyerSignalsId) {
      try {
        const bsData = await postJson(new URL(`https://api.notion.com/v1/databases/${buyerSignalsId}/query`), {
          page_size: 20,
          sorts: [{ timestamp: 'created_time', direction: 'descending' }],
        });
        buyerSignals = Array.isArray(bsData?.results)
          ? bsData.results.map((page) =>
              mapPage(page, {
                title: 'title',
                product: 'text',
                source: 'text',
                purchaseValue: 'text',
                timestamp: 'date',
                quizResult: 'text',
                customerEmail: 'text',
              })
            )
          : [];
      } catch (e) {
        console.error('[Notion] Buyer signals query failed:', e.message);
      }
    }

    // AI Content Drafts
    const aiDraftsId = Deno.env.get('NOTION_AI_CONTENT_DRAFTS_DB_ID');
    let aiDrafts = [];
    if (aiDraftsId) {
      try {
        const aiData = await postJson(new URL(`https://api.notion.com/v1/databases/${aiDraftsId}/query`), {
          page_size: 20,
          sorts: [{ timestamp: 'created_time', direction: 'descending' }],
        });
        aiDrafts = Array.isArray(aiData?.results)
          ? aiData.results.map((page) =>
              mapPage(page, {
                title: 'title',
                status: 'select',
                prompt: 'text',
                output: 'text',
                agent: 'text',
                model: 'text',
                timestamp: 'date',
              })
            )
          : [];
      } catch (e) {
        console.error('[Notion] AI drafts query failed:', e.message);
      }
    }

    return {
      ok: true,
      alerts,
      reviewQueue,
      ideas,
      publishingQueue,
      approvals,
      buyerSignals,
      aiDrafts,
      error: null,
    };
  } catch (err) {
    console.error('[Notion] fetchNotionIntake failed:', err.message);
    return {
      ok: false,
      alerts: [],
      reviewQueue: [],
      ideas: [],
      publishingQueue: [],
      approvals: [],
      buyerSignals: [],
      aiDrafts: [],
      error: err.message || 'Notion intake fetch failed',
    };
  }
}

async function buildAIBrief(context) {
  const notionIdeasSnapshot = Array.isArray(context.notionIdeas)
    ? context.notionIdeas.slice(0, 8).map((idea) => `${idea.title || 'Untitled'} [${idea.score || 'unscored'}] ${idea.route || 'no route'}`).join('; ')
    : 'none';

  const prompt = `You are analyzing a digital business dashboard for DigitallyDefined — a faceless digital asset business targeting Gen X women.

Current stats:
- Community count: ${context.communityCount || 0}
- Community growth: ${context.communityGrowth || '0%'}
- Email subscribers: ${context.emailSubscribers || 0}
- Email open rate: ${context.emailOpenRate || '0%'}
- Email click rate: ${context.emailClickRate || '0%'}
- Top performing asset: ${context.topAsset || 'N/A'}
- Revenue: ${context.revenue || '$0'}
- Active idea priorities from Notion: ${notionIdeasSnapshot}

Respond ONLY with a JSON object in this exact format (no markdown, no extra text):
{
  "working": ["one sentence max per item, 2-3 items"],
  "slipping": ["one sentence max per item, 1-2 items"],
  "nextActions": ["one sentence max per item, 1-2 items"]
}`;

  try {
    const { omniRoute } = await import('./omniroute.js');
    const result = await omniRoute(prompt, {
      systemPrompt: 'You are a business analyst AI. Provide concise, actionable insights in JSON format.',
      jsonMode: true,
      timeout: 60000,
      fallbackModels: [
        Deno.env.get('OMNIROUTE_FALLBACK_MODEL_1'),
        Deno.env.get('OMNIROUTE_FALLBACK_MODEL_2'),
      ].filter(Boolean),
    });

    if (result.error) {
      return {
        working: ['Community is active and syncing.'],
        slipping: ['AI brief could not be generated right now.'],
        nextActions: ['Verify OmniRoute configuration if this persists.'],
        error: result.error,
        debug: Deno.env.get('NODE_ENV') || 'production' !== 'production' ? result.error : null,
      };
    }

    const raw = result.reply || '{}';
    const cleaned = String(raw).replace(/```json|```/g, '').trim();

    let parsed;
    try {
      parsed = JSON.parse(cleaned);
    } catch {
      parsed = {
        working: ['AI returned non-JSON output.'],
        slipping: [],
        nextActions: ['Tighten prompt or validate model response.'],
      };
    }

    return {
      working: Array.isArray(parsed?.working) ? parsed.working : [],
      slipping: Array.isArray(parsed?.slipping) ? parsed.slipping : [],
      nextActions: Array.isArray(parsed?.nextActions) ? parsed.nextActions : [],
      error: null,
      debug: null,
    };
  } catch (err) {
    return {
      working: ['Community is active and syncing.'],
      slipping: ['AI brief could not be generated right now.'],
      nextActions: ['Verify OmniRoute configuration if this persists.'],
      error: err.message || 'OmniRoute request failed',
      debug: Deno.env.get('NODE_ENV') || 'production' !== 'production' ? err.message : null,
    };
  }
}

export async function aggregateDashboardData(options = {}) {
  const { includeNotionIntake = true, includeNotionRaw = true, includeAIBrief = true, includeFacebook = true } = options;

  let notionRaw = null;
  let notionError = null;
  let intakeResult = null;
  let facebookResult = null;
  let brevoResult = null;
  let sheetsResult = null;
  let aiBrief = null;

  const notionPromise = includeNotionRaw
    ? fetchNotionData().then((r) => { notionRaw = r.data; notionError = r.error; return r; })
    : Promise.resolve({});

  const intakePromise = includeNotionIntake
    ? fetchNotionIntake().then((r) => { intakeResult = r; })
    : Promise.resolve({});

  await Promise.all([notionPromise, intakePromise]);

  if (includeAIBrief) {
    const context = {
      communityCount: 0,
      communityGrowth: '0%',
      emailSubscribers: brevoResult?.totalSubscribers || 0,
      emailOpenRate: brevoResult?.emailOpenRate || '0%',
      emailClickRate: brevoResult?.emailClickRate || '0%',
      topAsset: 'N/A',
      revenue: '$0',
      notionIdeas: Array.isArray(intakeResult?.ideas) ? intakeResult.ideas.slice(0, 8) : [],
    };

    aiBrief = await buildAIBrief(context);
  }

  if (includeFacebook) {
    facebookResult = await fetchFacebookGroup();
  }

  brevoResult = await fetchBrevoStats();
  sheetsResult = await fetchSheetsData();

  let topAsset = 'N/A';
  let topAssetValue = 0;

  if (notionRaw?.ideas?.results?.length) {
    topAsset = `Notion Ideas (${notionRaw.ideas.results.length})`;
    topAssetValue = notionRaw.ideas.results.length * 1000;
  }

  const alerts = [];
  if (facebookResult?.error) {
    alerts.push({ type: 'critical', source: 'Facebook API', message: facebookResult.error });
  }
  if (notionError) {
    alerts.push({ type: 'warning', source: 'Notion', message: notionError });
  }
  if (brevoResult?.error) {
    alerts.push({ type: 'warning', source: 'Brevo', message: brevoResult.error });
  }
  if (sheetsResult?.error) {
    alerts.push({ type: 'info', source: 'Google Sheets', message: sheetsResult.error });
  }
  if (brevoResult?.error && brevoResult.error.includes('not set')) {
    alerts.push({ type: 'info', source: 'AI Brief', message: 'AI Command Brief is using fallback text.' });
  }
  if (aiBrief?.error) {
    alerts.push({ type: 'info', source: 'AI Brief', message: aiBrief.error });
  }

  if (alerts.length === 0) {
    alerts.push({ type: 'info', source: 'System', message: 'All systems syncing normally. No active alerts.' });
  }

  let revenue = '$0';
  let leads = 0;
  let conversion = 0;

  if (sheetsResult?.data && typeof sheetsResult.data === 'object') {
    revenue = safeString(sheetsResult.data.revenue, '$0');
    leads = safeNumber(sheetsResult.data.leads, 0);
    conversion = safeNumber(sheetsResult.data.conversion, 0);
  }

  if (brevoResult) {
    leads = Math.max(leads, brevoResult.totalSubscribers || 0);
  }

  const intakeAlerts = intakeResult?.alerts || [];
  intakeAlerts.forEach((alert) => {
    alerts.push({ type: 'warning', source: alert.source || 'Intake', message: alert.message });
  });

  const sourceHealth = {
    facebook: facebookResult?.error ? 'error' : 'connected',
    brevo: brevoResult?.error ? 'error' : 'connected',
    google_sheets: sheetsResult?.error ? 'error' : 'connected',
    notion: notionError ? 'error' : 'connected',
    ai_brief: aiBrief?.error ? 'fallback' : 'connected',
  };

  return {
    ok: true,
    timestamp: Date.now(),
    stats: {
      revenue: typeof revenue === 'string' && revenue.trim() ? revenue : '$0',
      leads: typeof leads === 'number' ? leads : 0,
      conversionRate: typeof conversion === 'number' ? conversion : 0,
      assetValue: '$48,000',
      topAsset,
      communityGrowth: '0%',
      emailGrowth: '0%',
      churnRisk: 'Low',
    },
    sourceHealth,
    alerts,
    reviews: [],
    campaigns: brevoResult?.topCampaigns || [],
    competitors: [],
    email: {
      subscribers: brevoResult?.totalSubscribers || 0,
      openRate: brevoResult?.emailOpenRate || '0.0%',
      clickRate: brevoResult?.emailClickRate || '0.0%',
      revenuePerCampaign: brevoResult?.emailRevenuePerCampaign || '$0',
    },
    automations: [],
    community: [],
    aiBrief: {
      working: aiBrief?.working || [],
      slipping: aiBrief?.slipping || [],
      nextActions: aiBrief?.nextActions || [],
    },
    notion: {
      ideas: extractNotionSummary(notionRaw?.ideas),
      content: extractNotionSummary(notionRaw?.content),
      automations: extractNotionSummary(notionRaw?.automations),
      intake: intakeResult?.ideas?.slice(0, 20) || [],
      intakeAlerts: intakeResult?.alerts || [],
      publishingQueue: intakeResult?.publishingQueue || [],
      approvals: intakeResult?.approvals || [],
      buyerSignals: intakeResult?.buyerSignals || [],
      aiDrafts: intakeResult?.aiDrafts || [],
    },
  };
}

function extractNotionSummary(dbResult) {
  if (!dbResult?.results || !Array.isArray(dbResult.results)) return [];

  return dbResult.results.slice(0, 20).map((page) => {
    const props = page.properties || {};
    const title = props.Title?.title?.[0]?.plain_text || props.Name?.title?.[0]?.plain_text || 'Untitled';
    const status = props.Status?.select?.name || props.Stage?.select?.name || 'New';
    return {
      id: page.id,
      title,
      status,
      url: page.url || '',
      lastEdited: page.last_edited_time || '',
    };
  });
}

export { fetchNotionData, fetchNotionIntake, fetchBrevoStats, fetchSheetsData, buildAIBrief };
