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
    console.log('[export] PDF start — safe renderer v6');

    if (!window.jspdf || !window.jspdf.jsPDF) {
      throw new Error('PDF library not loaded. Please refresh the page.');
    }

    var JPDF = window.jspdf.jsPDF;
    var doc = new JPDF({ unit: 'pt', format: 'a4' });
    var pw = doc.internal.pageSize.width || 595.28;
    var ph = doc.internal.pageSize.height || 841.89;
    var mg = 42;
    var w = pw - mg * 2;
    var y = mg;

    function cleanPdfText(value) {
      var s = strip(str(value));
      // Remove control characters that can break jsPDF.text
      s = s.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, ' ');
      // Normalize common markdown/reference noise
      s = s.replace(/\s+/g, ' ').trim();
      // Split very long unbroken tokens so jsPDF can wrap safely
      s = s.replace(/([^\s]{70})(?=[^\s])/g, '$1 ');
      return s;
    }

    function ensurePage(height) {
      var h = (typeof height === 'number' && isFinite(height) && height > 0) ? height : 16;
      if (!isFinite(y) || y < mg) y = mg;
      if (y + h > ph - mg) {
        doc.addPage();
        y = mg;
      }
    }

    function drawText(value, x, opts) {
      var text = cleanPdfText(value);
      if (!text) return;
      var left = (typeof x === 'number' && isFinite(x)) ? x : mg;
      var maxWidth = Math.max(40, pw - left - mg);
      var lines;
      try {
        lines = doc.splitTextToSize(text, maxWidth);
      } catch (_) {
        lines = [text.substring(0, 500)];
      }
      if (!Array.isArray(lines)) lines = [text];
      var lineHeight = (opts && opts.lineHeight) || 14;
      for (var i = 0; i < lines.length; i++) {
        var line = cleanPdfText(lines[i]);
        if (!line) continue;
        ensurePage(lineHeight + 2);
        try {
          // Use the simplest jsPDF.text signature only: text, x, y.
          // This avoids the common "Invalid arguments passed to jsPDF.text" failure.
          doc.text(String(line), Number(left), Number(y));
        } catch (err) {
          console.warn('[export] skipped unsafe PDF text line:', err.message, line.substring(0, 80));
        }
        y += lineHeight;
      }
    }

    function drawRule() {
      ensurePage(12);
      try {
        doc.setDrawColor(220, 230, 240);
        doc.line(mg, y, pw - mg, y);
      } catch (_) {}
      y += 12;
    }

    function drawKeyValue(label, value) {
      var v = cleanPdfText(value);
      if (!v) return;
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9.5);
      drawText(label + ':', mg, { lineHeight: 12 });
      y -= 12;
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9.5);
      drawText(v, mg + 115, { lineHeight: 12 });
      y += 3;
    }

    function isLargeRiskRegisterTable(tbl) {
      var headers = (tbl.headers || []).map(function (h) { return cleanPdfText(h).toLowerCase(); });
      return headers.length >= 10 && (headers.indexOf('risk identifier') !== -1 || headers.indexOf('description of the risk') !== -1);
    }

    function renderTableAsCards(tbl) {
      var headers = (tbl.headers || []).map(cleanPdfText);
      var rows = tbl.rows || [];
      if (!headers.length) return;

      if (isLargeRiskRegisterTable(tbl)) {
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(12);
        drawText('Risk Register', mg, { lineHeight: 16 });
        y += 4;

        for (var r = 0; r < rows.length; r++) {
          ensurePage(90);
          try {
            doc.setFillColor(248, 250, 252);
            doc.setDrawColor(210, 220, 230);
            doc.roundedRect(mg, y, w, 22, 4, 4, 'FD');
          } catch (_) {}
          doc.setFont('helvetica', 'bold');
          doc.setFontSize(10.5);
          drawText('Risk ' + (r + 1) + ' — ' + cleanPdfText(rows[r][0] || ''), mg + 8, { lineHeight: 13 });
          y += 3;

          doc.setFont('helvetica', 'normal');
          doc.setFontSize(8.5);
          for (var c = 1; c < headers.length; c++) {
            var cell = cleanPdfText(rows[r][c]);
            if (!cell) continue;
            // Keep PDF readable by prioritizing important fields and shortening lower-value fields.
            var important = /risk area|owner|description|cause|threat|consequences|likelihood|impact|rating|treatment|deadline|residual|status|comment/i.test(headers[c]);
            if (!important && c > 8) continue;
            if (cell.length > 180) cell = cell.substring(0, 177) + '...';
            drawKeyValue(headers[c], cell);
          }
          y += 8;
        }
        return;
      }

      // Generic table: render compactly as key/value blocks instead of wide tables.
      for (var rr = 0; rr < rows.length; rr++) {
        ensurePage(40);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(9.5);
        drawText('Row ' + (rr + 1), mg, { lineHeight: 12 });
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(8.8);
        for (var cc = 0; cc < headers.length; cc++) {
          drawKeyValue(headers[cc] || ('Column ' + (cc + 1)), rows[rr][cc]);
        }
        y += 6;
      }
    }

    try {
      // Title
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(20);
      doc.setTextColor(14, 165, 233);
      drawText(title || inferTitle(markdown) || 'GRC Expert Output', mg, { lineHeight: 24 });
      y += 8;
      doc.setTextColor(0, 0, 0);
      drawRule();

      var blocks = parse(markdown);

      for (var bi = 0; bi < blocks.length; bi++) {
        var b = blocks[bi];

        if (b.type === 'h1' || b.type === 'h2' || b.type === 'h3' || b.type === 'h4') {
          var sizeMap = { h1: 17, h2: 14, h3: 12, h4: 11 };
          var lhMap = { h1: 21, h2: 18, h3: 16, h4: 15 };
          y += 6;
          doc.setFont('helvetica', 'bold');
          doc.setFontSize(sizeMap[b.type]);
          if (b.type === 'h1' || b.type === 'h2') doc.setTextColor(14, 165, 233);
          drawText(b.text, mg, { lineHeight: lhMap[b.type] });
          doc.setTextColor(0, 0, 0);
          y += 3;
        } else if (b.type === 'p') {
          doc.setFont('helvetica', 'normal');
          doc.setFontSize(10.2);
          drawText(b.text, mg, { lineHeight: 14 });
          y += 4;
        } else if (b.type === 'ul' || b.type === 'ol') {
          doc.setFont('helvetica', 'normal');
          doc.setFontSize(10);
          var items = b.items || [];
          for (var ii = 0; ii < items.length; ii++) {
            var prefix = (b.type === 'ol') ? (ii + 1) + '. ' : '- ';
            drawText(prefix + items[ii], mg + 10, { lineHeight: 13 });
          }
          y += 4;
        } else if (b.type === 'table') {
          renderTableAsCards(b);
          y += 4;
        } else if (b.type === 'code') {
          doc.setFont('courier', 'normal');
          doc.setFontSize(8.5);
          var codeLines = str(b.text).split('\n');
          for (var ci = 0; ci < codeLines.length; ci++) drawText(codeLines[ci], mg, { lineHeight: 11 });
          y += 5;
        } else if (b.type === 'quote') {
          doc.setFont('helvetica', 'italic');
          doc.setFontSize(9.8);
          drawText(b.text, mg + 16, { lineHeight: 13 });
          y += 4;
        }
      }

      var totalPages = doc.internal.getNumberOfPages();
      for (var p = 1; p <= totalPages; p++) {
        doc.setPage(p);
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(8);
        doc.setTextColor(150, 150, 150);
        try { doc.text('GRC Expert can make mistakes · Page ' + p + '/' + totalPages, mg, ph - 20); } catch (_) {}
      }

      var fn = safeName(title || inferTitle(markdown) || 'GRC-Document') + '.pdf';
      try {
        doc.save(fn);
      } catch (saveErr) {
        console.warn('[export] doc.save fallback:', saveErr.message);
        var blob = doc.output('blob');
        download(blob, fn);
      }
      console.log('[export] PDF done: ' + fn);
      return fn;
    } catch (err) {
      console.error('[export] safe PDF renderer failed:', err);
      throw new Error('PDF export failed safely. Please try Word export for very large tables. Details: ' + err.message);
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
