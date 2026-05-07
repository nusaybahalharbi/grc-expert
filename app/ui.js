/**
 * UI Helpers — Markdown rendering, escaping, formatting
 */

(function (window) {
  'use strict';

  function escapeHtml(s) {
    if (s === null || s === undefined) return '';
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function renderMarkdown(text) {
    if (!text) return '';
    let html = String(text);

    // Code blocks first (preserve content)
    const codeBlocks = [];
    html = html.replace(/```(\w*)\n?([\s\S]*?)```/g, (m, lang, code) => {
      const idx = codeBlocks.length;
      codeBlocks.push({ lang, code: code.trim() });
      return `\u0000CODEBLOCK${idx}\u0000`;
    });

    // Inline code
    const inlineCodes = [];
    html = html.replace(/`([^`\n]+)`/g, (m, code) => {
      const idx = inlineCodes.length;
      inlineCodes.push(code);
      return `\u0000INLINECODE${idx}\u0000`;
    });

    // Now escape
    html = escapeHtml(html);

    // Restore code blocks
    html = html.replace(/\u0000CODEBLOCK(\d+)\u0000/g, (m, i) => {
      const cb = codeBlocks[parseInt(i)];
      return `<pre><code>${escapeHtml(cb.code)}</code></pre>`;
    });
    html = html.replace(/\u0000INLINECODE(\d+)\u0000/g, (m, i) => {
      return `<code>${escapeHtml(inlineCodes[parseInt(i)])}</code>`;
    });

    // Tables
    html = renderTables(html);

    // Headers
    html = html.replace(/^####\s+(.+)$/gm, '<h4>$1</h4>');
    html = html.replace(/^###\s+(.+)$/gm, '<h3>$1</h3>');
    html = html.replace(/^##\s+(.+)$/gm, '<h2>$1</h2>');
    html = html.replace(/^#\s+(.+)$/gm, '<h1>$1</h1>');

    // Bold and italic
    html = html.replace(/\*\*\*([\s\S]+?)\*\*\*/g, '<strong><em>$1</em></strong>');
    html = html.replace(/\*\*([\s\S]+?)\*\*/g, '<strong>$1</strong>');
    html = html.replace(/(?:^|[^\*])\*([^\*\n]+)\*(?!\*)/g, (m) => {
      return m.replace(/\*([^\*]+)\*/, '<em>$1</em>');
    });

    // Links
    html = html.replace(/\[([^\]]+)\]\(([^\)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');

    // Auto-link plain URLs
    html = html.replace(/(^|[^"=>])(https?:\/\/[^\s<>"]+)/g, '$1<a href="$2" target="_blank" rel="noopener">$2</a>');

    // Blockquotes
    html = html.replace(/^&gt;\s+(.+)$/gm, '<blockquote>$1</blockquote>');

    // Lists
    html = renderLists(html);

    // Paragraphs
    const blocks = html.split(/\n{2,}/);
    const out = blocks.map(block => {
      const trimmed = block.trim();
      if (!trimmed) return '';
      if (/^<(h[1-6]|ul|ol|table|pre|blockquote|div)/i.test(trimmed)) return trimmed;
      return `<p>${trimmed.replace(/\n/g, '<br>')}</p>`;
    });

    return out.join('\n');
  }

  function renderTables(html) {
    const lines = html.split('\n');
    const out = [];
    let i = 0;
    while (i < lines.length) {
      const line = lines[i];
      if (line.trim().startsWith('|') && i + 1 < lines.length && /^\s*\|[\s\-|:]+\|\s*$/.test(lines[i + 1])) {
        const headers = line.split('|').slice(1, -1).map(c => c.trim());
        i += 2;
        const rows = [];
        while (i < lines.length && lines[i].trim().startsWith('|')) {
          const cells = lines[i].split('|').slice(1, -1).map(c => c.trim());
          rows.push(cells);
          i++;
        }
        let tbl = '<div class="table-wrap"><table><thead><tr>';
        for (const h of headers) tbl += '<th>' + h + '</th>';
        tbl += '</tr></thead><tbody>';
        for (const row of rows) {
          tbl += '<tr>';
          for (let j = 0; j < headers.length; j++) {
            tbl += '<td>' + (row[j] || '') + '</td>';
          }
          tbl += '</tr>';
        }
        tbl += '</tbody></table></div>';
        out.push(tbl);
      } else {
        out.push(line);
        i++;
      }
    }
    return out.join('\n');
  }

  function renderLists(html) {
    const lines = html.split('\n');
    const out = [];
    let inUl = false, inOl = false;
    for (const line of lines) {
      const ulMatch = line.match(/^(\s*)[-*+]\s+(.+)$/);
      const olMatch = line.match(/^(\s*)\d+\.\s+(.+)$/);
      if (ulMatch) {
        if (!inUl) { if (inOl) { out.push('</ol>'); inOl = false; } out.push('<ul>'); inUl = true; }
        out.push('<li>' + ulMatch[2] + '</li>');
      } else if (olMatch) {
        if (!inOl) { if (inUl) { out.push('</ul>'); inUl = false; } out.push('<ol>'); inOl = true; }
        out.push('<li>' + olMatch[2] + '</li>');
      } else {
        if (inUl) { out.push('</ul>'); inUl = false; }
        if (inOl) { out.push('</ol>'); inOl = false; }
        out.push(line);
      }
    }
    if (inUl) out.push('</ul>');
    if (inOl) out.push('</ol>');
    return out.join('\n');
  }

  function formatSize(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  }

  function formatDate(timestamp) {
    const d = new Date(timestamp);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  }

  // Toast notifications
  function toast(message, type = 'info', duration = 3000) {
    const t = document.createElement('div');
    t.className = `toast toast-${type}`;
    t.textContent = message;
    document.body.appendChild(t);
    requestAnimationFrame(() => t.classList.add('show'));
    setTimeout(() => {
      t.classList.remove('show');
      setTimeout(() => t.remove(), 300);
    }, duration);
  }

  window.ui = {
    escapeHtml,
    renderMarkdown,
    formatSize,
    formatDate,
    toast,
  };
})(window);
