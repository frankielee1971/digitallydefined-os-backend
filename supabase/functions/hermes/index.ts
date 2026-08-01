// supabase/functions/hermes/index.ts
// DigitallyDefined OS - Unified AI Gateway with Puter.js Execution Layer

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

// CORS Headers inline
function corsHeaders(origin: string) {
  return {
    'Access-Control-Allow-Origin': origin || '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, x-api-key',
  };
}

// === Registered Agents ===
const AGENTS = {
  task_planner: {
    type: 'task_planner',
    name: 'Task Planner',
    description: 'Creates and manages task lists',
    run: (inputData) => {
      const tasks = inputData.tasks || [];
      const plan = {
        id: `plan-${Date.now()}`,
        created: new Date().toISOString(),
        tasks: tasks.map((t, i) => ({
          id: i + 1,
          title: t.title,
          priority: t.priority || 'medium',
          status: 'pending',
          dueDate: t.dueDate || null,
          tags: t.tags || []
        })),
        summary: `Created ${tasks.length} tasks`
      };
      return plan;
    }
  },
  content_writer: {
    type: 'content_writer',
    name: 'Content Writer',
    description: 'Generates content for various formats',
    run: (inputData) => {
      const content = {
        id: `content-${Date.now()}`,
        topic: inputData.topic,
        format: inputData.format || 'markdown',
        tone: inputData.tone || 'professional',
        generated: new Date().toISOString(),
        body: `Generated content for: ${inputData.topic}`,
        tags: inputData.tags || []
      };
      return content;
    }
  },
  workflow_builder: {
    type: 'workflow_builder',
    name: 'Workflow Builder',
    description: 'Creates automation workflows',
    run: (inputData) => {
      const workflow = {
        id: `workflow-${Date.now()}`,
        name: inputData.name || 'New Workflow',
        steps: inputData.steps || [],
        created: new Date().toISOString(),
        active: true
      };
      return workflow;
    }
  },
  digital_organizer: {
    type: 'digital_organizer',
    name: 'Digital Organizer',
    description: 'Organizes digital workspace',
    run: (inputData) => {
      const organization = {
        id: `org-${Date.now()}`,
        created: new Date().toISOString(),
        files: inputData.fileCount || 0,
        categories: {
          plans: [],
          content: [],
          workflows: [],
          other: []
        },
        recommendations: ['Review file structure', 'Archive old content', 'Organize by project']
      };
      return organization;
    }
  }
};

// === Puter.js Workspace (In-memory for Edge Function) ===
class PuterWorkspace {
  constructor(userId) {
    this.userId = userId;
    this.workspaceId = `digitallydefined-${userId}`;
    this.root = `/users/${userId}/digitallydefined`;
    this.storage = new Map();
  }

  async init() {
    return { success: true, workspace: this.root };
  }

  async writeFile(path, content) {
    const fullPath = `${this.root}/${path}`;
    this.storage.set(fullPath, content);
    return { success: true, path: fullPath };
  }

  async readFile(path) {
    const fullPath = `${this.root}/${path}`;
    return this.storage.get(fullPath) || null;
  }

  async listDir(path = '') {
    const prefix = `${this.root}/${path}`;
    return Array.from(this.storage.keys())
      .filter(k => k.startsWith(prefix))
      .map(k => k.replace(prefix, ''));
  }

  async setItem(key, value) {
    this.storage.set(`${this.userId}/${key}`, value);
  }

  async getItem(key) {
    return this.storage.get(`${this.userId}/${key}`) || null;
  }

  async runAgent(agentId, inputData) {
    const agent = AGENTS[agentId];
    if (!agent) throw new Error(`Agent ${agentId} not found. Available: ${Object.keys(AGENTS).join(', ')}`);
    
    const result = agent.run(inputData || {});
    
    // Save to history
    await this.setItem(`agent_history/${agentId}`, {
      lastRun: new Date().toISOString(),
      input: inputData,
      output: result
    });
    
    return result;
  }

  async runWorkflow(workflowId, inputData) {
    const workflow = await this.getItem(`workflows/${workflowId}`);
    if (!workflow) throw new Error('Workflow not found');

    const results = [];
    for (const step of workflow.steps) {
      try {
        const stepResult = await this.executeStep(step, inputData);
        results.push({ step: step.name, success: true, result: stepResult });
        inputData = { ...inputData, [step.name]: stepResult };
      } catch (e) {
        results.push({ step: step.name, success: false, error: e.message });
        break;
      }
    }
    return { success: true, results, workflow };
  }

  async executeStep(step, inputData) {
    switch (step.type) {
      case 'write_file':
        return await this.writeFile(step.path, step.content || inputData.content);
      case 'read_file':
        return await this.readFile(step.path);
      case 'run_agent':
        return await this.runAgent(step.agentId, inputData);
      case 'generate':
        return { generated: step.prompt, timestamp: new Date().toISOString() };
      default:
        throw new Error(`Unknown step type: ${step.type}`);
    }
  }
}

serve(async (req) => {
  // === CORS ===
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders('') });
  }

  // === API Keys ===
  const DASHBOARD_API_KEY = "DigitallyDefined-OS-2026";
  const AGNES_KEY = "sk-R4z...1RDw";
  const OPENROUTER_KEY = "sk-or-...25b6";
  const GROQ_KEY = "gsk_S8...XZOz";

  // === Auth ===
  const apiKey = (req.headers.get('x-api-key') || '').trim();
  if (apiKey !== DASHBOARD_API_KEY) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json', ...corsHeaders('') }
    });
  }

  // === Parse Body ===
  let body = {};
  try {
    const text = await req.text();
    body = text ? JSON.parse(text) : {};
  } catch (e) {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json', ...corsHeaders('') }
    });
  }

  const action = body.action || '';
  const origin = req.headers.get('origin') || '';
  const userId = body.userId || 'anonymous';

  // Initialize Puter.js workspace
  const workspace = new PuterWorkspace(userId);
  await workspace.init();

  // === Dashboard Action ===
  if (action === 'dashboard') {
    const data = {
      revenue: "$12,450",
      leads: 156,
      conversionRate: 0.248,
      assetValue: 48000,
      topAsset: "Email List",
      communityGrowth: "+12%",
      emailGrowth: "+8%",
      churnRisk: "Low",
      reviews: [{
        name: "Sarah M.",
        reviewText: "This dashboard changed my business! The automation features are incredible.",
        sentiment: "positive",
        date: "2024-01-15",
        aiDraftedResponse: "Thank you Sarah! So glad the automation features are helping you scale.",
      }],
      campaigns: [
        { name: "Authority Launch Sequence", openRate: "42%", clickRate: "18%" },
        { name: "Evergreen Reputation Funnel", openRate: "38%", clickRate: "15%" },
      ],
      competitors: [
        { name: "Competitor A", notes: "Similar target audience, different pricing" },
        { name: "Competitor B", notes: "Stronger social presence, we lead in SEO" },
      ],
      email: { subscribers: 1284, openRate: "42%", clickRate: "18%", revenuePerCampaign: "$1,240" },
      alerts: [{ type: "info", source: "System", message: "All automations running normally" }],
      sourceHealth: {
        googleMyBusiness: "Active",
        facebook: "Active",
        instagram: "Active",
        email: "Active",
      },
      automations: [
        { name: "Review Response Auto-Reply", status: "active", lastRun: "2 hours ago" },
        { name: "Social Media Cross-Post", status: "active", lastRun: "5 hours ago" },
        { name: "Email Lead Nurturing", status: "paused", lastRun: "1 day ago" },
      ],
      aiBrief: {
        working: ["Email open rates above industry average", "Social engagement increasing"],
        slipping: ["Review response time could be faster", "Content calendar needs updating"],
        nextActions: ["Respond to pending reviews", "Schedule next week's social content", "Review email campaign performance"],
      },
      community: [
        { name: "Rena Walker", date: "Mar 28, 2026", status: "Active" },
        { name: "Angela Brooks", date: "Mar 31, 2026", status: "Onboarding" },
      ],
      puter: {
        workspace: workspace.root,
        files: await workspace.listDir(),
        agents: Object.keys(AGENTS)
      }
    };
    return new Response(JSON.stringify(data), {
      status: 200,
      headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) }
    });
  }

  // === Automation List Action ===
  if (action === 'automation.list') {
    return new Response(JSON.stringify({
      automations: [
        { name: "Review Response Auto-Reply", status: "active", lastRun: "2 hours ago" },
        { name: "Social Media Cross-Post", status: "active", lastRun: "5 hours ago" },
        { name: "Email Lead Nurturing", status: "paused", lastRun: "1 day ago" },
      ],
      puterWorkflows: await workspace.listDir('workflows')
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) }
    });
  }

  // === Status/Routes Action ===
  if (action === 'status' || action === 'routes') {
    return new Response(JSON.stringify({
      ok: true,
      status: "running",
      timestamp: Date.now(),
      routes: [
        { action: "hermes", method: "POST", description: "AI chat gateway" },
        { action: "dashboard", method: "POST", description: "Dashboard data" },
        { action: "automation.list", method: "POST", description: "Automation list" },
        { action: "puter.run_agent", method: "POST", description: "Run Puter.js agent" },
        { action: "puter.run_workflow", method: "POST", description: "Run Puter.js workflow" },
        { action: "puter.list_files", method: "POST", description: "List workspace files" },
      ],
      puter: {
        workspace: workspace.root,
        agents: Object.keys(AGENTS),
        workflows: await workspace.listDir('workflows')
      }
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) }
    });
  }

  // === Puter.js: Run Agent ===
  if (action === 'puter.run_agent') {
    const { agentId, inputData } = body;
    try {
      const result = await workspace.runAgent(agentId, inputData || {});
      return new Response(JSON.stringify({
        success: true,
        agent: agentId,
        result,
        workspace: workspace.root
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) }
      });
    } catch (e) {
      return new Response(JSON.stringify({ error: e.message }), {
        status: 400,
        headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) }
      });
    }
  }

  // === Puter.js: Run Workflow ===
  if (action === 'puter.run_workflow') {
    const { workflowId, inputData } = body;
    try {
      const result = await workspace.runWorkflow(workflowId, inputData || {});
      return new Response(JSON.stringify({
        success: true,
        workflow: workflowId,
        result
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) }
      });
    } catch (e) {
      return new Response(JSON.stringify({ error: e.message }), {
        status: 400,
        headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) }
      });
    }
  }

  // === Puter.js: List Files ===
  if (action === 'puter.list_files') {
    const { path } = body;
    const files = await workspace.listDir(path || '');
    return new Response(JSON.stringify({
      success: true,
      workspace: workspace.root,
      path: path || '/',
      files
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) }
    });
  }

  // === AI Chat (Default) ===
  const message = body.message || body.content || body.text || '';
  const conversation = body.conversation || body.messages || [];
  const context = body.context || {};

  if (!message) {
    return new Response(JSON.stringify({ error: 'Missing message' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) }
    });
  }

  const systemPrompt = body.systemPrompt || `You are Hermes, the orchestrator of DigitallyDefined OS.
You coordinate cognitive agents (Antigravity, Buzz, Groq, Agnes) and execute actions through Puter.js.
Help the user manage their digital business, automations, and growth strategies.`;

  // Try AI providers
  const candidates = [
    { model: "sapiens-ai/agnes-2.0-flash", key: AGNES_KEY, base: "https://api.agnes.sapiens.ai/v1/chat/completions", provider: "agnes" },
    { model: "meta-llama/llama-3.3-70b-versatile", key: GROQ_KEY, base: "https://api.groq.com/openai/v1/chat/completions", provider: "groq" },
    { model: "openai/gpt-4o-mini", key: OPENROUTER_KEY, base: "https://openrouter.ai/api/v1/chat/completions", provider: "openrouter" },
  ].filter(c => c.key);

  let reply = "";
  let provider = "";
  let model = null;
  let error = "";

  for (const c of candidates) {
    try {
      const res = await fetch(c.base, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${c.key}`,
          'Content-Type': 'application/json',
          ...(c.provider === 'openrouter' ? { 'HTTP-Referer': 'https://digitallydefined.online', 'X-Title': 'DigitallyDefined OS' } : {}),
        },
        body: JSON.stringify({
          model: c.model,
          messages: [
            { role: 'system', content: systemPrompt },
            ...conversation,
            { role: 'user', content: message },
          ],
          max_tokens: 4000,
          temperature: 0.7,
        }),
        signal: AbortSignal.timeout(90000),
      });

      if (res.ok) {
        const data = await res.json();
        reply = data?.choices?.[0]?.message?.content || "";
        if (reply) {
          provider = c.provider;
          model = c.model;
          break;
        }
      } else {
        error = `${c.provider}: HTTP ${res.status}`;
      }
    } catch (e) {
      error = e.message || "Request failed";
    }
  }

  if (!reply) {
    reply = error ? `AI request failed: ${error}` : "No AI provider configured";
    provider = "error";
  }

  return new Response(JSON.stringify({
    reply,
    provider,
    model,
    success: !!reply,
    error: error || null,
    conversationUpdates: [],
    dashboardSnapshotUpdate: context || null,
    timestamp: Date.now(),
    puter: {
      workspace: workspace.root,
      files: await workspace.listDir(),
      agents: Object.keys(AGENTS)
    }
  }), {
    status: 200,
    headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) }
  });
});
