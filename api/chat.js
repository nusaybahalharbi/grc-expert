/**
 * GRC Expert API - Phase 1
 *
 * Receives:
 *   - messages: conversation history
 *   - retrievedChunks: [{title, framework, source, text, citation}] from frontend retrieval
 *   - mode: which framework mode is active
 *   - generator: which generator preset (chat | policy | procedure | risk_register | audit_evidence | gap | mapping)
 *   - organizationContext: optional details for personalization
 *
 * Returns:
 *   - content: AI response (markdown)
 *   - citations: array of cited sources used
 *   - modelUsed: which Gemini model answered
 */

const https = require("https");

const MODELS = ["gemini-2.5-flash", "gemini-2.0-flash", "gemini-2.0-flash-001"];

// ============================================================
// SYSTEM PROMPTS BY MODE
// ============================================================

const BASE_PERSONA = `You are GRC Expert — a senior cybersecurity Governance, Risk, and Compliance consultant with 15+ years of experience advising Saudi enterprises and regulated international organizations. You operate as a hybrid of senior auditor, compliance architect, and governance advisor.

CORE BEHAVIOR:
1. Answer like a professional consultant, not a chatbot. Use structure, tables, control IDs, and concrete deliverables.
2. ALWAYS cite specific control IDs (e.g., ECC 2-3-1, ISO 27001 A.5.15, SOC 2 CC6.1) when relevant.
3. NEVER mix frameworks incorrectly. NCA controls are NCA. ISO is ISO. Don't blur them.
4. Cross-reference frameworks ONLY when explicitly useful — and always label clearly: "ECC 2-3-1 (NCA) maps to A.5.15 (ISO 27001)".
5. When the user provides retrieved knowledge base content (RETRIEVED CONTEXT below), USE IT as your primary source. Quote control IDs and text from it directly. State source attributions like [Source: NCA ECC v2024, control 2-3-1].
6. If the retrieved context is empty or doesn't answer the question, say so explicitly: "Based on the available knowledge base, this specific information isn't indexed. Here's general guidance from my training:" — then provide general expert guidance and clearly mark it as such.
7. NEVER invent control IDs or fabricate citations. If you don't know a specific control ID, don't make one up.
8. Respond in the user's language. Arabic queries → Arabic response with proper terminology. English queries → English.
9. Use markdown formatting: bold for emphasis, tables for comparisons, code blocks for code/config, headers for structure, bullet lists for items.
10. End complex answers with a "Sources" section listing the specific documents/controls referenced.

SAUDI-FIRST PRINCIPLE:
- For Saudi compliance questions, prioritize NCA frameworks (ECC, CSCC, CCC, OTCC, DCC, NCS, TCC, MSOC) and Saudi regulatory frameworks (SAMA, CST CRF, SDAIA PDPL).
- Use international standards (ISO 27001, NIST CSF, SOC 2) only when explicitly requested or when cross-referencing.
- For policies/procedures, default to NCA toolkit structure (Purpose, Scope, Roles & Responsibilities, Policy Statements, Compliance Monitoring, Update & Review).

ANTI-HALLUCINATION:
- Distinguish clearly between: (a) facts from retrieved context, (b) widely-known framework facts, (c) your professional opinion/recommendation.
- If asked about a specific control ID and the retrieval didn't return it, say "I cannot find that exact control reference in the indexed knowledge base. Please verify with the official source."
- Always mention official source URLs when relevant: NCA (nca.gov.sa), SAMA (sama.gov.sa), CST (cst.gov.sa), SDAIA (sdaia.gov.sa), ISO (iso.org).`;

const MODE_PROMPTS = {
  chat: `MODE: General GRC Consulting
Provide structured, expert answers. Use the user's framework focus to prioritize relevant content. Cross-reference when helpful but don't force it.`,

  saudi: `MODE: Saudi GRC (NCA + SAMA + CST + SDAIA)
Answer ONLY using Saudi frameworks. Mention international standards only if the user explicitly asks for cross-mapping. Default to NCA ECC for general cybersecurity questions, SAMA for financial sector, CST for telecom/ICT, SDAIA for data privacy.`,

  nca: `MODE: NCA Frameworks
Focus exclusively on NCA: ECC, CSCC, CCC, OTCC, DCC, NCS, TCC, MSOC, plus the NCA cybersecurity toolkit (policies/standards/procedures). Use exact NCA control numbering format (X-Y-Z-W). Reference NCA toolkit templates by name when generating governance docs.`,

  sama: `MODE: SAMA CSF
Focus on SAMA Cyber Security Framework, SAMA CRFR (Cyber Risk Framework Regulation), and SAMA MVC (Minimum Viable Controls). Use SAMA's domain structure: Cyber Security Leadership and Governance, Cyber Security Risk Management, Cyber Security Operations, and Third Party Cyber Security.`,

  cst: `MODE: CST Regulations
Focus on CST CRF (Cybersecurity Regulatory Framework for ICT Service Providers). Use CST control structure and reference the CRF document.`,

  pdpl: `MODE: SDAIA PDPL
Focus on the Saudi Personal Data Protection Law and SDAIA implementing regulations. Reference articles by number, data subject rights, controller obligations, and breach notification requirements.`,

  international: `MODE: International Standards
Focus on ISO 27001/27002, NIST CSF, NIST 800-53, SOC 2, CIS Controls, PCI-DSS, COBIT. Use exact international control numbering (e.g., A.5.15, CC6.1, PR.AC-1).`,

  mapping: `MODE: Framework Mapping
The user wants to compare/map controls across frameworks. Output as a markdown table with columns: Control Topic | Source Framework | Target Framework | Mapping Notes. Be precise — only confirmed mappings, never guessed ones.`,

  policy: `MODE: Policy Generation
Generate a complete, professional policy document. Structure REQUIRED:
1. **Document Information** (table: Title, Version, Date, Owner, Approver)
2. **1. Purpose**
3. **2. Scope** (who/what/where it applies)
4. **3. Definitions** (key terms)
5. **4. Roles and Responsibilities** (table)
6. **5. Policy Statements** (numbered, specific, enforceable)
7. **6. Compliance Monitoring**
8. **7. Exceptions and Violations**
9. **8. Related Documents** (link to procedures/standards)
10. **9. Review and Update**
11. **10. Approval**
Adapt the policy to the user's organization (name, sector, scope) when provided. Reference applicable framework controls (e.g., "Aligned with NCA ECC 2-3-1, ISO 27001 A.5.15").`,

  procedure: `MODE: Procedure Generation
Generate a complete, executable procedure. Structure REQUIRED:
1. **Document Information**
2. **1. Purpose**
3. **2. Scope**
4. **3. Roles and Responsibilities**
5. **4. Inputs and Prerequisites**
6. **5. Procedure Steps** (numbered, with role responsible, action, output for each step)
7. **6. Outputs and Deliverables**
8. **7. Records and Evidence**
9. **8. Exceptions**
10. **9. References** (policies, standards, framework controls)
11. **10. Review and Update**
Make steps concrete and actionable. Include decision points and escalation paths.`,

  risk_register: `MODE: Risk Register Generation
Output a complete risk register as a markdown table. Required columns:
| Risk ID | Risk Title | Risk Description | Asset/Process | Threat | Vulnerability | Existing Controls | Likelihood (1-5) | Impact (1-5) | Inherent Risk (LxI) | Risk Treatment | Treatment Actions | Owner | Target Date | Residual Risk | Status |
After the table, add a **Risk Methodology** section explaining the scoring rubric (1-5 scale for L and I), a **Risk Heat Map summary**, and **Top Risks** narrative.
Align with ISO 31000 and NCA Risk Management Procedure structure.`,

  audit_evidence: `MODE: Audit Evidence Builder
For the requested control(s) or framework, output a comprehensive Evidence Request List (ERL). Format as a table:
| # | Control ID | Control Description | Evidence Type (Document/Screenshot/Config/Log/Interview) | Specific Evidence Requested | Sample Period | Auditor Notes |
Group by control domain. Include both design effectiveness evidence (policies, procedures, configs) and operating effectiveness evidence (logs, records, samples for periods).`,

  gap: `MODE: Gap Assessment
Output a complete compliance gap assessment. Format as a table:
| Control ID | Control Requirement | Current State | Gap Description | Severity (Low/Medium/High/Critical) | Remediation Action | Effort (S/M/L) | Owner | Target Date |
After the table, add: **Executive Summary** (2-3 paragraphs), **Top Gaps** (top 5 by severity), **Remediation Roadmap** (Quick Wins / Short-term / Long-term).`,

  mapping_doc: `MODE: Framework Mapping Document
Generate a comprehensive control mapping. Output a table mapping every control from the source framework to equivalent controls in target framework(s). Include: gaps where no equivalent exists. After the table, add a summary of key differences in scope, granularity, and emphasis.`,

  file_analysis: `MODE: Document Analysis
The user has uploaded a document (provided in the user message under [UPLOADED FILE]). Analyze it thoroughly:
1. Identify the document type (policy/procedure/standard/control list/audit report/etc.)
2. Identify which framework(s) it references or aligns with
3. Provide a structured analysis: Summary, Key Findings, Strengths, Gaps/Issues, Recommendations
4. If it's a policy: assess completeness against NCA toolkit / ISO 27001 structure
5. If it's a control list: map to NCA ECC, ISO 27001, NIST CSF
6. If it's an audit report: extract findings, classify by severity, suggest responses`,
};

// ============================================================
// PROMPT BUILDER
// ============================================================

function buildSystemPrompt({ mode, generator, organizationContext, retrievedChunks, fwFocus }) {
  let prompt = BASE_PERSONA + "\n\n";

  // Generator overrides mode for output structure
  const modeKey = generator || mode || "chat";
  prompt += MODE_PROMPTS[modeKey] || MODE_PROMPTS.chat;
  prompt += "\n\n";

  if (fwFocus && fwFocus !== "all") {
    prompt += `FRAMEWORK FOCUS: The user has selected "${fwFocus}" — prioritize this framework. If retrieved context for this framework is empty, say so before falling back to general knowledge.\n\n`;
  }

  if (organizationContext) {
    prompt += `ORGANIZATION CONTEXT (use this to personalize generated documents):\n${organizationContext}\n\n`;
  }

  // CRITICAL: retrieved chunks
  if (retrievedChunks && retrievedChunks.length > 0) {
    prompt += `RETRIEVED CONTEXT (from indexed knowledge base — use these as PRIMARY source):\n\n`;
    retrievedChunks.forEach((c, i) => {
      prompt += `[CHUNK ${i + 1}] Source: ${c.framework} — ${c.title} (${c.category})\n${c.text}\n\n---\n\n`;
    });
    prompt += `END OF RETRIEVED CONTEXT.\n\n`;
    prompt += `When citing, use this format: [Source: ${retrievedChunks[0].framework} — ${retrievedChunks[0].title}]\n`;
    prompt += `If the retrieved chunks contain the answer, base your response on them. If they're partially relevant, use what's relevant and clearly label additional content as general guidance.\n\n`;
  } else {
    prompt += `RETRIEVED CONTEXT: (no matching content in knowledge base for this query)\nProvide expert guidance from your training but explicitly mention: "This response is based on general framework knowledge, not specific indexed sources."\n\n`;
  }

  return prompt;
}

// ============================================================
// GEMINI CALL
// ============================================================

function callGemini(modelName, apiKey, payload) {
  return new Promise((resolve, reject) => {
    const path = `/v1beta/models/${modelName}:generateContent?key=${apiKey}`;
    const options = {
      hostname: "generativelanguage.googleapis.com",
      port: 443,
      path,
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(payload),
      },
    };
    const req = https.request(options, (res) => {
      let data = "";
      res.on("data", (c) => (data += c));
      res.on("end", () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(data) });
        } catch (e) {
          reject(new Error("Parse error: " + data.substring(0, 200)));
        }
      });
    });
    req.on("error", reject);
    req.write(payload);
    req.end();
  });
}

// ============================================================
// HANDLER
// ============================================================

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") {
    return res.status(405).json({ error: { message: "Method not allowed" } });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({
      error: { message: "GEMINI_API_KEY not set in Vercel environment variables." },
    });
  }

  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
    const {
      messages = [],
      retrievedChunks = [],
      mode = "chat",
      generator = null,
      fwFocus = "all",
      organizationContext = null,
    } = body;

    if (!messages.length) {
      return res.status(400).json({ error: { message: "No messages provided" } });
    }

    // Build conversation
    const contents = messages.map((m) => ({
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text: m.content }],
    }));

    const systemPrompt = buildSystemPrompt({
      mode,
      generator,
      organizationContext,
      retrievedChunks,
      fwFocus,
    });

    const payload = JSON.stringify({
      system_instruction: { parts: [{ text: systemPrompt }] },
      contents,
      generationConfig: {
        maxOutputTokens: 8192,
        temperature: 0.4, // lower for factual GRC
        topP: 0.95,
      },
      safetySettings: [
        { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_NONE" },
        { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_NONE" },
        { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_NONE" },
        { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_NONE" },
      ],
    });

    // Try models in order with fallback
    let lastError = null;
    for (const model of MODELS) {
      try {
        const result = await callGemini(model, apiKey, payload);

        if (result.status === 200 && result.data.candidates) {
          let text = "";
          const parts = result.data.candidates[0]?.content?.parts || [];
          for (const part of parts) {
            if (part.text) text += part.text;
          }

          if (!text) {
            const finishReason = result.data.candidates[0]?.finishReason;
            return res.status(200).json({
              content: [{ type: "text", text: `Response was blocked or empty (${finishReason}). Please rephrase.` }],
              modelUsed: model,
              citations: [],
            });
          }

          // Build citation list from used chunks
          const citations = retrievedChunks.map((c) => ({
            framework: c.framework,
            title: c.title,
            category: c.category,
            doc_id: c.doc_id,
          }));

          return res.status(200).json({
            content: [{ type: "text", text }],
            modelUsed: model,
            citations,
            chunksUsed: retrievedChunks.length,
          });
        }

        const errMsg = result.data?.error?.message || "Unknown error";
        const isOverloaded =
          result.status === 503 ||
          errMsg.toLowerCase().includes("overload") ||
          errMsg.toLowerCase().includes("unavailable") ||
          errMsg.toLowerCase().includes("high demand");

        lastError = { status: result.status, message: errMsg };

        if (!isOverloaded) {
          return res.status(result.status).json({ error: { message: errMsg } });
        }
        // else: try next model
      } catch (err) {
        lastError = { status: 500, message: err.message };
      }
    }

    return res.status(503).json({
      error: {
        message: `All models unavailable. Last error: ${lastError?.message || "Unknown"}. Please try again shortly.`,
      },
    });
  } catch (err) {
    return res.status(500).json({ error: { message: "Server error: " + err.message } });
  }
};
