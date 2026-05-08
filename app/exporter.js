/**
 * GRC Expert — Export Module v4.0
 *
 * VERIFIED library globals:
 *   Word:  window.docx  (unpkg.com/docx@8.5.0/build/index.umd.js)
 *          → exposes: docx.Document, docx.Packer, docx.Paragraph, docx.TextRun, etc.
 *   PDF:   window.jspdf (cdnjs jspdf/2.5.1/jspdf.umd.min.js)
 *          → exposes: jspdf.jsPDF (constructor)
 *   Excel: window.XLSX  (cdnjs xlsx/0.18.5/xlsx.full.min.js)
 *          → exposes: XLSX.utils, XLSX.writeFile
 */

(function (window) {
  'use strict';

  // ============ HELPERS ============

  function strip(text) {
    if (!text) return '';
    return String(text)
      .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '$1')
      .replace(/\*\*([^*]+)\*\*/g, '$1')
      .replace(/\*([^*]+)\*/g, '$1')
      .replace(/`([^`]+)`/g, '$1');
  }

  function safeName(name) {
    return String(name || 'GRC-Document').replace(/[^\w\s-]/g, '').replace(/\s+/g, '-').substring(0, 80);
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
    var lines = md.split('\n');
    for (var i = 0; i < lines.length - 1; i++) {
      if (lines[i].trim().startsWith('|') && /^\s*\|[\s\-|:]+\|\s*$/.test(lines[i + 1])) return true;
    }
    return false;
  }

  function inferTitle(md) {
    if (!md) return null;
    var m = md.match(/^#+\s+(.+)$/m);
    return m ? strip(m[1]) : null;
  }

  // ============ BLOCK PARSER ============

  function parse(md) {
    var lines = md.split('\n'), blocks = [], i = 0;
    while (i < lines.length) {
      var t = lines[i].trim();
      if (!t) { i++; continue; }
      var m;
      if ((m = t.match(/^(#{1,4})\s+(.+)$/))) { blocks.push({ type: 'h' + m[1].length, text: m[2] }); i++; continue; }
      if (/^[-*_]{3,}$/.test(t)) { blocks.push({ type: 'hr' }); i++; continue; }
      if (t.startsWith('|') && i + 1 < lines.length && /^\s*\|[\s\-|:]+\|\s*$/.test(lines[i + 1])) {
        var hdr = t.split('|').slice(1, -1).map(function (c) { return c.trim(); });
        i += 2; var rows = [];
        while (i < lines.length && lines[i].trim().startsWith('|')) {
          rows.push(lines[i].split('|').slice(1, -1).map(function (c) { return c.trim(); })); i++;
        }
        blocks.push({ type: 'table', headers: hdr, rows: rows }); continue;
      }
      if (t.startsWith('```')) { i++; var code = []; while (i < lines.length && !lines[i].trim().startsWith('```')) { code.push(lines[i]); i++; } i++; blocks.push({ type: 'code', text: code.join('\n') }); continue; }
      if (t.startsWith('>')) { var q = []; while (i < lines.length && lines[i].trim().startsWith('>')) { q.push(lines[i].trim().replace(/^>\s?/, '')); i++; } blocks.push({ type: 'quote', text: q.join(' ') }); continue; }
      if (/^[-*+]\s+/.test(t)) { var ul = []; while (i < lines.length && /^\s*[-*+]\s+/.test(lines[i])) { ul.push(lines[i].replace(/^\s*[-*+]\s+/, '')); i++; } blocks.push({ type: 'ul', items: ul }); continue; }
      if (/^\d+\.\s+/.test(t)) { var ol = []; while (i < lines.length && /^\s*\d+\.\s+/.test(lines[i])) { ol.push(lines[i].replace(/^\s*\d+\.\s+/, '')); i++; } blocks.push({ type: 'ol', items: ol }); continue; }
      var p = [t]; i++;
      while (i < lines.length && lines[i].trim() && !/^[#|>`\-*+\d]/.test(lines[i].trim().charAt(0) === '#' ? '#' : lines[i].trim())) { p.push(lines[i].trim()); i++; }
      blocks.push({ type: 'p', text: p.join(' ') });
    }
    return blocks;
  }

  // ============ COPY ============

  async function copyText(text) {
    console.log('[export] Copy');
    try { await navigator.clipboard.writeText(text); return true; }
    catch (e) {
      var ta = document.createElement('textarea'); ta.value = text;
      ta.style.cssText = 'position:fixed;opacity:0;left:-9999px';
      document.body.appendChild(ta); ta.select();
      var ok = false; try { ok = document.execCommand('copy'); } catch (_) {}
      document.body.removeChild(ta); return ok;
    }
  }

  // ============ WORD (.docx) ============

  async function exportWord(markdown, title) {
    console.log('[export] Word start');

    // Validate library
    if (!window.docx) {
      console.error('[export] window.docx =', typeof window.docx);
      throw new Error('Word library not loaded. The docx CDN may be blocked. Please refresh and try again.');
    }
    var D = window.docx;
    if (!D.Document || !D.Packer || !D.Paragraph || !D.TextRun) {
      console.error('[export] docx keys:', Object.keys(D).join(', '));
      throw new Error('Word library loaded but missing required classes (Document/Packer/Paragraph). Version mismatch.');
    }

    var blocks = parse(markdown);
    var children = [];

    // Title
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
          // Header
          tRows.push(new D.TableRow({
            tableHeader: true,
            children: b.headers.map(function (h) {
              return new D.TableCell({
                children: [new D.Paragraph({ children: [new D.TextRun({ text: strip(h), bold: true, size: 18, color: 'FFFFFF' })] })],
                shading: { fill: '0EA5E9' }, borders: borders,
              });
            }),
          }));
          // Data
          for (var ri = 0; ri < b.rows.length; ri++) {
            var r = b.rows[ri];
            tRows.push(new D.TableRow({
              children: b.headers.map(function (_, ci) {
                return new D.TableCell({
                  children: [new D.Paragraph({ children: [new D.TextRun({ text: strip(r[ci] || ''), size: 18 })] })],
                  borders: borders,
                });
              }),
            }));
          }
          children.push(new D.Table({
            rows: tRows, width: { size: 100, type: D.WidthType.PERCENTAGE },
          }));
          children.push(new D.Paragraph({ children: [], spacing: { after: 200 } }));
        } catch (te) {
          console.warn('[export] Word table fallback:', te.message);
          // Fallback: text
          children.push(new D.Paragraph({ children: [new D.TextRun({ text: b.headers.join(' | '), bold: true, size: 20 })], spacing: { after: 60 } }));
          for (var tr = 0; tr < b.rows.length; tr++) {
            children.push(new D.Paragraph({ children: [new D.TextRun({ text: b.rows[tr].map(strip).join(' | '), size: 18 })], spacing: { after: 40 } }));
          }
        }
      } else if (b.type === 'code') {
        children.push(new D.Paragraph({ children: [new D.TextRun({ text: b.text, font: 'Consolas', size: 18 })], spacing: { after: 120 } }));
      } else if (b.type === 'quote') {
        children.push(new D.Paragraph({ children: [new D.TextRun({ text: strip(b.text), italics: true, size: 22 })], indent: { left: 400 }, spacing: { after: 120 } }));
      }
    }

    // Footer
    children.push(new D.Paragraph({
      children: [new D.TextRun({ text: 'Generated by GRC Expert', size: 16, color: '999999', italics: true })],
      spacing: { before: 400 },
    }));

    console.log('[export] Word: ' + children.length + ' elements, packing...');

    var doc = new D.Document({
      creator: 'GRC Expert', title: title || 'GRC Document',
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
    console.log('[export] PDF start');

    if (!window.jspdf || !window.jspdf.jsPDF) {
      console.error('[export] window.jspdf =', typeof window.jspdf);
      if (window.jspdf) console.error('[export] jspdf keys:', Object.keys(window.jspdf).join(', '));
      throw new Error('PDF library not loaded. The jsPDF CDN may be blocked. Please refresh and try again.');
    }

    var JPDF = window.jspdf.jsPDF;
    var doc = new JPDF({ unit: 'pt', format: 'a4' });
    var pw = doc.internal.pageSize.width, ph = doc.internal.pageSize.height, mg = 40, w = pw - mg * 2, y = mg;

    function np(n) { if (y + (n || 20) > ph - mg) { doc.addPage(); y = mg; } }

    if (title) {
      doc.setFont('helvetica', 'bold'); doc.setFontSize(20); doc.setTextColor(14, 165, 233);
      doc.splitTextToSize(strip(title), w).forEach(function (l) { np(24); doc.text(l, mg, y); y += 24; });
      y += 10; doc.setTextColor(0);
    }

    var blocks = parse(markdown);
    for (var bi = 0; bi < blocks.length; bi++) {
      var b = blocks[bi];
      if (b.type.charAt(0) === 'h') {
        var fs = { h1: 18, h2: 15, h3: 13, h4: 12 }, lh = { h1: 22, h2: 20, h3: 18, h4: 16 };
        y += 6; np(lh[b.type] + 4);
        doc.setFont('helvetica', 'bold'); doc.setFontSize(fs[b.type]);
        if (b.type === 'h1' || b.type === 'h2') doc.setTextColor(14, 165, 233);
        doc.splitTextToSize(strip(b.text), w).forEach(function (l) { np(lh[b.type]); doc.text(l, mg, y); y += lh[b.type]; });
        doc.setTextColor(0); y += 4;
      } else if (b.type === 'p') {
        doc.setFont('helvetica', 'normal'); doc.setFontSize(10.5);
        doc.splitTextToSize(strip(b.text), w).forEach(function (l) { np(14); doc.text(l, mg, y); y += 14; });
        y += 4;
      } else if (b.type === 'ul' || b.type === 'ol') {
        doc.setFont('helvetica', 'normal'); doc.setFontSize(10.5);
        (b.items || []).forEach(function (item, idx) {
          var pf = b.type === 'ol' ? (idx + 1) + '. ' : '• ';
          doc.splitTextToSize(pf + strip(item), w - 12).forEach(function (l) { np(13); doc.text(l, mg + 12, y); y += 13; });
        });
        y += 4;
      } else if (b.type === 'table' && typeof doc.autoTable === 'function') {
        doc.autoTable({
          head: [b.headers.map(strip)],
          body: b.rows.map(function (r) { return r.map(strip); }),
          startY: y, margin: { left: mg, right: mg },
          styles: { fontSize: 8.5, cellPadding: 4, overflow: 'linebreak' },
          headStyles: { fillColor: [14, 165, 233], textColor: 255, fontStyle: 'bold' },
          alternateRowStyles: { fillColor: [245, 250, 255] },
          theme: 'grid',
        });
        y = doc.lastAutoTable.finalY + 10;
      } else if (b.type === 'table') {
        // Fallback text table
        doc.setFont('helvetica', 'bold'); doc.setFontSize(9); np(14);
        doc.text(b.headers.map(strip).join(' | '), mg, y); y += 14;
        doc.setFont('helvetica', 'normal');
        b.rows.forEach(function (r) {
          doc.splitTextToSize(r.map(strip).join(' | '), w).forEach(function (l) { np(12); doc.text(l, mg, y); y += 12; });
        }); y += 6;
      } else if (b.type === 'code') {
        doc.setFont('courier', 'normal'); doc.setFontSize(9);
        b.text.split('\n').forEach(function (cl) {
          doc.splitTextToSize(cl, w).forEach(function (l) { np(12); doc.text(l, mg, y); y += 12; });
        }); y += 6;
      }
    }

    var tp = doc.internal.getNumberOfPages();
    for (var p = 1; p <= tp; p++) {
      doc.setPage(p); doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(150);
      doc.text('GRC Expert · Page ' + p + '/' + tp, pw / 2, ph - 20, { align: 'center' });
      doc.setTextColor(0);
    }

    var fn = safeName(title) + '.pdf';
    doc.save(fn);
    console.log('[export] PDF done: ' + fn);
    return fn;
  }

  // ============ EXCEL (.xlsx) ============

  async function exportExcel(markdown, title) {
    console.log('[export] Excel start');

    if (!window.XLSX || !window.XLSX.utils || !window.XLSX.writeFile) {
      console.error('[export] window.XLSX =', typeof window.XLSX);
      throw new Error('Excel library not loaded. The SheetJS CDN may be blocked. Please refresh and try again.');
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
        for (var ci = 0; ci < tbl.headers.length; ci++) row.push(strip(tbl.rows[ri][ci] || ''));
        data.push(row);
      }
      var ws = window.XLSX.utils.aoa_to_sheet(data);
      // Auto column widths
      ws['!cols'] = tbl.headers.map(function (h, idx) {
        var mx = strip(h).length;
        for (var r = 0; r < tbl.rows.length; r++) {
          var v = strip(tbl.rows[r][idx] || '').length;
          if (v > mx) mx = v;
        }
        return { wch: Math.min(Math.max(mx + 2, 10), 50) };
      });

      // Sheet name from nearest heading
      var sn = 'Table ' + (ti + 1), lastH = null;
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
