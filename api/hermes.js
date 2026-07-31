/**
 * Hermes Backend Handler
 * Routes requests to appropriate Buzz Agents
 */

import { getAgent, listAgents } from '../agents/buzz-registry.js';

export default async function handler(req, res) {
  // === CORS Configuration ===
  const allowedOrigins = [
    'https://dashboard.digitallydefined.online',
    'https://digitallydefined.online',
    'http://localhost:3000',
    'http://localhost:5173',
  ];

  const origin = req.headers.origin;
  const allowedOrigin =
    origin && allowedOrigins.includes(origin)
      ? origin
      : process.env.ALLOWED_ORIGIN || 'https://dashboard.digitallydefined.online';

  res.setHeader('Access-Control-Allow-Origin', allowedOrigin);
  res.setHeader('Access-Control-Allow-Methods', 'OPTIONS, POST, GET');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-api-key');
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Max-Age', '86400');
  res.setHeader('Vary', 'Origin');

  // === Preflight ===
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // === Health Check ===
  if (req.method === 'GET') {
    return res.status(200).json({
      ok: true,
      status: 'Hermes backend is running',
      timestamp: Date.now(),
      agents: listAgents(),
    });
  }

  // === Method Validation ===
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed - use POST', reply: '' });
  }

  // === API Key Validation ===
  const providedKey = String(
    req.headers['x-api-key'] || req.headers['authorization'] || ''
  ).trim();
  const expectedKey = String(
    process.env.DASHBOARD_API_KEY || process.env.VITE_DASHBOARD_API_KEY || ''
  ).trim();

  if (!expectedKey || providedKey !== expectedKey) {
    return res.status(401).json({ error: 'Unauthorized - Invalid or missing API key', reply: '' });
  }

  try {
    // === Body Parsing ===
    let body = {};

    const contentType = String(req.headers['content-type'] || '').toLowerCase();

    if (typeof req.body === 'string') {
      try {
        body = JSON.parse(req.body);
      } catch (parseError) {
        return res.status(400).json({
          error: 'Invalid JSON body: ' + (parseError instanceof Error ? parseError.message : String(parseError)),
          reply: '',
        });
      }
    } else if (req.body && typeof req.body === 'object') {
      body = req.body;
    } else if (
      !req.body &&
      (contentType.includes('application/json') || contentType.includes('text/json'))
    ) {
      return res.status(400).json({
        error: 'Missing request body',
        reply: '',
      });
    }

    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return res.status(400).json({
        error: 'Request body must be a JSON object',
        reply: '',
      });
    }

    // === Dashboard Action - Return mock data for now ===
    if (body.action === 'dashboard') {
      return res.status(200).json({
        revenue: '$12,450',
        leads: 156,
        conversionRate: 0.248,
        assetValue: 48000,
        topAsset: 'Email List',
        communityGrowth: '+12%',
        emailGrowth: '+8%',
        churnRisk: 'Low',
        reviews: [
          {
            name: 'Sarah M.',
            reviewText: 'This dashboard changed my business! The automation features are incredible.',
            sentiment: 'positive',
            date: '2024-01-15',
            aiDraftedResponse: 'Thank you Sarah! So glad the automation features are helping you scale.',
          },
        ],
        campaigns: [
          { name: 'Authority Launch Sequence', openRate: '42%', clickRate: '18%' },
          { name: 'Evergreen Reputation Funnel', openRate: '38%', clickRate: '15%' },
        ],
        competitors: [
          { name: 'Competitor A', notes: 'Similar target audience, different pricing' },
          { name: 'Competitor B', notes: 'Stronger social presence, we lead in SEO' },
        ],
        email: { subscribers: 1284, openRate: '42%', clickRate: '18%', revenuePerCampaign: '$1,240' },
        alerts: [
          { type: 'info', source: 'System', message: 'All automations running normally' },
        ],
        sourceHealth: {
          googleMyBusiness: 'Active',
          facebook: 'Active',
          instagram: 'Active',
          email: 'Active',
        },
        automations: [
          { name: 'Review Response Auto-Reply', status: 'active', lastRun: '2 hours ago' },
          { name: 'Social Media Cross-Post', status: 'active', lastRun: '5 hours ago' },
          { name: 'Email Lead Nurturing', status: 'paused', lastRun: '1 day ago' },
        ],
        aiBrief: {
          working: ['Email open rates above industry average', 'Social engagement increasing'],
          slipping: ['Review response time could be faster', 'Content calendar needs updating'],
          nextActions: [
            'Respond to pending reviews',
            "Schedule next week's social content",
            'Review email campaign performance',
          ],
        },
        community: [
          { name: 'Rena Walker', date: 'Mar 28, 2026', status: 'Active' },
          { name: 'Angela Brooks', date: 'Mar 31, 2026', status: 'Onboarding' },
        ],
      });
    }

    // === Automation List Action ===
    if (body.action === 'automation.list') {
      return res.status(200).json({
        automations: [
          {
            name: 'Review Response Auto-Reply',
            status: 'active',
            lastRun: '2 hours ago',
            details: 'Auto-replies to new Google reviews',
          },
          {
            name: 'Social Media Cross-Post',
            status: 'active',
            lastRun: '5 hours ago',
            details: 'Posts to all connected social accounts',
          },
          {
            name: 'Email Lead Nurturing',
            status: 'paused',
            lastRun: '1 day ago',
            details: 'Nurtures new leads with automated sequences',
          },
        ],
      });
    }

    // === Buzz Agent Execution ===
    const agentKey = body.agentKey;
    if (agentKey && agentKey !== 'hermes') {
      const agent = getAgent(agentKey);
      if (!agent) {
        return res.status(404).json({
          error: `Unknown agent: ${agentKey}`,
          availableAgents: listAgents(),
          reply: '',
        });
      }

      try {
        const result = await agent(body.inputData || body.data || body);
        return res.status(200).json({
          agent: agentKey,
          result,
          reply: JSON.stringify(result),
        });
      } catch (error) {
        return res.status(500).json({
          error: `Agent execution failed: ${error.message}`,
          agent: agentKey,
          reply: '',
        });
      }
    }

    // === Default: AI Chat (Hermes) ===
    const context = body.context || {};
    const conversation = Array.isArray(body.conversation)
      ? body.conversation
      : Array.isArray(body.messages)
      ? body.messages
      : [];

    let message = '';

    if (typeof body.message === 'string' && body.message.trim()) {
      message = body.message.trim();
    } else if (typeof body.content === 'string' && body.content.trim()) {
      message = body.content.trim();
    } else if (typeof body.text === 'string' && body.text.trim()) {
      message = body.text.trim();
    } else if (Array.isArray(body.messages) && body.messages.length) {
      const userMsg =
        body.messages.find((m) => m.role === 'user' || m.role === undefined && m.content) ||
        body.messages[0];
      message = (userMsg?.content || userMsg?.text || '').trim();
    } else if (Array.isArray(conversation) && conversation.length) {
      const userConv =
        conversation.find(
          (c) => (c.role === 'user' || c.role === undefined) && (c.content || c.text)
        ) || conversation[0];
      message = (userConv?.content || userConv?.text || '').trim();
    }

    if (!message || typeof message !== 'string') {
      return res.status(400).json({ error: 'Missing or invalid message field', reply: '' });
    }

    // Return a placeholder response for now
    return res.status(200).json({
      reply: `Hermes received: "${message}". Buzz agents are configured.`,
      agent: 'hermes',
      context,
    });
  } catch (error) {
    console.error('[Hermes] Handler error:', error);
    return res.status(500).json({
      error: 'Internal server error',
      reply: '',
      details: process.env.NODE_ENV !== 'production' ? error.message : undefined,
    });
  }
}
