export default function handler(req, res) {
  return res.status(200).json({
    status: "ok",
    message: "DigitallyDefined OS backend is running"
  });
}
