# GRC Expert - AI-Powered Compliance Assistant

## Deploy to Vercel

### Step 1: Get an Anthropic API Key
Go to [console.anthropic.com](https://console.anthropic.com) → API Keys → Create Key

### Step 2: Upload to GitHub
Create a NEW repo called `grc-expert` and upload these files **exactly like this**:

```
grc-expert/          ← your repo root
├── api/
│   └── chat.js
├── public/
│   └── index.html
├── package.json
├── vercel.json
└── README.md
```

**IMPORTANT:** The files must be at the ROOT of the repo, NOT inside a subfolder.

### Step 3: Deploy on Vercel
1. Go to [vercel.com](https://vercel.com) → Sign in with GitHub
2. Click **Add New Project** → Import `grc-expert`
3. Click **Environment Variables** and add:
   - Name: `ANTHROPIC_API_KEY`
   - Value: your `sk-ant-...` key
4. Click **Deploy**

### Step 4: Done!
Your chatbot is live. Share the URL on LinkedIn!

## Built by Nusaybah AlHarbi
