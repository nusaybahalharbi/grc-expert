/**
 * GRC Expert — Export Module v2.2
 *
 * FIXES:
 *  - Correct library global detection: window.docx, window.jspdf.jsPDF
 *  - Robust fallback if library missing
 *  - Startup log of available libraries
 *  - Clean PDF generation with autoTable
 *  - Proper docx Document/Packer API
 *  - Excel multi-sheet export
 *
 * Public API:
 *   exporter.copyText(markdown)
 *   exporter.exportWord(markdown, title)
 *   exporter.exportPdf(markdown, title)
 *   exporter.exportExcel(markdown, title)
 *   exporter.hasTable(markdown)
 *   exporter.inferTitle(markdown)
 *   exporter.ready  — {word, pdf, excel, copy}
 */

(function (window) {
  'use strict';

  // ============ LIBRARY AVAILABILITY ============
  var ready = {
    copy: true,
    word: false,
    pdf: false,
    excel: false,
  };

  // These are checked on first use AND at init.
  function checkLibs() {
    ready.word = !!(window.docx && window.docx.Document && window.docx.Packer);
    ready.pdf = !!(window.jspdf && window.jspdf.jsPDF);
    ready.excel = !!(window.XLSX);
    return ready;
  }

  // Log at first call (libraries load async with defer)
  var _loggedOnce = false;
  function logLibStatus() {
    if (_loggedOnce) return;
    _loggedOnce = true;
    checkLibs();
    console.log('[exporter] Library status:', JSON.stringify(ready));
  }

  // ============ COPY ============
  async function copyText(text) {
    logLibStatus();
    try {
      await navigator.clipboard.writeText(text);
      console.log('[exporter] Copied to clipboard');
      return true;
    } catch (e) {
      var ta = document.createElement('textarea');
      ta.value = text;
      ta.style.cssText = 'position:fixed;opacity:0;left:-9999px';
      document.body.appendChild(ta);
      ta.select();
      var ok = false;
      try { ok = document.execCommand('copy'); } catch (_) {}
      document.body.removeChild(ta);
      return ok;
    }
  }

  // ============ MARKDOWN PARSER ============

  function parseMarkdownToBlocks(md) {
    var lines = md.split('\n');
    var blocks = [];
    var i = 0;

    while (i < lines.length) {
      var line = lines[i];
      var trimmed = line.trim();

      if (!trimmed) { i++; continue; }

      // Headings (check longest first)
      var h4 = trimmed.match(/^####\s+(.+)$/);
      var h3 = trimmed.match(/^###\s+(.+)$/);
      var h2 = trimmed.match(/^##\s+(.+)$/);
      var h1 = trimmed.match(/^#\s+(.+)$/);
      if (h4) { blocks.push({ type: 'h4', content: h4[1] }); i++; continue; }
      if (h3) { blocks.push({ type: 'h3', content: h3[1] }); i++; continue; }
      if (h2) { blocks.push({ type: 'h2', content: h2[1] }); i++; continue; }
      if (h1) { blocks.push({ type: 'h1', content: h1[1] }); i++; continue; }

      // HR
      if (/^[-*_]{3,}$/.test(trimmed)) { blocks.push({ type: 'hr' }); i++; continue; }

      // Table
      if (trimmed.startsWith('|') && i + 1 < lines.length && /^\s*\|[\s\-|:]+\|\s*$/.test(lines[i + 1])) {
        var headers = trimmed.split('|').slice(1, -1).map(function(c) { return c.trim(); });
        i += 2;
        var rows = [];
        while (i < lines.length && lines[i].trim().startsWith('|')) {
          var cells = lines[i].split('|').slice(1, -1).map(function(c) { return c.trim(); });
          rows.push(cells);
          i++;
        }
        blocks.push({ type: 'table', headers: headers, rows: rows });
        continue;
      }

      // Code block
      if (trimmed.startsWith('```')) {
        i++;
        var codeLines = [];
        while (i < lines.length && !lines[i].trim().startsWith('```')) {
          codeLines.push(lines[i]);
          i++;
        }
        i++;
        blocks.push({ type: 'code', content: codeLines.join('\n') });
        continue;
      }

      // Blockquote
      if (trimmed.startsWith('>')) {
        var quoteLines = [];
        while (i < lines.length && lines[i].trim().startsWith('>')) {
          quoteLines.push(lines[i].trim().replace(/^>\s?/, ''));
          i++;
        }
        blocks.push({ type: 'quote', content: quoteLines.join(' ') });
        continue;
      }

      // Unordered list
      if (/^[-*+]\s+/.test(trimmed)) {
        var ulItems = [];
        while (i < lines.length && /^\s*[-*+]\s+/.test(lines[i])) {
          ulItems.push(lines[i].replace(/^\s*[-*+]\s+/, ''));
          i++;
        }
        blocks.push({ type: 'ul', items: ulItems });
        continue;
      }

      // Ordered list
      if (/^\d+\.\s+/.test(trimmed)) {
        var olItems = [];
        while (i < lines.length && /^\s*\d+\.\s+/.test(lines[i])) {
          olItems.push(lines[i].replace(/^\s*\d+\.\s+/, ''));
          i++;
        }
        blocks.push({ type: 'ol', items: olItems });
        continue;
      }

      // Paragraph
      var paraLines = [trimmed];
      i++;
      while (i < lines.length && lines[i].trim() && !_isBlockStart(lines[i])) {
        paraLines.push(lines[i].trim());
        i++;
      }
      blocks.push({ type: 'p', content: paraLines.join(' ') });
    }

    return blocks;
  }

  function _isBlockStart(line) {
    var t = line.trim();
    return /^#+\s/.test(t) || t.startsWith('|') || t.startsWith('```') || t.startsWith('>') || /^[-*+]\s/.test(t) || /^\d+\.\s/.test(t) || /^[-*_]{3,}$/.test(t);
  }

  function stripInline(text) {
    if (!text) return '';
    return String(text)
      .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '$1')
      .replace(/\*\*([^*]+)\*\*/g, '$1')
      .replace(/\*([^*]+)\*/g, '$1')
      .replace(/`([^`]+)`/g, '$1');
  }

  function hasTable(markdown) {
    if (!markdown) return false;
    var lines = markdown.split('\n');
    for (var i = 0; i < lines.length - 1; i++) {
      if (lines[i].trim().startsWith('|') && /^\s*\|[\s\-|:]+\|\s*$/.test(lines[i + 1])) {
        return true;
      }
    }
    return false;
  }

  function getTables(markdown) {
    return parseMarkdownToBlocks(markdown).filter(function(b) { return b.type === 'table'; });
  }

  function inferTitle(markdown) {
    if (!markdown) return null;
    var lines = markdown.split('\n');
    for (var j = 0; j < lines.length; j++) {
      var h = lines[j].trim().match(/^#+\s+(.+)$/);
      if (h) return h[1].replace(/\*\*/g, '').replace(/\*/g, '').trim();
    }
    return null;
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
    setTimeout(function() { URL.revokeObjectURL(url); }, 2000);
  }

  // ============ WORD EXPORT ============

  async function exportWord(markdown, title) {
    logLibStatus();
    checkLibs();
    if (!ready.word) {
      throw new Error('Word export library (docx) not loaded. Please refresh the page and try again.');
    }

    console.log('[exporter] Generating Word document...');
    var D = window.docx;
    var blocks = parseMarkdownToBlocks(markdown);
    var children = [];

    if (title) {
      children.push(new D.Paragraph({
        children: [new D.TextRun({ text: title, bold: true, size: 36 })],
        heading: D.HeadingLevel.TITLE,
        spacing: { after: 200 },
      }));
    }

    for (var bi = 0; bi < blocks.length; bi++) {
      var block = blocks[bi];

      if (block.type === 'h1' || block.type === 'h2' || block.type === 'h3' || block.type === 'h4') {
        var headingMap = { h1: D.HeadingLevel.HEADING_1, h2: D.HeadingLevel.HEADING_2, h3: D.HeadingLevel.HEADING_3, h4: D.HeadingLevel.HEADING_4 };
        var sizeMap = { h1: 32, h2: 28, h3: 24, h4: 22 };
        children.push(new D.Paragraph({
          children: [new D.TextRun({ text: stripInline(block.content), bold: true, size: sizeMap[block.type] })],
          heading: headingMap[block.type],
          spacing: { before: 200, after: 100 },
        }));
      } else if (block.type === 'p') {
        children.push(new D.Paragraph({
          children: [new D.TextRun({ text: stripInline(block.content) })],
          spacing: { after: 120 },
        }));
      } else if (block.type === 'ul') {
        for (var ui = 0; ui < block.items.length; ui++) {
          children.push(new D.Paragraph({
            children: [new D.TextRun({ text: stripInline(block.items[ui]) })],
            bullet: { level: 0 },
            spacing: { after: 60 },
          }));
        }
      } else if (block.type === 'ol') {
        for (var oi = 0; oi < block.items.length; oi++) {
          children.push(new D.Paragraph({
            children: [new D.TextRun({ text: (oi + 1) + '. ' + stripInline(block.items[oi]) })],
            spacing: { after: 60 },
          }));
        }
      } else if (block.type === 'table') {
        var borderStyle = { style: D.BorderStyle.SINGLE, size: 4, color: '999999' };
        var border = { top: borderStyle, bottom: borderStyle, left: borderStyle, right: borderStyle };
        var tblRows = [];

        // Header row
        tblRows.push(new D.TableRow({
          tableHeader: true,
          children: block.headers.map(function(h) {
            return new D.TableCell({
              children: [new D.Paragraph({ children: [new D.TextRun({ text: stripInline(h), bold: true, size: 18, color: 'FFFFFF' })] })],
              shading: { fill: '0EA5E9' },
              borders: border,
            });
          }),
        }));

        // Data rows
        for (var ri = 0; ri < block.rows.length; ri++) {
          tblRows.push(new D.TableRow({
            children: block.headers.map(function(_, ci) {
              return new D.TableCell({
                children: [new D.Paragraph({ children: [new D.TextRun({ text: stripInline(block.rows[ri][ci] || ''), size: 18 })] })],
                borders: border,
              });
            }),
          }));
        }

        children.push(new D.Table({
          rows: tblRows,
          width: { size: 100, type: D.WidthType.PERCENTAGE },
        }));
        children.push(new D.Paragraph({ children: [new D.TextRun({ text: '' })], spacing: { after: 120 } }));
      } else if (block.type === 'code') {
        children.push(new D.Paragraph({
          children: [new D.TextRun({ text: block.content, font: 'Consolas', size: 18 })],
          spacing: { after: 120 },
        }));
      } else if (block.type === 'quote') {
        children.push(new D.Paragraph({
          children: [new D.TextRun({ text: stripInline(block.content), italics: true })],
          indent: { left: 400 },
          spacing: { after: 120 },
        }));
      }
    }

    var doc = new D.Document({
      creator: 'GRC Expert',
      title: title || 'GRC Document',
      sections: [{ properties: {}, children: children }],
    });

    var blob = await D.Packer.toBlob(doc);
    var filename = sanitizeFilename(title) + '.docx';
    triggerDownload(blob, filename);
    console.log('[exporter] Word saved: ' + filename);
    return filename;
  }

  // ============ PDF EXPORT ============

  async function exportPdf(markdown, title) {
    logLibStatus();
    checkLibs();
    if (!ready.pdf) {
      throw new Error('PDF export library (jsPDF) not loaded. Please refresh the page and try again.');
    }

    console.log('[exporter] Generating PDF...');
    var jsPDF = window.jspdf.jsPDF;
    var doc = new jsPDF({ unit: 'pt', format: 'a4' });

    var pageW = doc.internal.pageSize.width;
    var pageH = doc.internal.pageSize.height;
    var m = 40;
    var usable = pageW - m * 2;
    var y = m;

    function checkPage(needed) {
      if (y + (needed || 20) > pageH - m) { doc.addPage(); y = m; }
    }

    // Title
    if (title) {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(20);
      doc.setTextColor(14, 165, 233);
      var tLines = doc.splitTextToSize(stripInline(title), usable);
      tLines.forEach(function(l) { checkPage(24); doc.text(l, m, y); y += 24; });
      y += 10;
      doc.setTextColor(0);
    }

    var blocks = parseMarkdownToBlocks(markdown);

    for (var bi = 0; bi < blocks.length; bi++) {
      var b = blocks[bi];

      if (b.type === 'h1' || b.type === 'h2' || b.type === 'h3' || b.type === 'h4') {
        var sizes = { h1: 18, h2: 15, h3: 13, h4: 12 };
        var lh = { h1: 22, h2: 20, h3: 18, h4: 16 };
        y += 6;
        checkPage(lh[b.type] + 4);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(sizes[b.type]);
        if (b.type === 'h1' || b.type === 'h2') doc.setTextColor(14, 165, 233);
        var hLines = doc.splitTextToSize(stripInline(b.content), usable);
        hLines.forEach(function(l) { checkPage(lh[b.type]); doc.text(l, m, y); y += lh[b.type]; });
        doc.setTextColor(0);
        y += 4;
      } else if (b.type === 'p') {
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(10.5);
        var pLines = doc.splitTextToSize(stripInline(b.content), usable);
        pLines.forEach(function(l) { checkPage(14); doc.text(l, m, y); y += 14; });
        y += 4;
      } else if (b.type === 'ul' || b.type === 'ol') {
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(10.5);
        var items = b.items;
        for (var ii = 0; ii < items.length; ii++) {
          var prefix = b.type === 'ol' ? (ii + 1) + '. ' : '• ';
          var iLines = doc.splitTextToSize(prefix + stripInline(items[ii]), usable - 12);
          iLines.forEach(function(l) { checkPage(13); doc.text(l, m + 12, y); y += 13; });
        }
        y += 4;
      } else if (b.type === 'table' && typeof doc.autoTable === 'function') {
        doc.autoTable({
          head: [b.headers.map(stripInline)],
          body: b.rows.map(function(r) { return r.map(stripInline); }),
          startY: y,
          margin: { left: m, right: m },
          styles: { fontSize: 8.5, cellPadding: 4, overflow: 'linebreak' },
          headStyles: { fillColor: [14, 165, 233], textColor: [255, 255, 255], fontStyle: 'bold' },
          alternateRowStyles: { fillColor: [245, 250, 255] },
          theme: 'grid',
        });
        y = doc.lastAutoTable.finalY + 10;
      } else if (b.type === 'table') {
        // Fallback: text table
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(9);
        checkPage(14);
        doc.text(b.headers.join(' | '), m, y);
        y += 14;
        doc.setFont('helvetica', 'normal');
        for (var tr = 0; tr < b.rows.length; tr++) {
          var txt = b.rows[tr].map(stripInline).join(' | ');
          var tl = doc.splitTextToSize(txt, usable);
          tl.forEach(function(l) { checkPage(12); doc.text(l, m, y); y += 12; });
        }
        y += 6;
      } else if (b.type === 'code') {
        doc.setFont('courier', 'normal');
        doc.setFontSize(9);
        b.content.split('\n').forEach(function(cl) {
          var wl = doc.splitTextToSize(cl, usable);
          wl.forEach(function(l) { checkPage(12); doc.text(l, m, y); y += 12; });
        });
        y += 6;
      } else if (b.type === 'quote') {
        doc.setFont('helvetica', 'italic');
        doc.setFontSize(10);
        var ql = doc.splitTextToSize(stripInline(b.content), usable - 20);
        ql.forEach(function(l) { checkPage(13); doc.text(l, m + 20, y); y += 13; });
        y += 4;
      } else if (b.type === 'hr') {
        checkPage(10);
        doc.setDrawColor(180);
        doc.line(m, y, pageW - m, y);
        y += 10;
      }
    }

    // Footer
    var totalPages = doc.internal.getNumberOfPages();
    for (var p = 1; p <= totalPages; p++) {
      doc.setPage(p);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      doc.setTextColor(150);
      doc.text('GRC Expert · Page ' + p + ' of ' + totalPages, pageW / 2, pageH - 20, { align: 'center' });
      doc.setTextColor(0);
    }

    var filename = sanitizeFilename(title) + '.pdf';
    doc.save(filename);
    console.log('[exporter] PDF saved: ' + filename);
    return filename;
  }

  // ============ EXCEL EXPORT ============

  async function exportExcel(markdown, title) {
    logLibStatus();
    checkLibs();
    if (!ready.excel) {
      throw new Error('Excel export library (SheetJS) not loaded. Please refresh the page and try again.');
    }

    console.log('[exporter] Generating Excel...');
    var tables = getTables(markdown);
    if (tables.length === 0) {
      throw new Error('No tables found in the response to export.');
    }

    var wb = XLSX.utils.book_new();
    var blocks = parseMarkdownToBlocks(markdown);

    for (var ti = 0; ti < tables.length; ti++) {
      var tbl = tables[ti];
      var sheetData = [
        tbl.headers.map(stripInline),
      ];
      for (var ri = 0; ri < tbl.rows.length; ri++) {
        sheetData.push(tbl.headers.map(function(_, ci) {
          return stripInline(tbl.rows[ri][ci] || '');
        }));
      }

      var ws = XLSX.utils.aoa_to_sheet(sheetData);

      // Auto-width
      ws['!cols'] = tbl.headers.map(function(h, ci) {
        var max = h.length;
        for (var r = 0; r < tbl.rows.length; r++) {
          var v = stripInline(tbl.rows[r][ci] || '');
          if (v.length > max) max = v.length;
        }
        return { wch: Math.min(Math.max(max + 2, 10), 50) };
      });

      // Sheet name from nearest heading
      var sheetName = 'Table ' + (ti + 1);
      var lastHeading = null;
      for (var bj = 0; bj < blocks.length; bj++) {
        if (blocks[bj] === tbl) break;
        if (blocks[bj].type === 'h1' || blocks[bj].type === 'h2' || blocks[bj].type === 'h3') {
          lastHeading = blocks[bj].content;
        }
      }
      if (lastHeading) {
        sheetName = stripInline(lastHeading).substring(0, 28).replace(/[\\\/\*\?:\[\]]/g, '');
      }

      XLSX.utils.book_append_sheet(wb, ws, sheetName);
    }

    var filename = sanitizeFilename(title || 'GRC-Tables') + '.xlsx';
    XLSX.writeFile(wb, filename);
    console.log('[exporter] Excel saved: ' + filename + ' (' + tables.length + ' sheets)');
    return filename;
  }

  // ============ EXPORT ============
  window.exporter = {
    copyText: copyText,
    exportWord: exportWord,
    exportPdf: exportPdf,
    exportExcel: exportExcel,
    hasTable: hasTable,
    inferTitle: inferTitle,
    parseMarkdownToBlocks: parseMarkdownToBlocks,
    get ready() { checkLibs(); return ready; },
  };

  console.log('[exporter] Module loaded');
})(window);
