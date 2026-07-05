/**
 * GRC Expert — Export Module v6.0
 * [PDF EXPORT VERSION] exporter.js v6 loaded
 *
 * Changes from v5:
 *   - safeText logs full diagnostics on failure and NEVER crashes generation
 *   - safeText never passes an empty options object
 *   - autoTable wrapped in try/catch with full text fallback
 *   - setTextColor always uses 3 args (jsPDF 2.5.1 requirement)
 *   - Per-block try/catch: one bad block cannot kill the whole PDF
 *   - Version stamp logged so you can verify the browser loaded THIS file
 */

(function (window) {
  'use strict';

  console.log('[PDF EXPORT VERSION] exporter.js v6 loaded');

  // ============ GUARANTEED STRING ============
  function S(v) {
    if (v === null || v === undefined) return '';
    if (typeof v === 'string') return v;
    if (typeof v === 'number') return isFinite(v) ? String(v) : '';
    if (Array.isArray(v)) return v.map(S).join(' ');
    try { return String(v); } catch (e) { return ''; }
  }

  function strip(text) {
    return S(text)
      .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '$1')
      .replace(/\*\*([^*]+)\*\*/g, '$1')
      .replace(/\*([^*]+)\*/g, '$1')
      .replace(/`([^`]+)`/g, '$1');
  }

  // ============ jsPDF SAFE WRAPPERS ============

  function safeText(doc, text, x, y, options) {
    var safeContent;
    if (Array.isArray(text)) {
      safeContent = text.map(function (item) { return S(item); }).filter(function (s) { return s.length > 0; });
      if (safeContent.length === 0) return;
    } else {
      safeContent = S(text);
      if (safeContent === '') return;
    }

    var safeX = (typeof x === 'number' && isFinite(x)) ? x : 40;
    var safeY = (typeof y === 'number' && isFinite(y)) ? y : 40;

    try {
      if (options && typeof options === 'object' && Object.keys(options).length > 0) {
        doc.text(safeContent, safeX, safeY, options);
      } else {
        doc.text(safeContent, safeX, safeY);
      }
    } catch (err) {
      console.error('[PDF safeText FAILED]', {
        error: err.message,
        contentType: typeof safeContent,
        isArray: Array.isArray(safeContent),
        contentPreview: Array.isArray(safeContent) ? safeContent[0] : S(safeContent).substring(0, 80),
        x: safeX, xType: typeof safeX,
        y: safeY, yType: typeof safeY,
        options: options,
      });
      // Do NOT re-throw — skip this text, keep generating
    }
  }

  function safeSplit(doc, text, maxWidth) {
    var content = S(text);
    if (!content) return [];
    var w = (typeof maxWidth === 'number' && isFinite(maxWidth) && maxWidth > 0) ? maxWidth : 400;
    try {
      var result = doc.splitTextToSize(content, w);
      if (!Array.isArray(result)) return [content];
      return result.map(S);
    } catch (e) {
      console.warn('[PDF safeSplit failed]', e.message, '| text:', content.substring(0, 50));
      return [content];
    }
  }

  // ============ HELPERS ============

  function safeName(n) { return S(n || 'GRC-Document').replace(/[^\w\s-]/g, '').replace(/\s+/g, '-').substring(0, 80) || 'GRC-Document'; }

  function dlBlob(blob, fn) {
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url; a.download = fn;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 3000);
  }

  function hasTable(md) {
    if (!md) return false;
    var lines = S(md).split('\n');
    for (var i = 0; i < lines.length - 1; i++) {
      if (lines[i].trim().startsWith('|') && /^\s*\|[\s\-|:]+\|\s*$/.test(lines[i + 1])) return true;
    }
    return false;
  }

  function inferTitle(md) {
    var m = S(md).match(/^#+\s+(.+)$/m);
    return m ? strip(m[1]) : null;
  }

  // ============ BLOCK PARSER ============

  function parse(md) {
    var lines = S(md).split('\n');
    var blocks = [];
    var i = 0;
    while (i < lines.length) {
      var t = S(lines[i]).trim();
      if (!t) { i++; continue; }

      var hm = t.match(/^(#{1,4})\s+(.+)$/);
      if (hm) { blocks.push({ type: 'h' + hm[1].length, text: S(hm[2]) }); i++; continue; }

      if (/^[-*_]{3,}$/.test(t)) { blocks.push({ type: 'hr' }); i++; continue; }

      if (t.startsWith('|') && i + 1 < lines.length && /^\s*\|[\s\-|:]+\|\s*$/.test(S(lines[i + 1]))) {
        var hdr = t.split('|').slice(1, -1).map(function (c) { return S(c).trim(); });
        i += 2;
        var rows = [];
        while (i < lines.length && S(lines[i]).trim().startsWith('|')) {
          rows.push(S(lines[i]).split('|').slice(1, -1).map(function (c) { return S(c).trim(); }));
          i++;
        }
        blocks.push({ type: 'table', headers: hdr, rows: rows });
        continue;
      }

      if (t.startsWith('```')) {
        i++;
        var code = [];
        while (i < lines.length && !S(lines[i]).trim().startsWith('```')) { code.push(S(lines[i])); i++; }
        if (i < lines.length) i++;
        blocks.push({ type: 'code', text: code.join('\n') });
        continue;
      }

      if (t.startsWith('>')) {
        var q = [];
        while (i < lines.length && S(lines[i]).trim().startsWith('>')) {
          q.push(S(lines[i]).trim().replace(/^>\s?/, '')); i++;
        }
        blocks.push({ type: 'quote', text: q.join(' ') });
        continue;
      }

      if (/^[-*+]\s+/.test(t)) {
        var ul = [];
        while (i < lines.length && /^\s*[-*+]\s+/.test(S(lines[i]))) {
          ul.push(S(lines[i]).replace(/^\s*[-*+]\s+/, '')); i++;
        }
        blocks.push({ type: 'ul', items: ul });
        continue;
      }

      if (/^\d+\.\s+/.test(t)) {
        var ol = [];
        while (i < lines.length && /^\s*\d+\.\s+/.test(S(lines[i]))) {
          ol.push(S(lines[i]).replace(/^\s*\d+\.\s+/, '')); i++;
        }
        blocks.push({ type: 'ol', items: ol });
        continue;
      }

      var p = [t]; i++;
      while (i < lines.length) {
        var nl = S(lines[i]).trim();
        if (!nl) break;
        if (/^#{1,4}\s/.test(nl) || nl.startsWith('|') || nl.startsWith('```') ||
          nl.startsWith('>') || /^[-*+]\s/.test(nl) || /^\d+\.\s/.test(nl) ||
          /^[-*_]{3,}$/.test(nl)) break;
        p.push(nl); i++;
      }
      blocks.push({ type: 'p', text: p.join(' ') });
    }
    return blocks;
  }

  // ============ COPY ============

  async function copyText(text) {
    console.log('[export] Copy');
    try { await navigator.clipboard.writeText(S(text)); return true; }
    catch (e) {
      var ta = document.createElement('textarea'); ta.value = S(text);
      ta.style.cssText = 'position:fixed;opacity:0;left:-9999px';
      document.body.appendChild(ta); ta.select();
      var ok = false; try { ok = document.execCommand('copy'); } catch (_) { }
      document.body.removeChild(ta); return ok;
    }
  }

  // ============ WORD (.docx) ============

  async function exportWord(markdown, title) {
    console.log('[export] Word start');
    if (!window.docx || !window.docx.Document || !window.docx.Packer) {
      throw new Error('Word library not loaded. Please refresh the page.');
    }
    var D = window.docx;
    var blocks = parse(markdown);
    var children = [];

    if (title) {
      children.push(new D.Paragraph({
        children: [new D.TextRun({ text: strip(title), bold: true, size: 36, color: '0EA5E9' })],
        heading: D.HeadingLevel.TITLE, spacing: { after: 300 },
      }));
    }

    var HL = { h1: D.HeadingLevel.HEADING_1, h2: D.HeadingLevel.HEADING_2, h3: D.HeadingLevel.HEADING_3, h4: D.HeadingLevel.HEADING_4 };
    var SZ = { h1: 32, h2: 28, h3: 24, h4: 22 };

    for (var bi = 0; bi < blocks.length; bi++) {
      var b = blocks[bi];
      if (HL[b.type]) {
        children.push(new D.Paragraph({ children: [new D.TextRun({ text: strip(b.text), bold: true, size: SZ[b.type] })], heading: HL[b.type], spacing: { before: 240, after: 120 } }));
      } else if (b.type === 'p') {
        children.push(new D.Paragraph({ children: [new D.TextRun({ text: strip(b.text), size: 22 })], spacing: { after: 120 } }));
      } else if (b.type === 'ul') {
        for (var u = 0; u < b.items.length; u++) children.push(new D.Paragraph({ children: [new D.TextRun({ text: strip(b.items[u]), size: 22 })], bullet: { level: 0 }, spacing: { after: 60 } }));
      } else if (b.type === 'ol') {
        for (var o = 0; o < b.items.length; o++) children.push(new D.Paragraph({ children: [new D.TextRun({ text: (o + 1) + '. ' + strip(b.items[o]), size: 22 })], spacing: { after: 60 } }));
      } else if (b.type === 'table') {
        try {
          var bd = { style: D.BorderStyle.SINGLE, size: 3, color: 'AAAAAA' };
          var borders = { top: bd, bottom: bd, left: bd, right: bd };
          var tR = [];
          tR.push(new D.TableRow({
            tableHeader: true, children: b.headers.map(function (h) {
              return new D.TableCell({ children: [new D.Paragraph({ children: [new D.TextRun({ text: strip(h), bold: true, size: 18, color: 'FFFFFF' })] })], shading: { fill: '0EA5E9' }, borders: borders });
            })
          }));
          for (var ri = 0; ri < b.rows.length; ri++) {
            var r = b.rows[ri];
            tR.push(new D.TableRow({
              children: b.headers.map(function (_, ci) {
                return new D.TableCell({ children: [new D.Paragraph({ children: [new D.TextRun({ text: strip(r[ci]), size: 18 })] })], borders: borders });
              })
            }));
          }
          children.push(new D.Table({ rows: tR, width: { size: 100, type: D.WidthType.PERCENTAGE } }));
          children.push(new D.Paragraph({ children: [], spacing: { after: 200 } }));
        } catch (te) {
          console.warn('[export] Word table error:', te.message);
          children.push(new D.Paragraph({ children: [new D.TextRun({ text: b.headers.map(strip).join(' | '), bold: true, size: 20 })] }));
          for (var tr2 = 0; tr2 < b.rows.length; tr2++) children.push(new D.Paragraph({ children: [new D.TextRun({ text: b.rows[tr2].map(strip).join(' | '), size: 18 })] }));
        }
      } else if (b.type === 'code') {
        children.push(new D.Paragraph({ children: [new D.TextRun({ text: S(b.text), font: 'Consolas', size: 18 })], spacing: { after: 120 } }));
      } else if (b.type === 'quote') {
        children.push(new D.Paragraph({ children: [new D.TextRun({ text: strip(b.text), italics: true, size: 22 })], indent: { left: 400 }, spacing: { after: 120 } }));
      }
    }

    children.push(new D.Paragraph({ children: [new D.TextRun({ text: 'Generated by GRC Expert', size: 16, color: '999999', italics: true })], spacing: { before: 400 } }));
    console.log('[export] Word: ' + children.length + ' elements');
    var doc = new D.Document({ creator: 'GRC Expert', title: S(title) || 'GRC Document', sections: [{ properties: {}, children: children }] });
    var blob = await D.Packer.toBlob(doc);
    var fn = safeName(title) + '.docx';
    dlBlob(blob, fn);
    console.log('[export] Word done: ' + fn);
    return fn;
  }

  // ============ PDF ============

  async function exportPdf(markdown, title) {
    console.log('[export] PDF start — exporter v6');

    if (!window.jspdf || !window.jspdf.jsPDF) {
      console.error('[export] window.jspdf:', typeof window.jspdf);
      throw new Error('PDF library not loaded. Please refresh the page.');
    }

    var doc = new window.jspdf.jsPDF({ unit: 'pt', format: 'a4' });
    var pw = doc.internal.pageSize.getWidth();
    var ph = doc.internal.pageSize.getHeight();
    var mg = 40;
    var w = pw - mg * 2;
    var y = mg;

    console.log('[export] PDF page:', pw, 'x', ph);

    function np(n) {
      if (y + (n || 20) > ph - mg) { doc.addPage(); y = mg; }
    }

    if (title) {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(20);
      doc.setTextColor(14, 165, 233);
      var tLines = safeSplit(doc, strip(title), w);
      for (var tl = 0; tl < tLines.length; tl++) { np(24); safeText(doc, tLines[tl], mg, y); y += 24; }
      y += 10;
      doc.setTextColor(0, 0, 0);
    }

    var blocks = parse(markdown);
    console.log('[export] PDF blocks:', blocks.length);

    for (var bi = 0; bi < blocks.length; bi++) {
      var b = blocks[bi];
      try {
        if (b.type === 'h1' || b.type === 'h2' || b.type === 'h3' || b.type === 'h4') {
          var fz = { h1: 18, h2: 15, h3: 13, h4: 12 };
          var lh = { h1: 22, h2: 20, h3: 18, h4: 16 };
          y += 6;
          np(lh[b.type] + 4);
          doc.setFont('helvetica', 'bold');
          doc.setFontSize(fz[b.type]);
          if (b.type === 'h1' || b.type === 'h2') doc.setTextColor(14, 165, 233);
          else doc.setTextColor(0, 0, 0);
          var hLines = safeSplit(doc, strip(b.text), w);
          for (var hi = 0; hi < hLines.length; hi++) { np(lh[b.type]); safeText(doc, hLines[hi], mg, y); y += lh[b.type]; }
          doc.setTextColor(0, 0, 0);
          y += 4;

        } else if (b.type === 'p') {
          doc.setFont('helvetica', 'normal');
          doc.setFontSize(10.5);
          doc.setTextColor(0, 0, 0);
          var pLines = safeSplit(doc, strip(b.text), w);
          for (var pi = 0; pi < pLines.length; pi++) { np(14); safeText(doc, pLines[pi], mg, y); y += 14; }
          y += 4;

        } else if (b.type === 'ul' || b.type === 'ol') {
          doc.setFont('helvetica', 'normal');
          doc.setFontSize(10.5);
          doc.setTextColor(0, 0, 0);
          var items = b.items || [];
          for (var ii = 0; ii < items.length; ii++) {
            var pfx = (b.type === 'ol') ? S(ii + 1) + '. ' : '\u2022 ';
            var iLines = safeSplit(doc, pfx + strip(items[ii]), w - 12);
            for (var il = 0; il < iLines.length; il++) { np(13); safeText(doc, iLines[il], mg + 12, y); y += 13; }
          }
          y += 4;

        } else if (b.type === 'table') {
          var usedAutoTable = false;
          if (typeof doc.autoTable === 'function') {
            try {
              var safeHead = b.headers.map(strip);
              var safeBody = b.rows.map(function (r) {
                return b.headers.map(function (_, ci) { return strip(r[ci]); });
              });
              console.log('[export] autoTable: ' + safeHead.length + ' cols, ' + safeBody.length + ' rows');
              doc.autoTable({
                head: [safeHead],
                body: safeBody,
                startY: y,
                margin: { left: mg, right: mg },
                styles: { fontSize: 8.5, cellPadding: 4, overflow: 'linebreak', halign: 'left' },
                headStyles: { fillColor: [14, 165, 233], textColor: [255, 255, 255], fontStyle: 'bold' },
                alternateRowStyles: { fillColor: [245, 250, 255] },
                theme: 'grid',
              });
              y = doc.lastAutoTable.finalY + 10;
              usedAutoTable = true;
            } catch (atErr) {
              console.warn('[export] autoTable failed:', atErr.message, '— using text fallback');
            }
          }
          if (!usedAutoTable) {
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(9);
            doc.setTextColor(0, 0, 0);
            np(14);
            safeText(doc, b.headers.map(strip).join(' | '), mg, y);
            y += 14;
            doc.setFont('helvetica', 'normal');
            for (var rr = 0; rr < b.rows.length; rr++) {
              var rl = safeSplit(doc, b.rows[rr].map(strip).join(' | '), w);
              for (var rli = 0; rli < rl.length; rli++) { np(12); safeText(doc, rl[rli], mg, y); y += 12; }
            }
            y += 6;
          }

        } else if (b.type === 'code') {
          doc.setFont('courier', 'normal');
          doc.setFontSize(9);
          doc.setTextColor(0, 0, 0);
          var cLines = S(b.text).split('\n');
          for (var ci = 0; ci < cLines.length; ci++) {
            var cl = safeSplit(doc, S(cLines[ci]), w);
            for (var cli = 0; cli < cl.length; cli++) { np(12); safeText(doc, cl[cli], mg, y); y += 12; }
          }
          y += 6;

        } else if (b.type === 'quote') {
          doc.setFont('helvetica', 'italic');
          doc.setFontSize(10);
          doc.setTextColor(80, 80, 80);
          var qLines = safeSplit(doc, strip(b.text), w - 20);
          for (var qi = 0; qi < qLines.length; qi++) { np(13); safeText(doc, qLines[qi], mg + 20, y); y += 13; }
          doc.setTextColor(0, 0, 0);
          y += 4;
        }
      } catch (blockErr) {
        console.error('[export] PDF block ' + bi + ' (' + b.type + ') failed:', blockErr.message, '— continuing');
      }
    }

    try {
      var totalPages = doc.internal.getNumberOfPages();
      for (var p = 1; p <= totalPages; p++) {
        doc.setPage(p);
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(8);
        doc.setTextColor(150, 150, 150);
        safeText(doc, 'GRC Expert - Page ' + S(p) + '/' + S(totalPages), pw / 2, ph - 20, { align: 'center' });
        doc.setTextColor(0, 0, 0);
      }
    } catch (fe) {
      console.warn('[export] Footer error:', fe.message);
    }

    var fn = safeName(title) + '.pdf';
    doc.save(fn);
    console.log('[export] PDF done: ' + fn);
    return fn;
  }

  // ============ EXCEL ============

  async function exportExcel(markdown, title) {
    console.log('[export] Excel start');
    if (!window.XLSX || !window.XLSX.utils || !window.XLSX.writeFile) {
      throw new Error('Excel library not loaded. Please refresh the page.');
    }
    var blocks = parse(markdown);
    var tables = blocks.filter(function (b) { return b.type === 'table'; });
    if (!tables.length) throw new Error('No tables found in the response.');

    var wb = window.XLSX.utils.book_new();
    for (var ti = 0; ti < tables.length; ti++) {
      var tbl = tables[ti];
      var data = [tbl.headers.map(strip)];
      for (var ri = 0; ri < tbl.rows.length; ri++) {
        var row = [];
        for (var ci = 0; ci < tbl.headers.length; ci++) row.push(strip(tbl.rows[ri][ci]));
        data.push(row);
      }
      var ws = window.XLSX.utils.aoa_to_sheet(data);
      ws['!cols'] = tbl.headers.map(function (h, idx) {
        var mx = strip(h).length;
        for (var r = 0; r < tbl.rows.length; r++) { var v = strip(tbl.rows[r][idx]).length; if (v > mx) mx = v; }
        return { wch: Math.min(Math.max(mx + 2, 10), 50) };
      });
      var sn = 'Table ' + (ti + 1), lastH = null;
      for (var bj = 0; bj < blocks.length; bj++) { if (blocks[bj] === tbl) break; if (blocks[bj].type && blocks[bj].type.charAt(0) === 'h') lastH = blocks[bj].text; }
      if (lastH) sn = strip(lastH).substring(0, 28).replace(/[\\\/\*\?:\[\]]/g, '') || sn;
      window.XLSX.utils.book_append_sheet(wb, ws, sn);
    }
    var fn = safeName(title || 'GRC-Tables') + '.xlsx';
    window.XLSX.writeFile(wb, fn);
    console.log('[export] Excel done: ' + fn);
    return fn;
  }

  // ============ PUBLIC ============
  window.exporter = { copyText: copyText, exportWord: exportWord, exportPdf: exportPdf, exportExcel: exportExcel, hasTable: hasTable, inferTitle: inferTitle };
})(window);
