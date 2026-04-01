export default async function handler(req, res) {
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
    return res.status(500).json({ error: { message: "ANTHROPIC_API_KEY not set in Vercel environment variables" } });
  }

  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
    const { system, messages } = body;

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ error: { message: "messages array is required" } });
    }

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01"
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 1024,
        system: system || "",
        messages: messages
      })
    });

    const data = await response.json();
    return res.status(response.status).json(data);

  } catch (err) {
    console.error("API Error:", err);
    return res.status(500).json({ error: { message: "Server error: " + err.message } });
  }
}
```
4. Click **"Commit changes"**

**Part C — Create the public folder and upload index.html:**
1. Click **"Add file"** → **"Create new file"**
2. In the filename box, type: **`public/index.html`**
3. Now — this file is huge (150KB), so instead:
   - Click **Cancel**
   - Go back to repo main page
   - Click **"Add file"** → **"Upload files"**
   - But GitHub upload puts files at root, not in a folder...

**Better approach for Part C:**
1. In your repo, click on the **`api`** folder (you just created it)
2. Go back to repo root by clicking repo name
3. Click **"Add file"** → **"Create new file"**
4. Type **`public/placeholder.txt`** and put any text, commit it (this creates the `public/` folder)
5. Now click into the **`public/`** folder
6. Click **"Add file"** → **"Upload files"**
7. Drag and drop the **`index.html`** file (from the extracted zip's `public/` folder)
8. Click **"Commit changes"**
9. Now delete the `placeholder.txt` — click on it → click the **trash icon** → commit

---

**STEP 5: Check your repo looks like this**
```
api/
  └── chat.js
public/
  └── index.html
package.json
vercel.json
README.md
