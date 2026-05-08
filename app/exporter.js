/**
 * GRC Expert — Export Module v5.0
 *
 * FIX: "Invalid arguments passed to jsPDF.text"
 *   - Added safeText() wrapper that sanitizes EVERY doc.text() call
 *   - Added safeSplit() wrapper for splitTextToSize
 *   - Fixed parser that could produce undefined .text properties
 *   - All strip() calls produce guaranteed strings
 */

(function (window) {
  'use strict';

  // ============ SAFE STRING HELPERS ============

  /** Guarantee a string. Never returns null/undefined/NaN/object. */
  function str(v) {
    if (v === null || v === undefined) return '';
    if (typeof v === 'string') return v;
    if (typeof v === 'number') return isNaN(v) ? '' : String(v);
    if (Array.isArray(v)) return v.map(str).join(' ');
    return String(v);
  }

  /** Strip markdown inline formatting → plain text string. */
  function strip(text) {
    var s = str(text);
    return s
      .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '$1')
      .replace(/\*\*([^*]+)\*\*/g, '$1')
      .replace(/\*([^*]+)\*/g, '$1')
      .replace(/`([^`]+)`/g, '$1');
  }

  function normalizeMarkdownTables(text) {
    var lines = str(text).split('\n');
    var out = [];
    function isTableLine(line) { return /^\s*\|.*\|\s*$/.test(str(line)); }
    function isSeparator(line) { return /^\s*\|[\s\-:|]+\|\s*$/.test(str(line)); }
    for (var i = 0; i < lines.length; i++) {
      var line = lines[i];
      if (isSeparator(line) && out.length > 0 && isTableLine(out[out.length - 1])) {
        var count = Math.max(out[out.length - 1].split('|').slice(1, -1).length, 1);
        out.push('|' + Array(count).fill('---').join('|') + '|');
      } else if (!isTableLine(line) && /^\s*[-_]{20,}\s*$/.test(line)) {
        out.push('---');
      } else {
        out.push(line);
      }
    }
    return out.join('\n');
  }

  /** Safe wrapper for doc.text — validates all arguments. */
  function safeText(doc, text, x, y, opts) {
    var content = str(text);
    if (!content) return; // skip empty
    var safeX = (typeof x === 'number' && isFinite(x)) ? x : 40;
    var safeY = (typeof y === 'number' && isFinite(y)) ? y : 40;
    try {
      if (opts) {
        doc.text(content, safeX, safeY, opts);
      } else {
        doc.text(content, safeX, safeY);
      }
    } catch (e) {
      console.warn('[export] safeText caught:', e.message, '| text:', content.substring(0, 50), '| x:', safeX, '| y:', safeY);
    }
  }

  /** Safe wrapper for splitTextToSize — always returns string array. */
  function safeSplit(doc, text, maxWidth) {
    var content = str(text);
    if (!content) return [];
    var w = (typeof maxWidth === 'number' && isFinite(maxWidth) && maxWidth > 0) ? maxWidth : 400;
    try {
      var result = doc.splitTextToSize(content, w);
      if (!Array.isArray(result)) return [content];
      return result.map(str); // ensure each line is a string
    } catch (e) {
      console.warn('[export] safeSplit caught:', e.message);
      return [content];
    }
  }

  function safeName(name) {
    return str(name || 'GRC-Document').replace(/[^\w\s-]/g, '').replace(/\s+/g, '-').substring(0, 80) || 'GRC-Document';
  }

  function download(blob, filename) {
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 3000);
  }

  function hasTable(md) {
    if (!md) return false;
    var lines = normalizeMarkdownTables(md).split('\n');
    for (var i = 0; i < lines.length - 1; i++) {
      if (lines[i].trim().startsWith('|') && /^\s*\|[\s\-|:]+\|\s*$/.test(lines[i + 1])) return true;
    }
    return false;
  }

  function inferTitle(md) {
    if (!md) return null;
    var m = str(md).match(/^#+\s+(.+)$/m);
    return m ? strip(m[1]) : null;
  }

  // ============ BLOCK PARSER (robust) ============

  function parse(md) {
    var lines = normalizeMarkdownTables(md).split('\n');
    var blocks = [];
    var i = 0;

    while (i < lines.length) {
      var raw = lines[i];
      var t = str(raw).trim();
      if (!t) { i++; continue; }

      // Headings
      var hMatch = t.match(/^(#{1,4})\s+(.+)$/);
      if (hMatch) {
        blocks.push({ type: 'h' + hMatch[1].length, text: str(hMatch[2]) });
        i++; continue;
      }

      // HR
      if (/^[-*_]{3,}$/.test(t)) {
        blocks.push({ type: 'hr' });
        i++; continue;
      }

      // Table
      if (t.startsWith('|') && i + 1 < lines.length && /^\s*\|[\s\-|:]+\|\s*$/.test(str(lines[i + 1]))) {
        var hdr = t.split('|').slice(1, -1).map(function (c) { return str(c).trim(); });
        i += 2;
        var rows = [];
        while (i < lines.length && str(lines[i]).trim().startsWith('|')) {
          rows.push(str(lines[i]).split('|').slice(1, -1).map(function (c) { return str(c).trim(); }));
          i++;
        }
        blocks.push({ type: 'table', headers: hdr, rows: rows });
        continue;
      }

      // Code block
      if (t.startsWith('```')) {
        i++;
        var code = [];
        while (i < lines.length && !str(lines[i]).trim().startsWith('```')) {
          code.push(str(lines[i]));
          i++;
        }
        if (i < lines.length) i++; // skip closing ```
        blocks.push({ type: 'code', text: code.join('\n') });
        continue;
      }

      // Blockquote
      if (t.startsWith('>')) {
        var q = [];
        while (i < lines.length && str(lines[i]).trim().startsWith('>')) {
          q.push(str(lines[i]).trim().replace(/^>\s?/, ''));
          i++;
        }
        blocks.push({ type: 'quote', text: q.join(' ') });
        continue;
      }

      // Unordered list
      if (/^[-*+]\s+/.test(t)) {
        var ul = [];
        while (i < lines.length && /^\s*[-*+]\s+/.test(str(lines[i]))) {
          ul.push(str(lines[i]).replace(/^\s*[-*+]\s+/, ''));
          i++;
        }
        blocks.push({ type: 'ul', items: ul });
        continue;
      }

      // Ordered list
      if (/^\d+\.\s+/.test(t)) {
        var ol = [];
        while (i < lines.length && /^\s*\d+\.\s+/.test(str(lines[i]))) {
          ol.push(str(lines[i]).replace(/^\s*\d+\.\s+/, ''));
          i++;
        }
        blocks.push({ type: 'ol', items: ol });
        continue;
      }

      // Paragraph — collect lines until empty or block start
      var p = [t];
      i++;
      while (i < lines.length) {
        var nextLine = str(lines[i]).trim();
        if (!nextLine) break; // empty line ends paragraph
        if (/^#{1,4}\s/.test(nextLine)) break; // heading
        if (nextLine.startsWith('|')) break;    // table
        if (nextLine.startsWith('```')) break;  // code
        if (nextLine.startsWith('>')) break;    // quote
        if (/^[-*+]\s+/.test(nextLine)) break;  // ul
        if (/^\d+\.\s+/.test(nextLine)) break;  // ol
        if (/^[-*_]{3,}$/.test(nextLine)) break; // hr
        p.push(nextLine);
        i++;
      }
      blocks.push({ type: 'p', text: p.join(' ') });
    }

    return blocks;
  }

  // ============ COPY ============

  async function copyText(text) {
    console.log('[export] Copy');
    try {
      await navigator.clipboard.writeText(normalizeMarkdownTables(text));
      return true;
    } catch (e) {
      var ta = document.createElement('textarea');
      ta.value = normalizeMarkdownTables(text);
      ta.style.cssText = 'position:fixed;opacity:0;left:-9999px';
      document.body.appendChild(ta); ta.select();
      var ok = false;
      try { ok = document.execCommand('copy'); } catch (_) {}
      document.body.removeChild(ta);
      return ok;
    }
  }

  // ============ WORD (.docx) ============

  async function exportWord(markdown, title) {
    console.log('[export] Word start');

    if (!window.docx) {
      throw new Error('Word library not loaded. Please refresh the page.');
    }
    var D = window.docx;
    if (!D.Document || !D.Packer || !D.Paragraph || !D.TextRun) {
      throw new Error('Word library incomplete. Please refresh the page.');
    }

    var blocks = parse(markdown);
    var children = [];

    if (title) {
      children.push(new D.Paragraph({
        children: [new D.TextRun({ text: strip(title), bold: true, size: 36, color: '0EA5E9' })],
        heading: D.HeadingLevel.TITLE,
        spacing: { after: 300 },
      }));
    }

    var HL = { h1: D.HeadingLevel.HEADING_1, h2: D.HeadingLevel.HEADING_2, h3: D.HeadingLevel.HEADING_3, h4: D.HeadingLevel.HEADING_4 };
    var SZ = { h1: 32, h2: 28, h3: 24, h4: 22 };

    for (var bi = 0; bi < blocks.length; bi++) {
      var b = blocks[bi];

      if (HL[b.type]) {
        children.push(new D.Paragraph({
          children: [new D.TextRun({ text: strip(b.text), bold: true, size: SZ[b.type] })],
          heading: HL[b.type],
          spacing: { before: 240, after: 120 },
        }));
      } else if (b.type === 'p') {
        children.push(new D.Paragraph({
          children: [new D.TextRun({ text: strip(b.text), size: 22 })],
          spacing: { after: 120 },
        }));
      } else if (b.type === 'ul') {
        for (var u = 0; u < b.items.length; u++) {
          children.push(new D.Paragraph({
            children: [new D.TextRun({ text: strip(b.items[u]), size: 22 })],
            bullet: { level: 0 },
            spacing: { after: 60 },
          }));
        }
      } else if (b.type === 'ol') {
        for (var o = 0; o < b.items.length; o++) {
          children.push(new D.Paragraph({
            children: [new D.TextRun({ text: (o + 1) + '. ' + strip(b.items[o]), size: 22 })],
            spacing: { after: 60 },
          }));
        }
      } else if (b.type === 'table') {
        try {
          var bd = { style: D.BorderStyle.SINGLE, size: 3, color: 'AAAAAA' };
          var borders = { top: bd, bottom: bd, left: bd, right: bd };
          var tRows = [];
          tRows.push(new D.TableRow({
            tableHeader: true,
            children: b.headers.map(function (h) {
              return new D.TableCell({
                children: [new D.Paragraph({ children: [new D.TextRun({ text: strip(h), bold: true, size: 18, color: 'FFFFFF' })] })],
                shading: { fill: '0EA5E9' }, borders: borders,
              });
            }),
          }));
          for (var ri = 0; ri < b.rows.length; ri++) {
            var r = b.rows[ri];
            tRows.push(new D.TableRow({
              children: b.headers.map(function (_, ci) {
                return new D.TableCell({
                  children: [new D.Paragraph({ children: [new D.TextRun({ text: strip(r[ci]), size: 18 })] })],
                  borders: borders,
                });
              }),
            }));
          }
          children.push(new D.Table({ rows: tRows, width: { size: 100, type: D.WidthType.PERCENTAGE } }));
          children.push(new D.Paragraph({ children: [], spacing: { after: 200 } }));
        } catch (te) {
          console.warn('[export] Word table fallback:', te.message);
          children.push(new D.Paragraph({ children: [new D.TextRun({ text: b.headers.map(strip).join(' | '), bold: true, size: 20 })], spacing: { after: 60 } }));
          for (var tr2 = 0; tr2 < b.rows.length; tr2++) {
            children.push(new D.Paragraph({ children: [new D.TextRun({ text: b.rows[tr2].map(strip).join(' | '), size: 18 })], spacing: { after: 40 } }));
          }
        }
      } else if (b.type === 'code') {
        children.push(new D.Paragraph({ children: [new D.TextRun({ text: str(b.text), font: 'Consolas', size: 18 })], spacing: { after: 120 } }));
      } else if (b.type === 'quote') {
        children.push(new D.Paragraph({ children: [new D.TextRun({ text: strip(b.text), italics: true, size: 22 })], indent: { left: 400 }, spacing: { after: 120 } }));
      }
      // hr and unknown types silently skipped
    }

    children.push(new D.Paragraph({
      children: [new D.TextRun({ text: 'Generated by GRC Expert', size: 16, color: '999999', italics: true })],
      spacing: { before: 400 },
    }));

    console.log('[export] Word: ' + children.length + ' elements');
    var doc = new D.Document({
      creator: 'GRC Expert', title: str(title) || 'GRC Document',
      sections: [{ properties: {}, children: children }],
    });
    var blob = await D.Packer.toBlob(doc);
    var fn = safeName(title) + '.docx';
    download(blob, fn);
    console.log('[export] Word done: ' + fn);
    return fn;
  }

  // ============ PDF ============

  async function exportPdf(markdown, title) {
    console.log('[export] PDF start — universal safe renderer v12');

    if (!window.jspdf || !window.jspdf.jsPDF) {
      throw new Error('PDF library not loaded. Please refresh the page.');
    }

    var doc = new window.jspdf.jsPDF({ unit: 'pt', format: 'a4' });
    var pw = Number(doc.internal.pageSize.width) || 595.28;
    var ph = Number(doc.internal.pageSize.height) || 841.89;
    var mg = 42;
    var y = mg;
    var contentWidth = pw - (mg * 2);

    function pdfString(value) {
      var s = strip(str(value));
      s = s.replace(/\r/g, '\n');
      s = s.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, ' ');
      s = s.replace(/[\u2028\u2029]/g, ' ');
      s = s.replace(/[-_]{20,}/g, '---');
      s = s.replace(/\s+/g, ' ').trim();
      // Break long unbroken strings such as URLs, hashes, or markdown separators.
      s = s.replace(/([^\s]{60})(?=[^\s])/g, '$1 ');
      // jsPDF can fail on some unsupported surrogate pairs/emojis. Remove only those.
      s = s.replace(/[\uD800-\uDFFF]/g, '');
      return s;
    }

    function ensurePage(extraHeight) {
      var h = Number(extraHeight);
      if (!isFinite(h) || h < 1) h = 14;
      if (!isFinite(y) || y < mg) y = mg;
      if (y + h > ph - mg) {
        doc.addPage();
        y = mg;
      }
    }

    function safeTextLine(text, x, yy) {
      var s = pdfString(text);
      var xx = Number(x);
      var yyy = Number(yy);
      if (!s || !isFinite(xx) || !isFinite(yyy)) return;
      try {
        // Always use the simplest jsPDF.text signature. Never pass arrays/options here.
        doc.text(String(s), xx, yyy);
      } catch (e1) {
        try {
          // Last-resort fallback for characters that jsPDF cannot encode.
          doc.text(String(s).replace(/[^\x20-\x7E]/g, ' '), xx, yyy);
        } catch (e2) {
          console.warn('[export] skipped unsafe PDF text:', e1.message, String(s).slice(0, 80));
        }
      }
    }

    function splitLines(text, width) {
      var s = pdfString(text);
      if (!s) return [];
      var safeWidth = Math.max(80, Number(width) || contentWidth);
      try {
        var out = doc.splitTextToSize(s, safeWidth);
        if (Array.isArray(out)) return out.map(pdfString).filter(Boolean);
        return [pdfString(out)];
      } catch (_) {
        var chunks = [];
        for (var i = 0; i < s.length; i += 95) chunks.push(s.slice(i, i + 95));
        return chunks;
      }
    }

    function write(text, opts) {
      opts = opts || {};
      var x = isFinite(Number(opts.x)) ? Number(opts.x) : mg;
      var font = opts.font || 'normal';
      var size = Number(opts.size) || 10;
      var lineHeight = Number(opts.lineHeight) || Math.max(12, size + 3);
      var width = Number(opts.width) || (pw - x - mg);
      var color = opts.color || [0, 0, 0];

      doc.setFont('helvetica', font);
      doc.setFontSize(size);
      try { doc.setTextColor(color[0], color[1], color[2]); } catch (_) { doc.setTextColor(0,0,0); }

      var lines = splitLines(text, width);
      for (var i = 0; i < lines.length; i++) {
        ensurePage(lineHeight + 2);
        safeTextLine(lines[i], x, y);
        y += lineHeight;
      }
    }

    function rule() {
      ensurePage(12);
      try {
        doc.setDrawColor(220, 230, 240);
        doc.line(mg, y, pw - mg, y);
      } catch (_) {}
      y += 12;
    }

    function keyValue(label, value) {
      var v = pdfString(value);
      if (!v) return;
      var startY = y;
      write(label + ':', { x: mg, width: 115, size: 8.8, font: 'bold', lineHeight: 11 });
      y = startY;
      write(v, { x: mg + 120, width: pw - (mg + 120) - mg, size: 8.8, font: 'normal', lineHeight: 11 });
      y += 2;
    }

    function tableAsCards(tbl) {
      var headers = (tbl.headers || []).map(pdfString);
      var rows = tbl.rows || [];
      if (!headers.length) return;

      for (var r = 0; r < rows.length; r++) {
        ensurePage(55);
        try {
          doc.setFillColor(248, 250, 252);
          doc.setDrawColor(225, 232, 240);
          doc.roundedRect(mg, y, contentWidth, 20, 4, 4, 'FD');
        } catch (_) {}
        write('Row ' + (r + 1), { x: mg + 8, width: contentWidth - 16, size: 9.5, font: 'bold', lineHeight: 12 });
        y += 2;

        for (var c = 0; c < headers.length; c++) {
          var cell = pdfString(rows[r] && rows[r][c]);
          if (!cell) continue;
          if (cell.length > 420) cell = cell.slice(0, 417) + '...';
          keyValue(headers[c] || ('Column ' + (c + 1)), cell);
        }
        y += 7;
      }
    }

    try {
      var safeTitle = title || inferTitle(markdown) || 'GRC Expert Output';
      write(safeTitle, { size: 19, font: 'bold', lineHeight: 23, color: [14, 165, 233] });
      y += 6;
      rule();

      var blocks = parse(normalizeMarkdownTables(markdown));
      for (var bi = 0; bi < blocks.length; bi++) {
        var b = blocks[bi] || {};
        if (b.type === 'h1') {
          y += 5; write(b.text, { size: 16, font: 'bold', lineHeight: 20, color: [14, 165, 233] }); y += 2;
        } else if (b.type === 'h2') {
          y += 5; write(b.text, { size: 14, font: 'bold', lineHeight: 18, color: [14, 165, 233] }); y += 2;
        } else if (b.type === 'h3' || b.type === 'h4') {
          y += 4; write(b.text, { size: 12, font: 'bold', lineHeight: 16 }); y += 2;
        } else if (b.type === 'p') {
          write(b.text, { size: 10, lineHeight: 14 }); y += 3;
        } else if (b.type === 'ul' || b.type === 'ol') {
          var items = b.items || [];
          for (var ii = 0; ii < items.length; ii++) {
            var prefix = b.type === 'ol' ? (ii + 1) + '. ' : '- ';
            write(prefix + items[ii], { x: mg + 10, width: contentWidth - 10, size: 9.8, lineHeight: 13 });
          }
          y += 3;
        } else if (b.type === 'table') {
          tableAsCards(b); y += 4;
        } else if (b.type === 'code') {
          write(b.text, { size: 8.5, font: 'normal', lineHeight: 11 }); y += 4;
        } else if (b.type === 'quote') {
          write(b.text, { x: mg + 14, width: contentWidth - 14, size: 9.5, font: 'italic', lineHeight: 13 }); y += 3;
        }
      }

      var totalPages = doc.internal.getNumberOfPages();
      for (var p = 1; p <= totalPages; p++) {
        doc.setPage(p);
        safeTextLine('GRC Expert can make mistakes. Verify important compliance and security decisions. Page ' + p + '/' + totalPages, mg, ph - 20);
      }

      var fn = safeName(safeTitle) + '.pdf';
      try { doc.save(fn); }
      catch (saveErr) { download(doc.output('blob'), fn); }
      console.log('[export] PDF done: ' + fn);
      return fn;
    } catch (err) {
      console.error('[export] universal PDF renderer failed:', err);
      throw new Error('PDF export failed: ' + (err && err.message ? err.message : 'Unknown PDF error'));
    }
  }

  // ============ EXCEL (.xlsx) ============

  async function exportExcel(markdown, title) {
    console.log('[export] Excel start');

    if (!window.XLSX || !window.XLSX.utils || !window.XLSX.writeFile) {
      throw new Error('Excel library not loaded. Please refresh the page.');
    }

    var blocks = parse(markdown);
    var tables = blocks.filter(function (b) { return b.type === 'table'; });
    if (tables.length === 0) throw new Error('No tables found in the response.');

    console.log('[export] Excel: ' + tables.length + ' table(s)');

    var wb = window.XLSX.utils.book_new();

    for (var ti = 0; ti < tables.length; ti++) {
      var tbl = tables[ti];
      var data = [tbl.headers.map(strip)];
      for (var ri = 0; ri < tbl.rows.length; ri++) {
        var row = [];
        for (var ci = 0; ci < tbl.headers.length; ci++) {
          row.push(strip(tbl.rows[ri][ci]));
        }
        data.push(row);
      }
      var ws = window.XLSX.utils.aoa_to_sheet(data);

      ws['!cols'] = tbl.headers.map(function (h, idx) {
        var mx = strip(h).length;
        for (var r = 0; r < tbl.rows.length; r++) {
          var v = strip(tbl.rows[r][idx]).length;
          if (v > mx) mx = v;
        }
        return { wch: Math.min(Math.max(mx + 2, 10), 50) };
      });

      var sn = 'Table ' + (ti + 1);
      var lastH = null;
      for (var bj = 0; bj < blocks.length; bj++) {
        if (blocks[bj] === tbl) break;
        if (blocks[bj].type && blocks[bj].type.charAt(0) === 'h') lastH = blocks[bj].text;
      }
      if (lastH) sn = strip(lastH).substring(0, 28).replace(/[\\\/\*\?:\[\]]/g, '') || sn;

      window.XLSX.utils.book_append_sheet(wb, ws, sn);
      console.log('[export] Sheet "' + sn + '": ' + tbl.rows.length + ' rows');
    }

    var fn = safeName(title || 'GRC-Tables') + '.xlsx';
    window.XLSX.writeFile(wb, fn);
    console.log('[export] Excel done: ' + fn);
    return fn;
  }

  // ============ PUBLIC ============

  window.exporter = {
    copyText: copyText,
    exportWord: exportWord,
    exportPdf: exportPdf,
    exportExcel: exportExcel,
    hasTable: hasTable,
    inferTitle: inferTitle,
  };

  console.log('[export] Module loaded');
})(window);
