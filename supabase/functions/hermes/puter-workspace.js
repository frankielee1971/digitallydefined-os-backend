// Puter.js Integration for DigitallyDefined OS
// Execution layer: filesystem, storage, workflows, agents

const PUTER_JS_URL = "https://js.puter.com/v2/";

// === Puter.js Workspace Manager ===
class PuterWorkspace {
  constructor(userId) {
    this.userId = userId;
    this.workspaceId = `digitallydefined-${userId}`;
    this.root = `/users/${userId}/digitallydefined`;
  }

  // Initialize workspace
  async init() {
    try {
      // Check if workspace exists
      const stats = await puter.fs.stat(this.root);
      if (!stats || stats.type !== 'dir') {
        await puter.fs.mkdir(this.root);
      }
      return { success: true, workspace: this.root };
    } catch (e) {
      // Create workspace if it doesn't exist
      await puter.fs.mkdir(this.root, { recursive: true });
      return { success: true, workspace: this.root, created: true };
    }
  }

  // File operations
  async writeFile(path, content, options = {}) {
    const fullPath = `${this.root}/${path}`;
    return await puter.fs.write(fullPath, content, options);
  }

  async readFile(path) {
    const fullPath = `${this.root}/${path}`;
    try {
      return await puter.fs.read(fullPath);
    } catch (e) {
      return null;
    }
  }

  async listDir(path = '') {
    const fullPath = `${this.root}/${path}`;
    try {
      return await puter.fs.readdir(fullPath);
    } catch (e) {
      return [];
    }
  }

  async deleteFile(path) {
    const fullPath = `${this.root}/${path}`;
    return await puter.fs.delete(fullPath);
  }

  // Storage operations (key-value)
  async setItem(key, value) {
    return await puter.kv.set(`${this.userId}/${key}`, JSON.stringify(value));
  }

  async getItem(key) {
    const raw = await puter.kv.get(`${this.userId}/${key}`);
    try {
      return JSON.parse(raw);
    } catch {
      return raw;
    }
  }

  async deleteItem(key) {
    return await puter.kv.delete(`${this.userId}/${key}`);
  }

  // Background tasks
  async scheduleJob(name, cron, callback, data = {}) {
    const jobId = `${this.userId}/${name}`;
    const job = {
      id: jobId,
      name,
      cron,
      callback,
      data,
      lastRun: null,
      nextRun: null,
      createdAt: new Date().toISOString()
    };
    await this.setItem(`jobs/${name}`, job);
    return job;
  }

  async runJob(name) {
    const job = await this.getItem(`jobs/${name}`);
    if (!job) return { error: 'Job not found' };
    
    try {
      const result = await job.callback(job.data);
      await this.setItem(`jobs/${name}`, { ...job, lastRun: new Date().toISOString() });
      return { success: true, result };
    } catch (e) {
      return { error: e.message };
    }
  }

  // Multi-step workflows
  async runWorkflow(workflowId, inputData = {}) {
    const workflow = await this.getItem(`workflows/${workflowId}`);
    if (!workflow) return { error: 'Workflow not found' };

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
      case 'save_data':
        return await this.setItem(step.key, inputData[step.key] || step.value);
      case 'run_agent':
        return await this.runAgent(step.agentId, inputData);
      case 'call_api':
        return await this.callExternalApi(step);
      case 'generate':
        return await this.generateContent(step.prompt, inputData);
      default:
        throw new Error(`Unknown step type: ${step.type}`);
    }
  }

  // Agent execution
  async runAgent(agentId, inputData) {
    const agent = await this.getItem(`agents/${agentId}`);
    if (!agent) throw new Error(`Agent ${agentId} not found`);

    // Execute agent logic
    const result = await this.executeAgent(agent, inputData);
    await this.setItem(`agent_history/${agentId}`, {
      lastRun: new Date().toISOString(),
      input: inputData,
      output: result
    });
    return result;
  }

  async executeAgent(agent, inputData) {
    // Agent execution based on type
    switch (agent.type) {
      case 'task_planner':
        return this.planTasks(agent, inputData);
      case 'content_writer':
        return this.writeContent(agent, inputData);
      case 'workflow_builder':
        return this.buildWorkflow(agent, inputData);
      case 'digital_organizer':
        return this.organizeWorkspace(agent, inputData);
      default:
        throw new Error(`Unknown agent type: ${agent.type}`);
    }
  }

  // Agent implementations
  async planTasks(agent, inputData) {
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
    await this.writeFile(`plans/${plan.id}.json`, JSON.stringify(plan, null, 2));
    return plan;
  }

  async writeContent(agent, inputData) {
    const { topic, format, tone } = inputData;
    const content = {
      id: `content-${Date.now()}`,
      topic,
      format: format || 'markdown',
      tone: tone || 'professional',
      generated: new Date().toISOString(),
      body: `Content for: ${topic} (${format})`,
      tags: inputData.tags || []
    };
    await this.writeFile(`content/${content.id}.md`, JSON.stringify(content, null, 2));
    return content;
  }

  async buildWorkflow(agent, inputData) {
    const workflow = {
      id: `workflow-${Date.now()}`,
      name: inputData.name,
      steps: inputData.steps || [],
      created: new Date().toISOString(),
      active: true
    };
    await this.setItem(`workflows/${workflow.id}`, workflow);
    return workflow;
  }

  async organizeWorkspace(agent, inputData) {
    const structure = await this.listDir();
    const organization = {
      id: `org-${Date.now()}`,
      created: new Date().toISOString(),
      files: structure.length,
      categories: this.categorizeFiles(structure),
      recommendations: []
    };
    await this.writeFile(`organization/${organization.id}.json`, JSON.stringify(organization, null, 2));
    return organization;
  }

  categorizeFiles(files) {
    const categories = {
      plans: [],
      content: [],
      workflows: [],
      agent_history: [],
      jobs: [],
      other: []
    };
    for (const file of files) {
      if (file.includes('plans/')) categories.plans.push(file);
      else if (file.includes('content/')) categories.content.push(file);
      else if (file.includes('workflows/')) categories.workflows.push(file);
      else if (file.includes('agent_history/')) categories.agent_history.push(file);
      else if (file.includes('jobs/')) categories.jobs.push(file);
      else categories.other.push(file);
    }
    return categories;
  }

  async callExternalApi(step, inputData) {
    const response = await fetch(step.url, {
      method: step.method || 'GET',
      headers: step.headers || { 'Content-Type': 'application/json' },
      body: step.body ? JSON.stringify(step.body) : undefined
    });
    return await response.json();
  }

  async generateContent(prompt, inputData) {
    // This would call the AI provider (Agnes, Groq, OpenRouter)
    return { generated: prompt, timestamp: new Date().toISOString() };
  }
}

// === Export for use ===
export { PuterWorkspace };
export default PuterWorkspace;
