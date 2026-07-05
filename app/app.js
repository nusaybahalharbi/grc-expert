/**
 * GRC Expert — Main Application Logic
 *
 * Orchestrates: page navigation, state, retrieval+API calls, file uploads,
 * message rendering, citations, knowledge base management.
 */

(function (window) {
  'use strict';

  // ============ APP STATE ============
  const State = {
    currentPage: 'chat',
    currentFw: 'all',
    currentMode: 'chat',       // chat | saudi | nca | sama | cst | pdpl | international | mapping
    currentGenerator: null,    // null | policy | procedure | risk_register | etc
    messages: [],
    attachedFiles: [],
    busy: false,
    kbReady: false,
    theme: 'dark',
  };

  // ============ INIT ============
  async function init() {
    console.log('[GRC Expert] Initializing...');

    // Set theme from preferences
    try {
      await window.storage.init();
      const savedTheme = await window.storage.loadPreference('theme');
      if (savedTheme === 'light') {
        State.theme = 'light';
        document.documentElement.setAttribute('data-theme', 'light');
        document.querySelector('.theme-toggle-text').textContent = 'Light';
      }
    } catch (e) {
      console.warn('Storage init failed:', e);
    }

    renderSidebar();
    renderPage();
    setupEventListeners();

    // Load knowledge base
    setKbStatus('loading', 'Loading KB...');
    try {
      await window.retrieval.init((p) => {
        if (p.stage === 'fetching') setKbStatus('loading', 'Fetching KB...');
        else if (p.stage === 'indexing') setKbStatus('loading', `Indexing ${p.current || 0}/${p.total}`);
        else if (p.stage === 'ready') {
          State.kbReady = true;
          const stats = window.retrieval.stats();
          setKbStatus('ready', 'Knowledge Base Active');
        }
      });

      // Load user-uploaded chunks from IndexedDB
      const userChunks = await window.storage.loadAllChunks();
      if (userChunks.length > 0) {
        window.retrieval.addUserChunks(userChunks);
        const stats = window.retrieval.stats();
        setKbStatus('ready', 'Knowledge Base Active');
      }
      State.kbReady = true;
    } catch (e) {
      console.error('KB load failed:', e);
      setKbStatus('error', 'KB error');
      window.ui.toast('Knowledge base failed to load — AI can still answer from training', 'error', 5000);
    }
  }

  // ============ KB STATUS ============
  function setKbStatus(state, text) {
    const badge = document.getElementById('kbStatus');
    if (!badge) return;
    badge.className = `kb-status ${state}`;
    badge.querySelector('.kb-status-text').textContent = text;
  }

  // ============ SIDEBAR ============
  function renderSidebar() {
    // Render workspace nav
    const workspace = document.getElementById('workspaceNav');
    const workspaceItems = [
      { id: 'chat', name: 'AI Assistant', icon: 'msg' },
      { id: 'upload', name: 'File Upload', icon: 'upload' },
      { id: 'knowledge', name: 'Knowledge Base', icon: 'book' },
      { id: 'mapping', name: 'Framework Mapping', icon: 'link' },
    ];
    workspace.innerHTML = workspaceItems.map(item =>
      `<button class="nav-item ${State.currentPage === item.id ? 'active' : ''}" data-page="${item.id}">
        ${getIcon(item.icon)}
        ${item.name}
      </button>`
    ).join('');

    // Render generators
    const gen = document.getElementById('generatorsNav');
    const genItems = [
      { id: 'policy', name: 'Policy Generator', icon: 'doc' },
      { id: 'procedure', name: 'Procedure Generator', icon: 'list' },
      { id: 'risk', name: 'Risk Register', icon: 'alert' },
      { id: 'audit', name: 'Audit Evidence', icon: 'check' },
      { id: 'gap', name: 'Gap Assessment', icon: 'gap' },
    ];
    gen.innerHTML = genItems.map(item =>
      `<button class="nav-item ${State.currentPage === item.id ? 'active' : ''}" data-page="${item.id}">
        ${getIcon(item.icon)}
        ${item.name}
      </button>`
    ).join('');

    // Sources nav
    const sourcesNav = document.getElementById('sourcesNav');
    sourcesNav.innerHTML = `
      <button class="nav-item ${State.currentPage === 'sources' ? 'active' : ''}" data-page="sources">
        ${getIcon('library')} Source Library
      </button>
    `;

    // Wire clicks
    document.querySelectorAll('.nav-item[data-page]').forEach(btn => {
      btn.addEventListener('click', () => navigateTo(btn.dataset.page));
    });

    // Frameworks
    renderFrameworkList();
  }

  function renderFrameworkList() {
    const list = document.getElementById('fwList');
    const FW = window.sources.FRAMEWORKS;
    const groups = {};
    for (const f of FW) {
      if (!groups[f.group]) groups[f.group] = [];
      groups[f.group].push(f);
    }

    let html = `<button class="fw-item ${State.currentFw === 'all' ? 'ac' : ''}" data-fw="all"><span class="fw-dot"></span>All Frameworks</button>`;
    for (const [group, items] of Object.entries(groups)) {
      html += `<div class="fw-group">${group}</div>`;
      for (const f of items) {
        html += `<button class="fw-item ${State.currentFw === f.id ? 'ac' : ''}" data-fw="${f.id}" title="${window.ui.escapeHtml(f.longName)}"><span class="fw-dot"></span>${window.ui.escapeHtml(f.name)}</button>`;
      }
    }
    list.innerHTML = html;

    list.querySelectorAll('.fw-item').forEach(b => {
      b.addEventListener('click', () => {
        State.currentFw = b.dataset.fw;
        renderFrameworkList();
        updateTopbar();
      });
    });
  }

  function getIcon(name) {
    const icons = {
      msg: '<svg class="nav-icon" viewBox="0 0 24 24"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/></svg>',
      upload: '<svg class="nav-icon" viewBox="0 0 24 24"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>',
      book: '<svg class="nav-icon" viewBox="0 0 24 24"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>',
      link: '<svg class="nav-icon" viewBox="0 0 24 24"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>',
      doc: '<svg class="nav-icon" viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>',
      list: '<svg class="nav-icon" viewBox="0 0 24 24"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>',
      alert: '<svg class="nav-icon" viewBox="0 0 24 24"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>',
      check: '<svg class="nav-icon" viewBox="0 0 24 24"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>',
      gap: '<svg class="nav-icon" viewBox="0 0 24 24"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>',
      library: '<svg class="nav-icon" viewBox="0 0 24 24"><path d="M3 3h7v7H3z"/><path d="M14 3h7v7h-7z"/><path d="M14 14h7v7h-7z"/><path d="M3 14h7v7H3z"/></svg>',
    };
    return icons[name] || icons.msg;
  }

  // ============ NAVIGATION ============
  function navigateTo(page) {
    State.currentPage = page;

    // Set mode/generator based on page
    const pageConfig = {
      chat: { mode: 'chat', generator: null },
      upload: { mode: 'chat', generator: null },
      knowledge: { mode: 'chat', generator: null },
      mapping: { mode: 'mapping', generator: 'mapping' },
      policy: { mode: 'chat', generator: 'policy' },
      procedure: { mode: 'chat', generator: 'procedure' },
      risk: { mode: 'chat', generator: 'risk_register' },
      audit: { mode: 'chat', generator: 'audit_evidence' },
      gap: { mode: 'chat', generator: 'gap' },
      sources: { mode: 'chat', generator: null },
    };
    const cfg = pageConfig[page] || { mode: 'chat', generator: null };
    State.currentMode = cfg.mode;
    State.currentGenerator = cfg.generator;

    // If switching pages mid-conversation, reset messages for clean experience
    if (page !== 'knowledge' && page !== 'sources' && page !== 'upload') {
      // Keep conversation only when staying in chat-like pages
      if (State.messages.length > 0) {
        const wasChat = State.currentPage === 'chat';
        // Simple rule: switching to a different generator clears previous chat
        // (because the system prompt context changes substantially)
      }
    }

    // For pure utility pages, clear messages if previous was a different generator
    State.messages = [];
    State.attachedFiles = [];

    renderSidebar();
    renderPage();
    closeSidebar();
  }

  function updateTopbar() {
    const titles = {
      chat: 'AI GRC Assistant',
      upload: 'File Upload Center',
      knowledge: 'Knowledge Base',
      mapping: 'Framework Mapping',
      policy: 'Policy Generator',
      procedure: 'Procedure Generator',
      risk: 'Risk Register Generator',
      audit: 'Audit Evidence Builder',
      gap: 'Gap Assessment',
      sources: 'Source Library',
    };
    document.getElementById('topTitle').textContent = titles[State.currentPage] || 'GRC Expert';
    const fw = window.sources.FRAMEWORKS.find(f => f.id === State.currentFw);
    document.getElementById('topCtx').textContent = fw ? fw.name : 'All Frameworks';
  }

  // ============ PAGE RENDERING ============
  function renderPage() {
    updateTopbar();
    const area = document.getElementById('chatArea');
    const inputBar = document.getElementById('inputBar');

    if (State.currentPage === 'knowledge') {
      renderKnowledgePage(area);
      inputBar.style.display = 'none';
    } else if (State.currentPage === 'sources') {
      renderSourcesPage(area);
      inputBar.style.display = 'none';
    } else if (State.currentPage === 'upload') {
      renderUploadPage(area);
      inputBar.style.display = '';
      updatePlaceholder();
    } else {
      // chat-like page (chat, mapping, generators)
      renderChatPage(area);
      inputBar.style.display = '';
      updatePlaceholder();
    }
  }

  function renderChatPage(area) {
    if (State.messages.length === 0) {
      renderWelcome(area);
    } else {
      // Re-render conversation
      area.innerHTML = '';
      for (const msg of State.messages) {
        if (msg.role === 'user') appendUserBubble(msg.content, msg.fileChips || '');
        else appendBotBubble(msg.content, msg.modelUsed, msg.citations);
      }
    }
  }

  function renderWelcome(area) {
    const page = State.currentPage;
    const headers = {
      chat: { title: 'GRC Expert', sub: 'Your Saudi-first AI GRC consultant. Ask about any framework, control, or compliance topic. The AI uses the indexed knowledge base for accurate, sourced answers.' },
      mapping: { title: 'Framework Mapping', sub: 'Compare and cross-reference controls between frameworks. Get accurate mappings between NCA, ISO, NIST, and more.' },
      policy: { title: 'Policy Generator', sub: 'Generate complete, professional policies aligned with NCA Toolkit, ISO 27001, and other frameworks. Customize for your organization.' },
      procedure: { title: 'Procedure Generator', sub: 'Generate executable procedures with roles, steps, inputs, outputs, and evidence requirements.' },
      risk: { title: 'Risk Register Generator', sub: 'Generate risk registers following ISO 31000 and NCA Risk Management methodology with full risk treatment plans.' },
      audit: { title: 'Audit Evidence Builder', sub: 'Generate evidence request lists, audit interview questions, and finding response templates.' },
      gap: { title: 'Gap Assessment', sub: 'Conduct compliance gap analysis with severity ratings, remediation plans, and roadmaps.' },
    };
    const cfg = headers[page] || headers.chat;
    const starters = window.sources.STARTERS[page] || window.sources.STARTERS.chat;

    const startersHtml = starters.map(st =>
      `<button class="starter" data-text="${window.ui.escapeHtml(st.t)}"><span class="starter-icon">${st.i}</span><span>${window.ui.escapeHtml(st.t)}</span></button>`
    ).join('');

    area.innerHTML = `
      <div class="welcome">
        <div class="welcome-icon">🛡</div>
        <h2>${window.ui.escapeHtml(cfg.title)}</h2>
        <p class="welcome-sub">${window.ui.escapeHtml(cfg.sub)}</p>
        <div class="starters">${startersHtml}</div>
      </div>
    `;

    area.querySelectorAll('.starter').forEach(s => {
      s.addEventListener('click', () => {
        sendMessage(s.dataset.text);
      });
    });
  }

  function renderUploadPage(area) {
    const userDocs = window.retrieval.listUserDocuments();

    let docsHtml = '';
    if (userDocs.length === 0) {
      docsHtml = `<div class="empty">No files uploaded yet. Use the upload button below to add documents.</div>`;
    } else {
      docsHtml = userDocs.map(d => `
        <div class="doc-row">
          <div class="doc-icon">${getIcon('doc').replace('class="nav-icon"', 'viewBox="0 0 24 24"').replace('<svg', '<svg width="18" height="18" stroke="currentColor" fill="none" stroke-width="2"')}</div>
          <div class="doc-info">
            <div class="doc-name">${window.ui.escapeHtml(d.title)}</div>
            <div class="doc-meta">${window.ui.escapeHtml(d.framework)} · ${window.ui.escapeHtml(d.category)} · ${d.chunks} chunks</div>
          </div>
          <div class="doc-actions">
            <button class="doc-btn danger" data-delete="${d.doc_id}">Delete</button>
          </div>
        </div>
      `).join('');
    }

    area.innerHTML = `
      <div class="kb-page" style="padding: 16px 22px;">
        <div class="welcome" style="min-height: auto; padding: 12px 0 24px;">
          <div class="welcome-icon">📤</div>
          <h2>File Upload Center</h2>
          <p class="welcome-sub">Upload PDFs, Word documents, Excel sheets, CSV, or TXT files. They'll be parsed, indexed, and available for the AI to reference. Files are stored locally in your browser.</p>
          <div class="starters" style="max-width: 720px;">
            <button class="starter" id="uploadTrigger" style="grid-column: 1 / -1; justify-content: center; align-items: center; padding: 16px; font-size: 14px; font-weight: 600; border-color: var(--primary); color: var(--primary);">
              <span class="starter-icon">📤</span> Click to upload a file (PDF, Word, Excel, CSV, TXT)
            </button>
          </div>
        </div>
        <div class="kb-section">
          <h3>Your Uploaded Documents (${userDocs.length})</h3>
          <div class="user-docs">${docsHtml}</div>
        </div>
      </div>
    `;

    document.getElementById('uploadTrigger').addEventListener('click', () => {
      document.getElementById('fileInput').click();
    });

    area.querySelectorAll('[data-delete]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const docId = btn.dataset.delete;
        if (!confirm('Delete this document and all its indexed chunks?')) return;
        const removed = window.retrieval.removeDocument(docId);
        await window.storage.deleteDocument(docId);
        window.ui.toast(`Deleted (${removed} chunks)`, 'success');
        renderPage();
      });
    });
  }

  function renderKnowledgePage(area) {
    const stats = window.retrieval.stats();
    const userDocs = window.retrieval.listUserDocuments();

    const fwListHtml = Object.entries(stats.byFramework)
      .sort((a, b) => b[1] - a[1])
      .map(([fw, count]) => {
        const fwMeta = window.sources.FRAMEWORKS.find(f => f.kbName === fw);
        const officialUrl = fwMeta ? fwMeta.officialUrl : '';
        return `
          <div class="fw-card">
            <div class="fw-card-info">
              <div class="fw-card-name">${window.ui.escapeHtml(fw)}</div>
              <div class="fw-card-count">${count} chunks</div>
            </div>
            ${officialUrl ? `<a href="${officialUrl}" target="_blank" class="fw-card-link">Official ↗</a>` : ''}
          </div>`;
      }).join('');

    area.innerHTML = `
      <div class="kb-page">
        <div class="kb-stats">
          <div class="kb-stat">
            <div class="kb-stat-label">Total Chunks</div>
            <div class="kb-stat-value">${stats.totalChunks.toLocaleString()}</div>
            <div class="kb-stat-sub">Indexed for retrieval</div>
          </div>
          <div class="kb-stat">
            <div class="kb-stat-label">Built-in KB</div>
            <div class="kb-stat-value">${stats.builtInChunks.toLocaleString()}</div>
            <div class="kb-stat-sub">${Object.keys(stats.byFramework).length} frameworks</div>
          </div>
          <div class="kb-stat">
            <div class="kb-stat-label">Your Documents</div>
            <div class="kb-stat-value">${stats.uniqueUserDocuments}</div>
            <div class="kb-stat-sub">${stats.userChunks} indexed segments</div>
          </div>
          <div class="kb-stat">
            <div class="kb-stat-label">Status</div>
            <div class="kb-stat-value" style="color: var(--success); font-size: 14px; padding: 6px 0;">${stats.initialized ? '✓ Ready' : '⏳ Loading'}</div>
            <div class="kb-stat-sub">RAG-ready</div>
          </div>
        </div>

        <div class="kb-section">
          <h3>Indexed Frameworks</h3>
          <div class="fw-grid">${fwListHtml}</div>
        </div>

        <div class="kb-section">
          <h3>Your Uploaded Documents (${userDocs.length})</h3>
          <div class="user-docs">${userDocs.length === 0 ? '<div class="empty">No uploaded documents yet. Go to <strong>File Upload</strong> to add some.</div>' : userDocs.map(d => `
            <div class="doc-row">
              <div class="doc-icon"><svg width="18" height="18" viewBox="0 0 24 24" stroke="currentColor" fill="none" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg></div>
              <div class="doc-info">
                <div class="doc-name">${window.ui.escapeHtml(d.title)}</div>
                <div class="doc-meta">${window.ui.escapeHtml(d.framework)} · ${window.ui.escapeHtml(d.category)} · ${d.chunks} chunks</div>
              </div>
              <div class="doc-actions">
                <button class="doc-btn danger" data-delete="${d.doc_id}">Delete</button>
              </div>
            </div>
          `).join('')}</div>
        </div>
      </div>
    `;

    area.querySelectorAll('[data-delete]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const docId = btn.dataset.delete;
        if (!confirm('Delete this document and all its indexed chunks?')) return;
        const removed = window.retrieval.removeDocument(docId);
        await window.storage.deleteDocument(docId);
        window.ui.toast(`Deleted (${removed} chunks)`, 'success');
        renderPage();
      });
    });
  }

  function renderSourcesPage(area) {
    const FW = window.sources.FRAMEWORKS;
    const groups = {};
    for (const f of FW) {
      if (!groups[f.group]) groups[f.group] = [];
      groups[f.group].push(f);
    }

    let html = `<div class="kb-page">
      <div class="welcome" style="min-height: auto; padding: 12px 0 24px;">
        <div class="welcome-icon">📚</div>
        <h2>Source Library</h2>
        <p class="welcome-sub">Official framework sources. Click any link to open the original regulatory document.</p>
      </div>`;

    for (const [group, items] of Object.entries(groups)) {
      html += `<div class="kb-section"><h3>${window.ui.escapeHtml(group)}</h3><div class="fw-grid">`;
      for (const f of items) {
        html += `
          <div class="fw-card">
            <div class="fw-card-info">
              <div class="fw-card-name">${window.ui.escapeHtml(f.name)}</div>
              <div class="fw-card-count">${window.ui.escapeHtml(f.longName)}</div>
            </div>
            ${f.officialUrl ? `<a href="${f.officialUrl}" target="_blank" class="fw-card-link">Open ↗</a>` : ''}
          </div>`;
      }
      html += `</div></div>`;
    }
    html += `</div>`;
    area.innerHTML = html;
  }

  function updatePlaceholder() {
    const ta = document.getElementById('ta');
    const placeholders = {
      chat: 'Ask GRC Expert anything...',
      mapping: 'e.g., Map NCA ECC to ISO 27001',
      policy: 'e.g., Generate IAM Policy for a Saudi bank...',
      procedure: 'e.g., Generate Incident Response Procedure...',
      risk: 'e.g., Risk register for cloud migration...',
      audit: 'e.g., Evidence list for ECC audit...',
      gap: 'e.g., NCA ECC gap assessment for SaaS company...',
      upload: 'After uploading, ask about your file...',
    };
    ta.placeholder = placeholders[State.currentPage] || placeholders.chat;
  }

  // ============ MOBILE SIDEBAR ============
  function openSidebar() {
    document.getElementById('sidebar').classList.add('open');
    document.getElementById('overlay').classList.add('open');
  }
  function closeSidebar() {
    document.getElementById('sidebar').classList.remove('open');
    document.getElementById('overlay').classList.remove('open');
  }

  // ============ FILE UPLOAD ============
  async function handleFileUpload(file) {
    if (!file) return;
    if (file.size > 15 * 1024 * 1024) {
      window.ui.toast('File too large (max 15MB)', 'error');
      return;
    }

    console.log(`[upload] Starting upload: ${file.name} (${(file.size/1024).toFixed(1)}KB)`);

    const procEl = document.getElementById('fileProcessing');
    const procText = document.getElementById('procText');
    procEl.style.display = 'flex';

    // Hard timeout safety net — never leave the indicator visible forever
    const safetyTimeout = setTimeout(() => {
      console.warn('[upload] Safety timeout reached, hiding indicator');
      procEl.style.display = 'none';
    }, 120000);

    try {
      console.log('[upload] Parsing file...');
      const result = await window.parsers.parseFile(file, (p) => {
        if (procText) procText.textContent = p.message || 'Processing...';
        console.log(`[upload] Progress: ${p.stage} - ${p.message || ''}`);
      });

      console.log(`[upload] Parsed: ${result.chunks.length} chunks`);

      // Add to retrieval index
      window.retrieval.addUserChunks(result.chunks);
      console.log('[upload] Added to retrieval index');

      // Persist to IndexedDB
      await window.storage.saveDocument(result.metadata, result.chunks);
      console.log('[upload] Saved to IndexedDB');

      // Attach to next message if on chat-like page
      if (['chat', 'mapping', 'policy', 'procedure', 'risk', 'audit', 'gap', 'upload'].includes(State.currentPage)) {
        State.attachedFiles.push({
          docId: result.metadata.doc_id,
          name: result.metadata.filename,
          size: window.ui.formatSize(result.metadata.filesize),
          chunkCount: result.chunks.length,
          framework: result.metadata.framework,
        });
        renderAttached();
        toggleSendButton();
      }

      window.ui.toast(`Indexed ${result.chunks.length} chunks from ${file.name}`, 'success', 4000);

      if (State.currentPage === 'upload' || State.currentPage === 'knowledge') {
        renderPage();
      }
      console.log('[upload] Complete');
    } catch (err) {
      console.error('[upload] Failed:', err);
      window.ui.toast('Failed: ' + (err.message || 'Unknown error'), 'error', 6000);
    } finally {
      clearTimeout(safetyTimeout);
      procEl.style.display = 'none';
    }
  }

  function renderAttached() {
    const el = document.getElementById('attached');
    if (!el) return;
    if (State.attachedFiles.length === 0) {
      el.innerHTML = '';
      return;
    }
    el.innerHTML = State.attachedFiles.map((f, i) => `
      <div class="file-chip">
        <svg width="13" height="13" viewBox="0 0 24 24" stroke="currentColor" fill="none" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
        <span class="file-chip-name">${window.ui.escapeHtml(f.name)}</span>
        <span class="file-chip-size">${f.chunkCount} chunks</span>
        <button class="file-chip-x" data-remove="${i}" title="Remove">×</button>
      </div>
    `).join('');

    el.querySelectorAll('[data-remove]').forEach(b => {
      b.addEventListener('click', () => {
        State.attachedFiles.splice(parseInt(b.dataset.remove), 1);
        renderAttached();
        toggleSendButton();
      });
    });
  }

  // ============ MESSAGE SENDING ============
  function sendMessage(text) {
    text = (text || document.getElementById('ta').value || '').trim();
    if (!text || State.busy) return;

    document.getElementById('ta').value = '';
    document.getElementById('ta').style.height = 'auto';
    toggleSendButton();

    if (State.messages.length === 0) {
      // Clear welcome
      const welcome = document.querySelector('.welcome');
      if (welcome) welcome.remove();
      // Also clear upload page content
      if (State.currentPage === 'upload') {
        document.getElementById('chatArea').innerHTML = '';
      }
    }

    // Build file chips for display
    let fileChipsHtml = '';
    if (State.attachedFiles.length > 0) {
      fileChipsHtml = State.attachedFiles.map(f =>
        `<div class="file-chip" style="background: rgba(14,165,233,.15); border-color: rgba(56,189,248,.3); color: #7DD3FC;">
          <svg width="12" height="12" viewBox="0 0 24 24" stroke="currentColor" fill="none" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
          <span class="file-chip-name">${window.ui.escapeHtml(f.name)}</span>
        </div>`
      ).join('');
    }

    // RETRIEVAL: search the knowledge base for relevant chunks
    let retrievedChunks = [];
    if (State.kbReady) {
      // Build retrieval query — combine the question with attached file titles for context
      let retrievalQuery = text;
      if (State.attachedFiles.length > 0) {
        retrievalQuery += ' ' + State.attachedFiles.map(f => f.name).join(' ');
      }

      const fwFilter = (State.currentFw && State.currentFw !== 'all')
        ? [window.sources.getFramework(State.currentFw)?.kbName].filter(Boolean)
        : null;

      const result = window.retrieval.search(retrievalQuery, {
        topK: 8,
        frameworks: null, // Search all, but boost selected via prompt
        minScore: 0.05,
      });
      retrievedChunks = result.chunks || [];

      // If user has attached files, also include some chunks from those documents
      if (State.attachedFiles.length > 0) {
        for (const af of State.attachedFiles) {
          // Get top chunks from this specific document
          const docResult = window.retrieval.search(text, {
            topK: 4,
            includeBuiltIn: false,
            includeUserDocs: true,
          });
          // Filter to just this doc and merge
          const docChunks = docResult.chunks.filter(c => c.doc_id === af.docId);
          for (const c of docChunks) {
            if (!retrievedChunks.find(rc => rc.id === c.id)) {
              retrievedChunks.unshift(c); // prioritize uploaded file chunks
            }
          }
        }
      }
      // Cap to ~10 chunks for token budget
      retrievedChunks = retrievedChunks.slice(0, 10);
    }

    // Add user message to state
    State.messages.push({
      role: 'user',
      content: text,
      fileChips: fileChipsHtml,
    });
    appendUserBubble(text, fileChipsHtml);

    // Clear attached files after sending
    State.attachedFiles = [];
    renderAttached();
    scrollToBottom();

    // Show typing
    const typing = document.createElement('div');
    typing.id = 'typing';
    typing.className = 'msg-row bot';
    typing.innerHTML = `
      <div class="bubble bot">
        <div class="msg-tag">GRC Expert <span class="msg-model">analyzing your query...</span></div>
        <div class="dots"><span></span><span></span><span></span></div>
      </div>
    `;
    document.getElementById('chatArea').appendChild(typing);
    scrollToBottom();

    State.busy = true;

    // Build API payload
    const apiMessages = State.messages.map(m => ({
      role: m.role,
      content: m.content,
    }));

    // Set up abort controller with 60s timeout (gives Gemini time to respond)
    const abortController = new AbortController();
    const fetchTimeout = setTimeout(() => abortController.abort(), 120000);

    console.log('[chat] Sending request to /api/chat...');

    fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: abortController.signal,
      body: JSON.stringify({
        messages: apiMessages,
        retrievedChunks: retrievedChunks.map(c => ({
          doc_id: c.doc_id,
          title: c.title,
          framework: c.framework,
          category: c.category,
          source: c.source,
          text: c.text,
        })),
        mode: State.currentMode,
        generator: State.currentGenerator,
        fwFocus: State.currentFw === 'all' ? 'all' : window.sources.getFramework(State.currentFw)?.kbName,
      }),
    })
      .then(r => {
        clearTimeout(fetchTimeout);
        return r.json();
      })
      .then(data => {
        document.getElementById('typing')?.remove();
        State.busy = false;

        if (data.error) {
          console.error('[chat] API error:', data.error);
          showError(data.error.message || 'API error');
          return;
        }

        let txt = '';
        if (data.content) {
          for (const c of data.content) if (c.text) txt += c.text;
        }
        if (!txt) {
          showError('Empty response from AI');
          return;
        }

        console.log(`[chat] Response: ${txt.length} chars from ${data.modelUsed}`);

        const citations = retrievedChunks.length > 0 ? retrievedChunks.map(c => ({
          framework: c.framework,
          title: c.title,
          category: c.category,
        })) : [];

        State.messages.push({
          role: 'assistant',
          content: txt,
          modelUsed: data.modelUsed,
          citations,
        });

        appendBotBubble(txt, data.modelUsed, citations);
        scrollToBottom();
      })
      .catch(err => {
        clearTimeout(fetchTimeout);
        document.getElementById('typing')?.remove();
        State.busy = false;
        console.error('[chat] Fetch error:', err);
        if (err.name === 'AbortError') {
          showError('Request timed out after 2 minutes. The AI may be overloaded — please try again.');
        } else {
          showError('Request failed: ' + (err.message || err));
        }
      });
  }

  function appendUserBubble(text, fileChipsHtml) {
    const row = document.createElement('div');
    row.className = 'msg-row user';
    row.innerHTML = `
      <div style="display:flex; flex-direction:column; align-items:flex-end; max-width:90%;">
        ${fileChipsHtml ? `<div style="margin-bottom:6px; display:flex; flex-wrap:wrap; gap:4px; justify-content:flex-end;">${fileChipsHtml}</div>` : ''}
        <div class="bubble user">${window.ui.escapeHtml(text)}</div>
      </div>
    `;
    document.getElementById('chatArea').appendChild(row);
  }

  function appendBotBubble(text, modelUsed, citations) {
    const row = document.createElement('div');
    row.className = 'msg-row bot';
    const modeTag = State.currentGenerator ? `<span class="msg-mode">${State.currentGenerator}</span>` : '';
    const modelTag = ''; // model name only logged to console, not shown in UI

    let citationsHtml = '';
    if (citations && citations.length > 0) {
      const unique = [];
      const seen = new Set();
      for (const c of citations) {
        const key = `${c.framework}|${c.title}`;
        if (!seen.has(key)) {
          seen.add(key);
          unique.push(c);
        }
      }
      citationsHtml = `
        <div class="citations">
          <div class="citations-label">Sources Referenced</div>
          ${unique.slice(0, 8).map(c => `
            <span class="citation-chip" title="${window.ui.escapeHtml(c.category)}">
              <svg viewBox="0 0 24 24" stroke="currentColor" fill="none" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
              ${window.ui.escapeHtml(c.framework)} · ${window.ui.escapeHtml(c.title.substring(0, 40))}${c.title.length > 40 ? '…' : ''}
            </span>
          `).join('')}
        </div>
      `;
    }

    // Export buttons - conditional by generator type
    const showExports = text && text.length > 200;
    const hasTable = window.exporter && window.exporter.hasTable(text);
    // Excel only for tabular generators (risk registers, gap assessments, audit evidence, mappings, KPIs)
    const tabularGenerators = ['risk_register', 'audit_evidence', 'gap', 'mapping', 'mapping_doc'];
    const isTabularOutput = tabularGenerators.includes(State.currentGenerator) && hasTable;
    // Also show Excel for general chat if tables are present and generator is null
    const showExcel = isTabularOutput || (!State.currentGenerator && hasTable);

    const exportsHtml = showExports ? `
      <div class="export-bar">
        <button class="export-btn" data-action="copy" title="Copy full output">
          <svg width="13" height="13" viewBox="0 0 24 24" stroke="currentColor" fill="none" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
          Copy
        </button>
        <button class="export-btn" data-action="word" title="Export to Word document">
          <svg width="13" height="13" viewBox="0 0 24 24" stroke="currentColor" fill="none" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
          Word
        </button>
        <button class="export-btn" data-action="pdf" title="Export to PDF">
          <svg width="13" height="13" viewBox="0 0 24 24" stroke="currentColor" fill="none" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
          PDF
        </button>
        ${showExcel ? `
          <button class="export-btn" data-action="excel" title="Export tables to Excel">
            <svg width="13" height="13" viewBox="0 0 24 24" stroke="currentColor" fill="none" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="9" y1="21" x2="9" y2="9"/></svg>
            Excel
          </button>
        ` : ''}
      </div>
    ` : '';

    const bubbleId = 'msg_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7);
    row.innerHTML = `
      <div class="bubble bot" data-msg-id="${bubbleId}">
        <div class="msg-tag">GRC Expert ${modeTag} ${modelTag}</div>
        <div class="bot-content">${window.ui.renderMarkdown(text)}</div>
        ${citationsHtml}
        ${exportsHtml}
      </div>
    `;
    document.getElementById('chatArea').appendChild(row);

    // Wire export buttons
    if (showExports) {
      const bubble = row.querySelector('.bubble');
      bubble._rawMarkdown = text; // store for export
      bubble.querySelectorAll('[data-action]').forEach(btn => {
        btn.addEventListener('click', () => handleExport(btn.dataset.action, text));
      });
    }
  }

  // ============ EXPORT HANDLER ============
  async function handleExport(action, markdown) {
    try {
      if (!window.exporter) {
        window.ui.toast('Export module not loaded', 'error');
        return;
      }

      // Infer title from first heading
      const title = window.exporter.inferTitle(markdown) || `GRC-${State.currentGenerator || 'Output'}-${new Date().toISOString().substring(0, 10)}`;

      if (action === 'copy') {
        const ok = await window.exporter.copyText(markdown);
        if (ok) window.ui.toast('Copied to clipboard', 'success');
        else window.ui.toast('Copy failed', 'error');
      } else if (action === 'word') {
        window.ui.toast('Generating Word document...', 'info', 2000);
        const filename = await window.exporter.exportWord(markdown, title);
        window.ui.toast(`Downloaded: ${filename}`, 'success');
      } else if (action === 'pdf') {
        window.ui.toast('Generating PDF...', 'info', 2000);
        const filename = await window.exporter.exportPdf(markdown, title);
        window.ui.toast(`Downloaded: ${filename}`, 'success');
      } else if (action === 'excel') {
        window.ui.toast('Generating Excel...', 'info', 2000);
        const filename = await window.exporter.exportExcel(markdown, title);
        window.ui.toast(`Downloaded: ${filename}`, 'success');
      }
    } catch (err) {
      console.error('[export]', action, err);
      window.ui.toast('Export failed: ' + err.message, 'error', 5000);
    }
  }

  function showError(msg) {
    const div = document.createElement('div');
    div.className = 'err-bar';
    div.textContent = msg;
    document.getElementById('chatArea').appendChild(div);
    scrollToBottom();
    setTimeout(() => div.remove(), 12000);
  }

  function scrollToBottom() {
    const a = document.getElementById('chatArea');
    a.scrollTop = a.scrollHeight;
  }

  // ============ INPUT ============
  function autoGrow(el) {
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 140) + 'px';
  }

  function toggleSendButton() {
    const btn = document.getElementById('sendBtn');
    const ta = document.getElementById('ta');
    const hasContent = ta.value.trim() || State.attachedFiles.length > 0;
    if (hasContent) btn.classList.add('on');
    else btn.classList.remove('on');
  }

  // ============ THEME ============
  async function toggleTheme() {
    State.theme = State.theme === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', State.theme);
    const t = document.querySelector('.theme-toggle-text');
    if (t) t.textContent = State.theme === 'dark' ? 'Dark' : 'Light';
    await window.storage.savePreference('theme', State.theme);
  }

  // ============ NEW CHAT ============
  function newChat() {
    State.messages = [];
    State.attachedFiles = [];
    renderAttached();
    renderPage();
  }

  // ============ EVENT LISTENERS ============
  function setupEventListeners() {
    document.getElementById('hamburger').addEventListener('click', openSidebar);
    document.getElementById('overlay').addEventListener('click', closeSidebar);
    document.getElementById('newChatBtn').addEventListener('click', newChat);
    document.getElementById('themeToggle').addEventListener('click', toggleTheme);

    const ta = document.getElementById('ta');
    ta.addEventListener('input', () => { autoGrow(ta); toggleSendButton(); });
    ta.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
      }
    });

    document.getElementById('sendBtn').addEventListener('click', () => sendMessage());

    document.getElementById('uploadBtn').addEventListener('click', () => {
      document.getElementById('fileInput').click();
    });
    document.getElementById('fileInput').addEventListener('change', (e) => {
      const file = e.target.files[0];
      e.target.value = '';
      if (file) handleFileUpload(file);
    });
  }

  // Boot
  document.addEventListener('DOMContentLoaded', init);
})(window);
