# GRC Expert v2.1 — Phase 1 Hardened

**AI-Powered Saudi & International GRC Compliance Platform**
Built by Nusaybah AlHarbi · Powered by Google Gemini

🌐 **Live:** https://grc-expert.vercel.app

---

## What's New in v2.1

### Production Fixes
- ✅ **Removed all deprecated models** — only `gemini-2.5-flash` (main) and `gemini-2.5-flash-lite` (fallback)
- ✅ **Fixed corrupted/repetitive output** — chunk dedup + anti-repetition prompts + post-processing
- ✅ **Fixed "Processing file..." stuck issue** — safety timeout + bulletproof try/finally
- ✅ **Comprehensive logging** — every step logged to console for debugging
- ✅ **Retry logic** — main model retries once before falling back
- ✅ **Timeout handling** — 25s API timeout, 60s frontend timeout with abort

### NEW: Export & Copy Features
Every AI response now includes export buttons:
- 📋 **Copy** — Full markdown to clipboard
- 📄 **Word** — Properly formatted .docx with headings, tables, styles
- 📑 **PDF** — Print-ready PDF via jsPDF (with autotable for tables)
- 📊 **Excel** — Tables exported as .xlsx (multi-sheet if multiple tables)

Excel export auto-detects tables in responses (risk registers, gap assessments, audit lists, control mappings, etc.) and exports them with proper column structure.

### Risk Register Format
Generates exactly these columns: Risk ID, Risk Title, Risk Description, Asset/Process, Threat, Vulnerability, Existing Controls, Likelihood (1-5), Impact (1-5), Inherent Risk (LxI), Risk Treatment, Treatment Actions, Owner, Target Date, Residual Risk, Status

Plus: Risk Methodology, Top Risks, Treatment Summary sections.

---

## Architecture

```
Frontend modules (load order):
  sources.js       → frameworks, modes, official URLs
  ui.js            → markdown rendering, toasts
  storage.js       → IndexedDB persistence
  retrieval.js     → TF-IDF/BM25 search
  parsers.js       → PDF/DOCX/XLSX/CSV extraction
  exporter.js      → Word/PDF/Excel/Copy exports  ← NEW
  app.js           → orchestration

External libraries (CDN, defer-loaded):
  pdf.js           → PDF parsing
  mammoth.js       → DOCX parsing
  SheetJS (xlsx)   → XLSX read & write
  docx             → DOCX generation              ← NEW
  jsPDF            → PDF generation               ← NEW
  jspdf-autotable  → Tables in PDFs               ← NEW

Backend:
  api/chat.js      → Gemini proxy with chunk cleaning, retry, fallback
```

---

## Frameworks Indexed (3,502 chunks)

| Group | Frameworks |
|-------|-----------|
| **NCA** | ECC, CSCC, CCC, OTCC, DCC, NCS-1, TCC, MSOC, SCyWF, full Toolkit (76 templates) |
| **Saudi Regulatory** | SAMA CSF/CRFR/MVC, CST CRF, SDAIA PDPL, Aramco CCC |
| **International** | ISO 27001/27002/22301/31000, NIST CSF 2.0, NIST 800-53/171, SOC 2, CIS v8, PCI-DSS v4.0, COBIT, GDPR |

---

## File Structure

```
/
├── api/
│   └── chat.js              ← v2.1: hardened, dedup, retry, only gemini-2.5
├── app/
│   ├── styles.css           ← v2.1: + export button styles
│   ├── sources.js
│   ├── ui.js
│   ├── storage.js
│   ├── retrieval.js
│   ├── parsers.js
│   ├── exporter.js          ← NEW: Word/PDF/Excel/Copy
│   └── app.js               ← v2.1: + export buttons, hardened upload
├── data/
│   └── kb.json              ← 3,502 chunks
├── index.html               ← v2.1: + docx, jsPDF CDNs
├── vercel.json
├── package.json
└── README.md
```

---
.
## Deployment

### Required Environment Variable
`GEMINI_API_KEY` must be set in Vercel → Settings → Environment Variables.

### Deploy via git
```bash
git clone https://github.com/nusaybahalharbi/grc-expert.git
cd grc-expert
# Delete old files
rm -rf api app data index.html vercel.json package.json
# Copy new files from this package
cp -r /path/to/dist/* .
git add .
git commit -m "v2.1: Export features + production hardening"
git push
```

Vercel auto-deploys in ~2 minutes.

---

## Testing Checklist

After deployment, verify:

1. **Open browser console** (F12) — you should see logs like `[chat]`, `[upload]`
2. **Chat works** — ask: *"Explain NCA ECC main domains"* → cites ECC sources
3. **Risk Register** — go to Risk Register Generator → *"Risk register for Saudi bank"* → table with all 16 columns
4. **Export buttons appear** below every substantial response
5. **Copy** works — paste into another app
6. **Word export** downloads `.docx` with proper formatting
7. **PDF export** downloads `.pdf` with formatted tables
8. **Excel export** appears only when response has tables, downloads `.xlsx`
9. **No "stuck processing"** — file upload completes or shows error within 60s
10. **No repeated text** in policies/risk registers

---

## Browser Console Logs

Every operation now logs detailed info:
- `[chat] Request: mode=... gen=... chunks=8 msgs=2`
- `[chat] After dedup: 6 chunks`
- `[chat] Calling gemini-2.5-flash (attempt 1/2)`
- `[chat] gemini-2.5-flash responded in 4231ms`
- `[chat] SUCCESS: gemini-2.5-flash, 5421 chars, 4250ms`
- `[upload] Starting upload: ...`
- `[upload] Parsed: 24 chunks`
- `[export] word ...`

---

## Credits

Built by **Nusaybah AlHarbi** — Cybersecurity GRC Specialist
Powered by **Google Gemini 2.5**
NCA, SAMA, CST, SDAIA framework content from official Saudi regulatory sources.

## Security Hardening Update

Applied production-oriented safeguards:
- Added explicit prompt-injection and jailbreak resistance rules.
- Blocked disclosure of system prompts, hidden instructions, backend details, API keys, and internal configuration.
- Treated uploaded files and retrieved context as untrusted data that cannot override system behavior.
- Strengthened compliance-safety wording to prevent fake evidence, false attestations, or unsupported claims of compliance/certification/audit readiness.
- Added stricter citation behavior: only references actually used in the answer should appear as sources.
- Updated source label from “Sources Referenced” to “Sources Used”.
- Added UI disclaimer: “GRC Expert can make mistakes. Verify important compliance and security decisions.”
