const https = require("https");

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method Not Allowed" });

  const { messages } = req.body;
  const apiKey = process.env.ANTHROPIC_API_KEY;

  if (!apiKey) return res.status(500).json({ error: "API key not configured" });

  const payload = JSON.stringify({
    model: "claude-sonnet-4-20250514",
    max_tokens: 1000,
    messages,
  });

  const options = {
    hostname: "api.anthropic.com",
    path: "/v1/messages",
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "Content-Length": Buffer.byteLength(payload),
    },
  };

  return new Promise((resolve) => {
    const apiReq = https.request(options, (apiRes) => {
      let data = "";
      apiRes.on("data", (chunk) => (data += chunk));
      apiRes.on("end", () => {
        try {
          res.status(200).json(JSON.parse(data));
        } catch {
          res.status(500).json({ error: "Parse error", raw: data });
        }
        resolve();
      });
    });
    apiReq.on("error", (e) => {
      res.status(500).json({ error: e.message });
      resolve();
    });
    apiReq.write(payload);
    apiReq.end();
  });
};
