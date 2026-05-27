import automationEvents from "./automation-events";

export default async function handler(req, res) {
  try {
    const logs = await automationEvents.getLogs();

    return res.status(200).json({
      logs: logs || [],
      count: logs?.length || 0
    });
  } catch (err) {
    return res.status(500).json({
      error: "Failed to load logs",
      details: err.message
    });
  }
}
