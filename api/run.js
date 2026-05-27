// /pages/api/run.js

import { routeTask } from "@/lib/antigravity/router";
import { TASK_TYPES } from "@/lib/antigravity/taskTypes";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { taskType, input } = req.body;

    if (!taskType) {
      return res.status(400).json({ error: "Missing taskType" });
    }

    // Validate taskType
    const validTypes = Object.values(TASK_TYPES);
    if (!validTypes.includes(taskType)) {
      return res.status(400).json({
        error: `Invalid taskType: ${taskType}`,
        validTypes
      });
    }

    // Route to correct agent
    const agentId = routeTask({ type: taskType });

    // Build payload for Antigravity
    const payload = {
      agentId,
      input,
      metadata: {
        taskType,
        timestamp: new Date().toISOString(),
        source: "digitallydefined-backend"
      }
    };

    // Forward to Antigravity MCP endpoint
    const response = await fetch(process.env.ANTIGRAVITY_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });

    const data = await response.json();

    // Return Antigravity response to dashboard
    return res.status(200).json({
      success: true,
      agentId,
      taskType,
      result: data
    });

  } catch (error) {
    console.error("Antigravity run error:", error);

    return res.status(500).json({
      success: false,
      error: error.message || "Unknown error"
    });
  }
}
