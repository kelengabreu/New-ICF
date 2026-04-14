const https = require("https");

function callAnthropic(payload, apiKey) {
  return new Promise((resolve, reject) => {
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

    const req = https.request(options, (apiRes) => {
      let data = "";
      apiRes.on("data", (chunk) => (data += chunk));
      apiRes.on("end", () => {
        try {
          resolve(JSON.parse(data));
        } catch {
          reject(new Error("Parse error: " + data));
        }
      });
    });

    req.on("error", reject);
    req.write(payload);
    req.end();
  });
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

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
    max_tokens: 1500,
    messages,
  });

  const MAX_RETRIES = 3;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const data = await callAnthropic(payload, apiKey);

      // Se overloaded, tenta de novo
      if (data.error && data.error.type === "overloaded_error" && attempt < MAX_RETRIES) {
        await sleep(2000 * attempt); // 2s, 4s
        continue;
      }

      return res.status(200).json(data);
    } catch (err) {
      if (attempt === MAX_RETRIES) {
        return res.status(500).json({ error: err.message });
      }
      await sleep(2000 * attempt);
    }
  }
};
