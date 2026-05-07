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

  var apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: { message: "GEMINI_API_KEY not set in Vercel environment variables" } });
  }

  try {
    var body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
    var system = body.system || "";
    var messages = body.messages || [];

    if (!messages.length) {
      return res.status(400).json({ error: { message: "messages required" } });
    }

    var contents = [];
    for (var i = 0; i < messages.length; i++) {
      contents.push({
        role: messages[i].role === "assistant" ? "model" : "user",
        parts: [{ text: messages[i].content }]
      });
    }

    var payload = JSON.stringify({
      system_instruction: { parts: [{ text: system }] },
      contents: contents,
      generationConfig: {
        maxOutputTokens: 4096,
        temperature: 0.7
      }
    });

var path = "/v1beta/models/gemini-1.5-flash:generateContent?key=" + apiKey;
    
    var options = {
      hostname: "generativelanguage.googleapis.com",
      port: 443,
      path: path,
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(payload)
      }
    };

    var apiReq = https.request(options, function (apiRes) {
      var data = "";
      apiRes.on("data", function (chunk) { data += chunk; });
      apiRes.on("end", function () {
        try {
          var parsed = JSON.parse(data);

          if (parsed.error) {
            return res.status(parsed.error.code || 500).json({
              error: { message: parsed.error.message || "Gemini API error" }
            });
          }

          var text = "";
          if (parsed.candidates && parsed.candidates[0] && parsed.candidates[0].content) {
            var parts = parsed.candidates[0].content.parts;
            for (var j = 0; j < parts.length; j++) {
              if (parts[j].text) text += parts[j].text;
            }
          }

          res.status(200).json({
            content: [{ type: "text", text: text || "No response generated" }]
          });
        } catch (e) {
          res.status(500).json({ error: { message: "Parse error: " + data.substring(0, 300) } });
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
