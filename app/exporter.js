/**
 * GRC Expert — Export Module v3.0 (FINAL)
 *
 * Libraries expected:
 *   Word:  window.docx  (from unpkg.com/docx@8.5.0/build/index.umd.js)
 *   PDF:   window.jspdf.jsPDF  (from cdnjs jspdf 2.5.2 UMD)
 *   Excel: window.XLSX  (from cdnjs SheetJS 0.18.5)
 */

(function (window) {
  'use strict';

  // ============ HELPERS ============

  function stripInline(text) {
    if (!text) return '';
    return String(text)
      .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '$1')
      .replace(/\*\*([^*]+)\*\*/g, '$1')
      .replace(/\*([^*]+)\*/g, '$1')
      .replace(/`([^`]+)`/g, '$1');
  }

  function sanitizeFilename(name) {
    return String(name || 'GRC-Document').replace(/[^\w\s-]/g, '').replace(/\s+/g, '-').substring(0, 80);
  }

  function triggerDownload(blob, filename) {
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
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
    var lines = md.split('\n');
    for (var j = 0; j < Math.min(lines.length, 20); j++) {
      var h = lines[j].trim().match(/^#+\s+(.+)$/);
      if (h) return stripInline(h[1]);
    }
    return null;
  }

  // ============ MARKDOWN BLOCK PARSER ============

  function parseBlocks(md) {
    var lines = md.split('\n');
    var blocks = [];
    var i = 0;
    while (i < lines.length) {
      var t = lines[i].trim();
      if (!t) { i++; continue; }

      // Headings
      var m;
      if ((m = t.match(/^(#{1,4})\s+(.+)$/))) {
        blocks.push({ type: 'h' + m[1].length, content: m[2] });
        i++; continue;
      }
      // HR
      if (/^[-*_]{3,}$/.test(t)) { blocks.push({ type: 'hr' }); i++; continue; }
      // Table
      if (t.startsWith('|') && i + 1 < lines.length && /^\s*\|[\s\-|:]+\|\s*$/.test(lines[i + 1])) {
        var headers = t.split('|').slice(1, -1).map(function (c) { return c.trim(); });
        i += 2;
        var rows = [];
        while (i < lines.length && lines[i].trim().startsWith('|')) {
          rows.push(lines[i].split('|').slice(1, -1).map(function (c) { return c.trim(); }));
          i++;
        }
        blocks.push({ type: 'table', headers: headers, rows: rows });
        continue;
      }
      // Code block
      if (t.startsWith('```')) {
        i++;
        var code = [];
        while (i < lines.length && !lines[i].trim().startsWith('```')) { code.push(lines[i]); i++; }
        i++;
        blocks.push({ type: 'code', content: code.join('\n') });
        continue;
      }
      // Blockquote
      if (t.startsWith('>')) {
        var ql = [];
        while (i < lines.length && lines[i].trim().startsWith('>')) { ql.push(lines[i].trim().replace(/^>\s?/, '')); i++; }
        blocks.push({ type: 'quote', content: ql.join(' ') });
        continue;
      }
      // UL
      if (/^[-*+]\s+/.test(t)) {
        var ul = [];
        while (i < lines.length && /^\s*[-*+]\s+/.test(lines[i])) { ul.push(lines[i].replace(/^\s*[-*+]\s+/, '')); i++; }
        blocks.push({ type: 'ul', items: ul });
        continue;
      }
      // OL
      if (/^\d+\.\s+/.test(t)) {
        var ol = [];
        while (i < lines.length && /^\s*\d+\.\s+/.test(lines[i])) { ol.push(lines[i].replace(/^\s*\d+\.\s+/, '')); i++; }
        blocks.push({ type: 'ol', items: ol });
        continue;
      }
      // Paragraph
      var p = [t]; i++;
      while (i < lines.length && lines[i].trim() && !/^[#|>`\-*+\d]/.test(lines[i].trim())) {
        p.push(lines[i].trim()); i++;
      }
      blocks.push({ type: 'p', content: p.join(' ') });
    }
    return blocks;
  }

  // ============ COPY ============

  async function copyText(text) {
    console.log('[exporter] Copy started');
    try {
      await navigator.clipboard.writeText(text);
      console.log('[exporter] Copy success');
      return true;
    } catch (e) {
      var ta = document.createElement('textarea');
      ta.value = text;
      ta.style.cssText = 'position:fixed;opacity:0;left:-9999px';
      document.body.appendChild(ta);
      ta.select();
      var ok = false;
      try { ok = document.execCommand('copy'); } catch (_) { }
      document.body.removeChild(ta);
      console.log('[exporter] Copy fallback:', ok);
      return ok;
    }
  }

  // ============ WORD EXPORT ============

  async function exportWord(markdown, title) {
    console.log('[exporter] Word export started');

    // Check library
    if (!window.docx) {
      console.error('[exporter] window.docx is', typeof window.docx);
      throw new Error('Word library (docx) failed to load. Try refreshing the page.');
    }

    var D = window.docx;

    // Verify required constructors exist
    if (!D.Document || !D.Packer || !D.Paragraph || !D.TextRun) {
      console.error('[exporter] docx API missing. Available keys:', Object.keys(D).slice(0, 20));
      throw new Error('Word library loaded but API is incompatible. Please report this.');
    }

    console.log('[exporter] docx library OK, building document...');

    var blocks = parseBlocks(markdown);
    var children = [];

    // Title
    if (title) {
      children.push(new D.Paragraph({
        children: [new D.TextRun({ text: stripInline(title), bold: true, size: 36, color: '0EA5E9' })],
        heading: D.HeadingLevel.TITLE,
        spacing: { after: 300 },
      }));
    }

    for (var bi = 0; bi < blocks.length; bi++) {
      var b = blocks[bi];
      var headLevel = { h1: D.HeadingLevel.HEADING_1, h2: D.HeadingLevel.HEADING_2, h3: D.HeadingLevel.HEADING_3, h4: D.HeadingLevel.HEADING_4 };
      var headSize = { h1: 32, h2: 28, h3: 24, h4: 22 };

      if (headLevel[b.type]) {
        children.push(new D.Paragraph({
          children: [new D.TextRun({ text: stripInline(b.content), bold: true, size: headSize[b.type] })],
          heading: headLevel[b.type],
          spacing: { before: 240, after: 120 },
        }));
      } else if (b.type === 'p') {
        children.push(new D.Paragraph({
          children: [new D.TextRun({ text: stripInline(b.content), size: 22 })],
          spacing: { after: 120 },
        }));
      } else if (b.type === 'ul') {
        for (var u = 0; u < b.items.length; u++) {
          children.push(new D.Paragraph({
            children: [new D.TextRun({ text: stripInline(b.items[u]), size: 22 })],
            bullet: { level: 0 },
            spacing: { after: 60 },
          }));
        }
      } else if (b.type === 'ol') {
        for (var o = 0; o < b.items.length; o++) {
          children.push(new D.Paragraph({
            children: [new D.TextRun({ text: (o + 1) + '. ' + stripInline(b.items[o]), size: 22 })],
            spacing: { after: 60 },
          }));
        }
      } else if (b.type === 'table') {
        try {
          var bdr = { style: D.BorderStyle.SINGLE, size: 3, color: 'AAAAAA' };
          var borders = { top: bdr, bottom: bdr, left: bdr, right: bdr };

          var headerRow = new D.TableRow({
            tableHeader: true,
            children: b.headers.map(function (h) {
              return new D.TableCell({
                children: [new D.Paragraph({
                  children: [new D.TextRun({ text: stripInline(h), bold: true, size: 18, color: 'FFFFFF' })],
                  alignment: D.AlignmentType.CENTER,
                })],
                shading: { fill: '0EA5E9' },
                borders: borders,
                verticalAlign: D.VerticalAlign.CENTER,
              });
            }),
          });

          var dataRows = b.rows.map(function (row) {
            return new D.TableRow({
              children: b.headers.map(function (_, ci) {
                return new D.TableCell({
                  children: [new D.Paragraph({
                    children: [new D.TextRun({ text: stripInline(row[ci] || ''), size: 18 })],
                  })],
                  borders: borders,
                });
              }),
            });
          });

          children.push(new D.Table({
            rows: [headerRow].concat(dataRows),
            width: { size: 100, type: D.WidthType.PERCENTAGE },
          }));
          children.push(new D.Paragraph({ children: [], spacing: { after: 200 } }));
        } catch (tableErr) {
          console.error('[exporter] Table error in Word:', tableErr);
          // Fallback: render table as text
          children.push(new D.Paragraph({
            children: [new D.TextRun({ text: b.headers.join(' | '), bold: true, size: 20 })],
            spacing: { after: 60 },
          }));
          for (var tr = 0; tr < b.rows.length; tr++) {
            children.push(new D.Paragraph({
              children: [new D.TextRun({ text: b.rows[tr].map(stripInline).join(' | '), size: 18 })],
              spacing: { after: 40 },
            }));
          }
        }
      } else if (b.type === 'code') {
        children.push(new D.Paragraph({
          children: [new D.TextRun({ text: b.content, font: 'Consolas', size: 18 })],
          spacing: { after: 120 },
        }));
      } else if (b.type === 'quote') {
        children.push(new D.Paragraph({
          children: [new D.TextRun({ text: stripInline(b.content), italics: true, size: 22 })],
          indent: { left: 400 },
          spacing: { after: 120 },
        }));
      }
    }

    // Footer paragraph
    children.push(new D.Paragraph({
      children: [new D.TextRun({ text: 'Generated by GRC Expert', size: 16, color: '999999', italics: true })],
      spacing: { before: 400 },
    }));

    console.log('[exporter] Word document: ' + children.length + ' paragraphs, creating blob...');

    var doc = new D.Document({
      creator: 'GRC Expert',
      title: title || 'GRC Document',
      sections: [{ properties: {}, children: children }],
    });

    var blob = await D.Packer.toBlob(doc);
    var filename = sanitizeFilename(title) + '.docx';
    triggerDownload(blob, filename);
    console.log('[exporter] Word downloaded: ' + filename);
    return filename;
  }

  // ============ PDF EXPORT ============

  async function exportPdf(markdown, title) {
    console.log('[exporter] PDF export started');

    if (!window.jspdf || !window.jspdf.jsPDF) {
      throw new Error('PDF library (jsPDF) failed to load. Try refreshing the page.');
    }

    var jsPDF = window.jspdf.jsPDF;
    var doc = new jsPDF({ unit: 'pt', format: 'a4' });
    var pw = doc.internal.pageSize.width;
    var ph = doc.internal.pageSize.height;
    var mg = 40;
    var usable = pw - mg * 2;
    var y = mg;

    function checkPage(n) { if (y + (n || 20) > ph - mg) { doc.addPage(); y = mg; } }

    if (title) {
      doc.setFont('helvetica', 'bold'); doc.setFontSize(20); doc.setTextColor(14, 165, 233);
      doc.splitTextToSize(stripInline(title), usable).forEach(function (l) { checkPage(24); doc.text(l, mg, y); y += 24; });
      y += 10; doc.setTextColor(0);
    }

    var blocks = parseBlocks(markdown);
    for (var bi = 0; bi < blocks.length; bi++) {
      var b = blocks[bi];
      if (b.type.startsWith('h')) {
        var fs = { h1: 18, h2: 15, h3: 13, h4: 12 }; var lh = { h1: 22, h2: 20, h3: 18, h4: 16 };
        y += 6; checkPage(lh[b.type] + 4);
        doc.setFont('helvetica', 'bold'); doc.setFontSize(fs[b.type]);
        if (b.type === 'h1' || b.type === 'h2') doc.setTextColor(14, 165, 233);
        doc.splitTextToSize(stripInline(b.content), usable).forEach(function (l) { checkPage(lh[b.type]); doc.text(l, mg, y); y += lh[b.type]; });
        doc.setTextColor(0); y += 4;
      } else if (b.type === 'p') {
        doc.setFont('helvetica', 'normal'); doc.setFontSize(10.5);
        doc.splitTextToSize(stripInline(b.content), usable).forEach(function (l) { checkPage(14); doc.text(l, mg, y); y += 14; });
        y += 4;
      } else if (b.type === 'ul' || b.type === 'ol') {
        doc.setFont('helvetica', 'normal'); doc.setFontSize(10.5);
        b.items.forEach(function (item, idx) {
          var prefix = b.type === 'ol' ? (idx + 1) + '. ' : '• ';
          doc.splitTextToSize(prefix + stripInline(item), usable - 12).forEach(function (l) { checkPage(13); doc.text(l, mg + 12, y); y += 13; });
        });
        y += 4;
      } else if (b.type === 'table' && typeof doc.autoTable === 'function') {
        doc.autoTable({
          head: [b.headers.map(stripInline)],
          body: b.rows.map(function (r) { return r.map(stripInline); }),
          startY: y, margin: { left: mg, right: mg },
          styles: { fontSize: 8.5, cellPadding: 4, overflow: 'linebreak' },
          headStyles: { fillColor: [14, 165, 233], textColor: [255, 255, 255], fontStyle: 'bold' },
          alternateRowStyles: { fillColor: [245, 250, 255] },
          theme: 'grid',
        });
        y = doc.lastAutoTable.finalY + 10;
      } else if (b.type === 'table') {
        doc.setFont('helvetica', 'bold'); doc.setFontSize(9);
        checkPage(14); doc.text(b.headers.map(stripInline).join(' | '), mg, y); y += 14;
        doc.setFont('helvetica', 'normal');
        b.rows.forEach(function (r) {
          doc.splitTextToSize(r.map(stripInline).join(' | '), usable).forEach(function (l) { checkPage(12); doc.text(l, mg, y); y += 12; });
        });
        y += 6;
      } else if (b.type === 'code') {
        doc.setFont('courier', 'normal'); doc.setFontSize(9);
        b.content.split('\n').forEach(function (cl) {
          doc.splitTextToSize(cl, usable).forEach(function (l) { checkPage(12); doc.text(l, mg, y); y += 12; });
        });
        y += 6;
      }
    }

    // Footer
    var tp = doc.internal.getNumberOfPages();
    for (var p = 1; p <= tp; p++) {
      doc.setPage(p); doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(150);
      doc.text('GRC Expert · Page ' + p + ' of ' + tp, pw / 2, ph - 20, { align: 'center' });
      doc.setTextColor(0);
    }

    var filename = sanitizeFilename(title) + '.pdf';
    doc.save(filename);
    console.log('[exporter] PDF downloaded: ' + filename);
    return filename;
  }

  // ============ EXCEL EXPORT ============

  async function exportExcel(markdown, title) {
    console.log('[exporter] Excel export started');

    if (!window.XLSX) {
      console.error('[exporter] window.XLSX is', typeof window.XLSX);
      throw new Error('Excel library (SheetJS) failed to load. Try refreshing the page.');
    }

    // Verify key functions
    if (!window.XLSX.utils || !window.XLSX.utils.book_new || !window.XLSX.writeFile) {
      console.error('[exporter] XLSX API incomplete. Keys:', Object.keys(window.XLSX).slice(0, 10));
      throw new Error('Excel library loaded but API is incompatible.');
    }

    var blocks = parseBlocks(markdown);
    var tables = blocks.filter(function (b) { return b.type === 'table'; });
    if (tables.length === 0) throw new Error('No tables found in the response to export.');

    console.log('[exporter] Found ' + tables.length + ' tables');

    var wb = window.XLSX.utils.book_new();

    for (var ti = 0; ti < tables.length; ti++) {
      var tbl = tables[ti];
      var sheetData = [tbl.headers.map(stripInline)];
      for (var ri = 0; ri < tbl.rows.length; ri++) {
        var row = [];
        for (var ci = 0; ci < tbl.headers.length; ci++) {
          row.push(stripInline(tbl.rows[ri][ci] || ''));
        }
        sheetData.push(row);
      }

      var ws = window.XLSX.utils.aoa_to_sheet(sheetData);

      // Auto-width columns
      ws['!cols'] = tbl.headers.map(function (h, idx) {
        var max = stripInline(h).length;
        for (var r = 0; r < tbl.rows.length; r++) {
          var v = stripInline(tbl.rows[r][idx] || '').length;
          if (v > max) max = v;
        }
        return { wch: Math.min(Math.max(max + 2, 10), 50) };
      });

      // Sheet name: try to find a nearby heading
      var sheetName = 'Table ' + (ti + 1);
      var lastH = null;
      for (var bj = 0; bj < blocks.length; bj++) {
        if (blocks[bj] === tbl) break;
        if (blocks[bj].type && blocks[bj].type.startsWith('h')) lastH = blocks[bj].content;
      }
      if (lastH) {
        sheetName = stripInline(lastH).substring(0, 28).replace(/[\\\/\*\?:\[\]]/g, '') || sheetName;
      }

      window.XLSX.utils.book_append_sheet(wb, ws, sheetName);
      console.log('[exporter] Sheet "' + sheetName + '": ' + tbl.rows.length + ' rows, ' + tbl.headers.length + ' cols');
    }

    var filename = sanitizeFilename(title || 'GRC-Tables') + '.xlsx';
    window.XLSX.writeFile(wb, filename);
    console.log('[exporter] Excel downloaded: ' + filename + ' (' + tables.length + ' sheets)');
    return filename;
  }

  // ============ PUBLIC API ============

  window.exporter = {
    copyText: copyText,
    exportWord: exportWord,
    exportPdf: exportPdf,
    exportExcel: exportExcel,
    hasTable: hasTable,
    inferTitle: inferTitle,
    parseBlocks: parseBlocks,
  };

  console.log('[exporter] Module loaded');
})(window);
