const https = require("https");

module.exports = function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: { message: "Method not allowed" } });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: { message: "ANTHROPIC_API_KEY not set" } });
  }

  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
    const { system, messages } = body;

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ error: { message: "messages required" } });
    }

    const payload = JSON.stringify({
      model: "claude-sonnet-4-20250514",
      max_tokens: 1024,
      system: system || "",
      messages: messages,
    });

    const options = {
      hostname: "api.anthropic.com",
      port: 443,
      path: "/v1/messages",
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "Content-Length": Buffer.byteLength(payload),
      },
    };

    const apiReq = https.request(options, function (apiRes) {
      let data = "";
      apiRes.on("data", function (chunk) {
        data += chunk;
      });
      apiRes.on("end", function () {
        try {
          const parsed = JSON.parse(data);
          res.status(apiRes.statusCode).json(parsed);
        } catch (e) {
          res.status(500).json({ error: { message: "Parse error" } });
        }
      });
    });

    apiReq.on("error", function (err) {
      res.status(500).json({ error: { message: "Request failed: " + err.message } });
    });

    apiReq.write(payload);
    apiReq.end();
  } catch (err) {
    res.status(500).json({ error: { message: "Server error: " + err.message } });
  }
};
