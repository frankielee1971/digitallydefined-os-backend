import run from "./run";

export default async function handler(req, res) {
  try {
    const { automationId, payload } = req.body;

    const result = await run.executeAutomation(automationId, payload);

    return res.status(200).json({
      success: true,
      result
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      error: err.message
    });
  }
}
