# GRC Expert v2.0 — Phase 1

**AI-Powered Saudi & International GRC Compliance Platform**

Built by Nusaybah AlHarbi · Powered by Google Gemini

🌐 **Live:** https://grc-expert.vercel.app

---

## What's New in v2.0 (Phase 1)

This is a **complete architectural rebuild** from a basic chatbot into an enterprise GRC platform.

### Core Features

✅ **3,500+ chunks of indexed knowledge** across 16 frameworks
✅ **Built-in NCA cybersecurity toolkit** — 76 official policy/standard/procedure templates
✅ **Persistent file upload** — your documents stored in browser, indexed for AI retrieval
✅ **Lightweight RAG architecture** — TF-IDF/BM25 retrieval, Phase 2-ready (vector DB swap)
✅ **Saudi-first AI behavior** — proper framework separation, no incorrect mixing
✅ **Specialized generators** — Policy, Procedure, Risk Register, Audit Evidence, Gap Assessment
✅ **Source citations** — every answer cites the specific frameworks and documents used
✅ **Anti-hallucination** — AI explicitly says "not in KB" when it can't find sources
✅ **Dark/light mode** with theme persistence
✅ **Mobile-responsive** enterprise design

### Frameworks Indexed

| Group | Frameworks |
|-------|-----------|
| **NCA (Saudi National)** | ECC, CSCC, CCC, OTCC, DCC, NCS-1, TCC, MSOC, SCyWF, full Toolkit (76 policy/standard/procedure templates) |
| **Saudi Regulatory** | SAMA CSF, SAMA CRFR, SAMA MVC, CST CRF, SDAIA PDPL, Aramco CCC |
| **International** | ISO 27001, ISO 27002, ISO 22301, ISO 31000, NIST CSF 2.0, NIST 800-53/171, SOC 2, CIS Controls v8, PCI-DSS v4.0, COBIT, GDPR |

### Workspace Sections

- **AI Assistant** — General GRC consulting
- **File Upload** — Add your own policies, controls, audits
- **Knowledge Base** — Browse indexed sources and your uploads
- **Framework Mapping** — Cross-reference controls between frameworks

### Generators

- **Policy Generator** — Full policies aligned with NCA Toolkit / ISO structure
- **Procedure Generator** — Executable procedures with roles, steps, evidence
- **Risk Register** — ISO 31000 / NCA Risk Management methodology
- **Audit Evidence Builder** — Evidence request lists, audit checklists
- **Gap Assessment** — Compliance gap analysis with remediation roadmaps

---

## Architecture (Phase 1, Phase 2-Ready)

```
┌─────────────────────────────────────────────────────┐
│                 FRONTEND (modular)                  │
│  sources.js  →  ui.js  →  storage.js                │
│      │            │           │                     │
│      ▼            ▼           ▼                     │
│  retrieval.js (TF-IDF/BM25 — swap to vectors P2)    │
│      │                                              │
│      ▼                                              │
│  parsers.js (PDF/DOCX/XLSX/CSV)                     │
│      │                                              │
│      ▼                                              │
│  app.js (orchestration)                             │
└─────────────────────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────┐
│           /api/chat (Vercel serverless)             │
│   - Receives query + retrieved chunks + mode        │
│   - Builds structured prompt with context           │
│   - Calls Gemini with auto-fallback                 │
│   - Returns: answer + citations                     │
└─────────────────────────────────────────────────────┘
                       │
                       ▼
              ┌────────────────────┐
              │  Gemini 2.5 Flash  │
              │   (auto-fallback)  │
              └────────────────────┘
```

**Why this is Phase 2-ready:** the `retrieval.js` module exposes a clean interface (`search`, `addUserChunks`, `removeDocument`). In Phase 2, we swap its internals to use vector embeddings + Supabase pgvector or Pinecone. Nothing else changes.

---

## File Structure

```
/
├── api/
│   └── chat.js              ← Backend: structured prompts, retrieval-aware
├── app/
│   ├── styles.css           ← Enterprise design system
│   ├── sources.js           ← Frameworks, modes, official URLs
│   ├── ui.js                ← Markdown, escaping, toasts
│   ├── storage.js           ← IndexedDB persistence
│   ├── retrieval.js         ← TF-IDF/BM25 search (Phase 2-swappable)
│   ├── parsers.js           ← PDF/DOCX/XLSX/CSV extraction
│   └── app.js               ← Main orchestration
├── data/
│   └── kb.json              ← 3,502 pre-indexed framework chunks (3.8MB)
├── index.html               ← Layout shell
├── vercel.json              ← Static caching for /data and /app
├── package.json
└── README.md
```

---

## Deployment

### 1. Replace files in your GitHub repo

Upload all files in the `dist/` folder to your existing `grc-expert` repo on GitHub. The structure must match exactly. **Important:** delete any old files that aren't in this list.

### 2. Confirm Vercel environment variable

`GEMINI_API_KEY` must be set in Vercel → Settings → Environment Variables.

### 3. Push to GitHub

Vercel will auto-redeploy. The `data/kb.json` file (3.8MB) will be served as a static asset and cached for 24 hours.

### 4. First visit will load the KB

First page load downloads `kb.json` (~1MB gzipped). Browser caches it after first load — subsequent visits are instant.

---

## Testing

After deployment, test these flows:

1. **Chat** — Ask: *"Explain NCA ECC main domains"* → should cite ECC sources
2. **Saudi-first** — Ask: *"What does ECC require for IAM?"* → should NOT mix ISO terminology
3. **File upload** — Upload an Excel control list, then ask: *"Map these to NCA ECC"*
4. **Generators** — Go to Policy Generator → *"Generate Access Control Policy aligned with NCA ECC for a Saudi bank"*
5. **Anti-hallucination** — Ask about an obscure non-existent control → AI should say "not found in knowledge base"
6. **Citations** — Every detailed answer should show "Sources Referenced" chips below

---

## What's Next (Phase 2)

When you're ready, Phase 2 adds:
- **Vector embeddings** via Gemini Embeddings API
- **Supabase pgvector** or Pinecone for semantic search
- **Shared knowledge base** (admin uploads visible to all users)
- **Cross-document semantic queries** — "what controls cover access management?" finds IAM, authentication, password policy docs

Phase 2 only modifies `retrieval.js` and adds backend embedding endpoints. The rest of the app stays the same.

---

## Credits

Built by **Nusaybah AlHarbi** — Cybersecurity GRC Specialist
Powered by **Google Gemini** API
NCA, SAMA, CST, SDAIA framework content from official Saudi regulatory sources.

© 2025
