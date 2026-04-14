const https = require("https");

const SUPABASE_URL_HOST = "bbbiehitrwsveijxhagd.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJiYmllaGl0cndzdmVpanhoYWdkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzYxODM3MDksImV4cCI6MjA5MTc1OTcwOX0.1oX9sGYb_L_f88zFpZQ_c95TRL9Z3Ip5Qyw9mPTiudI";

function httpsPost(hostname, path, headers, payload) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname,
      path,
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(payload),
        ...headers,
      },
    };
    const req = https.request(options, (apiRes) => {
      let data = "";
      apiRes.on("data", (chunk) => (data += chunk));
      apiRes.on("end", () => {
        try { resolve({ status: apiRes.statusCode, body: JSON.parse(data) }); }
        catch { resolve({ status: apiRes.statusCode, body: data }); }
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

function removeMarkdown(text) {
  return text
    .replace(/#{1,6}\s+/g, "")
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/\*(.+?)\*/g, "$1")
    .replace(/_{1,2}(.+?)_{1,2}/g, "$1")
    .replace(/`(.+?)`/g, "$1")
    .replace(/^---+$/gm, "")
    .trim();
}

async function saveToSupabase({ nome, email, empresa, score, classificacao }) {
  try {
    const payload = JSON.stringify({
      nome,
      email,
      empresa,
      score,
      classificacao,
      criado_em: new Date().toISOString(),
    });
    await httpsPost(
      SUPABASE_URL_HOST,
      "/rest/v1/leads_icf",
      {
        "apikey": SUPABASE_KEY,
        "Authorization": `Bearer ${SUPABASE_KEY}`,
        "Prefer": "return=minimal",
      },
      payload
    );
  } catch (err) {
    console.error("Supabase error:", err.message);
  }
}

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method Not Allowed" });

  const { messages, lead } = req.body;
  const apiKey = process.env.ANTHROPIC_API_KEY;

  if (!apiKey) return res.status(500).json({ error: "API key not configured" });

  const payload = JSON.stringify({
    model: "claude-sonnet-4-20250514",
    max_tokens: 1500,
    messages,
  });

  const MAX_RETRIES = 3;
  let lastData = null;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const result = await httpsPost(
        "api.anthropic.com",
        "/v1/messages",
        {
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
        },
        payload
      );

      lastData = result.body;

      if (lastData.error && lastData.error.type === "overloaded_error" && attempt < MAX_RETRIES) {
        await sleep(2000 * attempt);
        continue;
      }

      // Remove markdown
      if (lastData.content && Array.isArray(lastData.content)) {
        lastData.content = lastData.content.map(block => ({
          ...block,
          text: block.text ? removeMarkdown(block.text) : block.text,
        }));
      }

      // Salva no Supabase
      if (lead && lead.email) {
        await saveToSupabase({
          nome: lead.nome || "",
          email: lead.email,
          empresa: lead.empresa || "",
          score: lead.score || 0,
          classificacao: lead.classificacao || "",
        });
      }

      return res.status(200).json(lastData);
    } catch (err) {
      if (attempt === MAX_RETRIES) {
        return res.status(500).json({ error: err.message });
      }
      await sleep(2000 * attempt);
    }
  }

  return res.status(500).json({ error: "Max retries reached" });
};
