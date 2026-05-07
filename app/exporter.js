/**
 * GRC Expert — Export Module
 *
 * Provides:
 *   - Copy markdown to clipboard
 *   - Export to Word (.docx) — using docx library
 *   - Export to PDF — using browser print or jsPDF
 *   - Export tables to Excel (.xlsx) — using SheetJS
 *
 * Public API:
 *   exporter.copyText(markdown)
 *   exporter.exportWord(markdown, title)
 *   exporter.exportPdf(markdown, title)
 *   exporter.exportExcel(markdown, title) — extracts all tables from markdown
 *   exporter.hasTable(markdown) — true if markdown has at least one table
 */

(function (window) {
  'use strict';

  // ============ COPY ============
  async function copyText(text) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch (e) {
      // fallback for older browsers
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      let ok = false;
      try { ok = document.execCommand('copy'); } catch (_) {}
      document.body.removeChild(ta);
      return ok;
    }
  }

  // ============ MARKDOWN PARSING (for export use) ============

  /**
   * Parse markdown into structured blocks for export.
   * Returns an array of: {type, content, ...}
   *   type: 'h1'|'h2'|'h3'|'h4'|'p'|'ul'|'ol'|'table'|'code'|'quote'|'hr'
   */
  function parseMarkdownToBlocks(md) {
    const lines = md.split('\n');
    const blocks = [];
    let i = 0;

    while (i < lines.length) {
      const line = lines[i];
      const trimmed = line.trim();

      // Skip empty lines
      if (!trimmed) { i++; continue; }

      // Headings
      const h1 = trimmed.match(/^#\s+(.+)$/);
      const h2 = trimmed.match(/^##\s+(.+)$/);
      const h3 = trimmed.match(/^###\s+(.+)$/);
      const h4 = trimmed.match(/^####\s+(.+)$/);
      if (h4) { blocks.push({ type: 'h4', content: h4[1] }); i++; continue; }
      if (h3) { blocks.push({ type: 'h3', content: h3[1] }); i++; continue; }
      if (h2) { blocks.push({ type: 'h2', content: h2[1] }); i++; continue; }
      if (h1) { blocks.push({ type: 'h1', content: h1[1] }); i++; continue; }

      // Horizontal rule
      if (/^[-*_]{3,}$/.test(trimmed)) {
        blocks.push({ type: 'hr' });
        i++; continue;
      }

      // Tables: line starts with | and next line is separator
      if (trimmed.startsWith('|') && i + 1 < lines.length && /^\s*\|[\s\-|:]+\|\s*$/.test(lines[i + 1])) {
        const headers = trimmed.split('|').slice(1, -1).map(c => c.trim());
        i += 2;
        const rows = [];
        while (i < lines.length && lines[i].trim().startsWith('|')) {
          const cells = lines[i].split('|').slice(1, -1).map(c => c.trim());
          rows.push(cells);
          i++;
        }
        blocks.push({ type: 'table', headers, rows });
        continue;
      }

      // Code block
      if (trimmed.startsWith('```')) {
        const lang = trimmed.substring(3).trim();
        i++;
        const codeLines = [];
        while (i < lines.length && !lines[i].trim().startsWith('```')) {
          codeLines.push(lines[i]);
          i++;
        }
        i++; // skip closing ```
        blocks.push({ type: 'code', lang, content: codeLines.join('\n') });
        continue;
      }

      // Blockquote
      if (trimmed.startsWith('>')) {
        const quoteLines = [];
        while (i < lines.length && lines[i].trim().startsWith('>')) {
          quoteLines.push(lines[i].trim().replace(/^>\s?/, ''));
          i++;
        }
        blocks.push({ type: 'quote', content: quoteLines.join(' ') });
        continue;
      }

      // Unordered list
      if (/^[-*+]\s+/.test(trimmed)) {
        const items = [];
        while (i < lines.length && /^\s*[-*+]\s+/.test(lines[i])) {
          items.push(lines[i].replace(/^\s*[-*+]\s+/, ''));
          i++;
        }
        blocks.push({ type: 'ul', items });
        continue;
      }

      // Ordered list
      if (/^\d+\.\s+/.test(trimmed)) {
        const items = [];
        while (i < lines.length && /^\s*\d+\.\s+/.test(lines[i])) {
          items.push(lines[i].replace(/^\s*\d+\.\s+/, ''));
          i++;
        }
        blocks.push({ type: 'ol', items });
        continue;
      }

      // Paragraph (collect until blank line or block element)
      const paraLines = [trimmed];
      i++;
      while (i < lines.length && lines[i].trim() && !isBlockStart(lines[i])) {
        paraLines.push(lines[i].trim());
        i++;
      }
      blocks.push({ type: 'p', content: paraLines.join(' ') });
    }

    return blocks;
  }

  function isBlockStart(line) {
    const t = line.trim();
    if (/^#+\s/.test(t)) return true;
    if (t.startsWith('|')) return true;
    if (t.startsWith('```')) return true;
    if (t.startsWith('>')) return true;
    if (/^[-*+]\s/.test(t)) return true;
    if (/^\d+\.\s/.test(t)) return true;
    if (/^[-*_]{3,}$/.test(t)) return true;
    return false;
  }

  /**
   * Parse inline formatting: **bold**, *italic*, `code`
   * Returns array of: {text, bold?, italic?, code?}
   */
  function parseInline(text) {
    if (!text) return [{ text: '' }];
    const result = [];
    // Strip markdown links [text](url) -> "text (url)"
    text = text.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '$1 ($2)');

    const regex = /(\*\*[^*]+\*\*|\*[^*\n]+\*|`[^`]+`)/g;
    let lastIdx = 0;
    let match;
    while ((match = regex.exec(text)) !== null) {
      if (match.index > lastIdx) {
        result.push({ text: text.substring(lastIdx, match.index) });
      }
      const m = match[0];
      if (m.startsWith('**')) {
        result.push({ text: m.slice(2, -2), bold: true });
      } else if (m.startsWith('*')) {
        result.push({ text: m.slice(1, -1), italic: true });
      } else if (m.startsWith('`')) {
        result.push({ text: m.slice(1, -1), code: true });
      }
      lastIdx = regex.lastIndex;
    }
    if (lastIdx < text.length) {
      result.push({ text: text.substring(lastIdx) });
    }
    return result.length === 0 ? [{ text }] : result;
  }

  // ============ HAS TABLE ============
  function hasTable(markdown) {
    const lines = markdown.split('\n');
    for (let i = 0; i < lines.length - 1; i++) {
      if (lines[i].trim().startsWith('|') && /^\s*\|[\s\-|:]+\|\s*$/.test(lines[i + 1])) {
        return true;
      }
    }
    return false;
  }

  function getTables(markdown) {
    const blocks = parseMarkdownToBlocks(markdown);
    return blocks.filter(b => b.type === 'table');
  }

  // ============ WORD EXPORT (.docx) ============

  async function exportWord(markdown, title) {
    if (!window.docx) {
      throw new Error('docx library not loaded');
    }
    const { Document, Packer, Paragraph, TextRun, HeadingLevel, Table, TableRow, TableCell, WidthType, AlignmentType, BorderStyle } = window.docx;

    const blocks = parseMarkdownToBlocks(markdown);
    const docChildren = [];

    // Add title
    if (title) {
      docChildren.push(new Paragraph({
        children: [new TextRun({ text: title, bold: true, size: 36 })],
        heading: HeadingLevel.TITLE,
        spacing: { after: 200 },
      }));
    }

    for (const block of blocks) {
      if (block.type === 'h1') {
        docChildren.push(new Paragraph({
          children: [new TextRun({ text: block.content, bold: true, size: 32 })],
          heading: HeadingLevel.HEADING_1,
          spacing: { before: 200, after: 100 },
        }));
      } else if (block.type === 'h2') {
        docChildren.push(new Paragraph({
          children: [new TextRun({ text: block.content, bold: true, size: 28 })],
          heading: HeadingLevel.HEADING_2,
          spacing: { before: 200, after: 100 },
        }));
      } else if (block.type === 'h3') {
        docChildren.push(new Paragraph({
          children: [new TextRun({ text: block.content, bold: true, size: 24 })],
          heading: HeadingLevel.HEADING_3,
          spacing: { before: 150, after: 80 },
        }));
      } else if (block.type === 'h4') {
        docChildren.push(new Paragraph({
          children: [new TextRun({ text: block.content, bold: true, size: 22 })],
          heading: HeadingLevel.HEADING_4,
          spacing: { before: 100, after: 60 },
        }));
      } else if (block.type === 'p') {
        const runs = parseInline(block.content).map(seg =>
          new TextRun({
            text: seg.text,
            bold: !!seg.bold,
            italics: !!seg.italic,
            font: seg.code ? 'Consolas' : undefined,
          })
        );
        docChildren.push(new Paragraph({
          children: runs,
          spacing: { after: 120 },
        }));
      } else if (block.type === 'ul') {
        for (const item of block.items) {
          const runs = parseInline(item).map(seg =>
            new TextRun({ text: seg.text, bold: !!seg.bold, italics: !!seg.italic })
          );
          docChildren.push(new Paragraph({
            children: runs,
            bullet: { level: 0 },
            spacing: { after: 60 },
          }));
        }
      } else if (block.type === 'ol') {
        for (let idx = 0; idx < block.items.length; idx++) {
          const runs = parseInline(block.items[idx]).map(seg =>
            new TextRun({ text: seg.text, bold: !!seg.bold, italics: !!seg.italic })
          );
          docChildren.push(new Paragraph({
            children: [new TextRun({ text: `${idx + 1}. `, bold: false }), ...runs],
            spacing: { after: 60 },
          }));
        }
      } else if (block.type === 'table') {
        // Build a Word table
        const border = {
          top: { style: BorderStyle.SINGLE, size: 4, color: '888888' },
          bottom: { style: BorderStyle.SINGLE, size: 4, color: '888888' },
          left: { style: BorderStyle.SINGLE, size: 4, color: '888888' },
          right: { style: BorderStyle.SINGLE, size: 4, color: '888888' },
        };
        const headerRow = new TableRow({
          tableHeader: true,
          children: block.headers.map(h => new TableCell({
            children: [new Paragraph({
              children: [new TextRun({ text: h, bold: true, size: 20, color: 'FFFFFF' })],
            })],
            shading: { fill: '0EA5E9' },
            borders: border,
          })),
        });
        const dataRows = block.rows.map(row => new TableRow({
          children: block.headers.map((_, idx) => new TableCell({
            children: [new Paragraph({
              children: parseInline(row[idx] || '').map(seg =>
                new TextRun({ text: seg.text, bold: !!seg.bold, italics: !!seg.italic, size: 18 })
              ),
            })],
            borders: border,
          })),
        }));
        docChildren.push(new Table({
          rows: [headerRow, ...dataRows],
          width: { size: 100, type: WidthType.PERCENTAGE },
        }));
        docChildren.push(new Paragraph({ children: [new TextRun('')], spacing: { after: 120 } }));
      } else if (block.type === 'code') {
        docChildren.push(new Paragraph({
          children: [new TextRun({ text: block.content, font: 'Consolas', size: 18 })],
          shading: { fill: 'F1F5F9' },
          spacing: { after: 120 },
        }));
      } else if (block.type === 'quote') {
        docChildren.push(new Paragraph({
          children: [new TextRun({ text: block.content, italics: true })],
          indent: { left: 400 },
          spacing: { after: 120 },
        }));
      } else if (block.type === 'hr') {
        docChildren.push(new Paragraph({
          children: [new TextRun({ text: '_'.repeat(60) })],
          spacing: { before: 100, after: 100 },
        }));
      }
    }

    const doc = new Document({
      creator: 'GRC Expert',
      title: title || 'GRC Document',
      sections: [{
        properties: {
          page: {
            margin: { top: 1000, right: 1000, bottom: 1000, left: 1000 },
          },
        },
        children: docChildren,
      }],
    });

    const blob = await Packer.toBlob(doc);
    const filename = sanitizeFilename(title || 'GRC-Document') + '.docx';
    triggerDownload(blob, filename);
    return filename;
  }

  // ============ PDF EXPORT ============

  async function exportPdf(markdown, title) {
    // Use jsPDF + autotable
    if (!window.jspdf) {
      throw new Error('jsPDF library not loaded');
    }
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ unit: 'pt', format: 'a4', putOnlyUsedFonts: true });

    const pageWidth = doc.internal.pageSize.width;
    const pageHeight = doc.internal.pageSize.height;
    const margin = 40;
    const usableWidth = pageWidth - margin * 2;

    let y = margin;

    function checkPage(needed = 20) {
      if (y + needed > pageHeight - margin) {
        doc.addPage();
        y = margin;
      }
    }

    // Title
    if (title) {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(20);
      doc.setTextColor(14, 165, 233);
      const lines = doc.splitTextToSize(title, usableWidth);
      for (const line of lines) {
        checkPage(24);
        doc.text(line, margin, y);
        y += 24;
      }
      y += 10;
      doc.setTextColor(0);
    }

    const blocks = parseMarkdownToBlocks(markdown);

    for (const block of blocks) {
      if (block.type === 'h1') {
        y += 8;
        checkPage(28);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(18);
        doc.setTextColor(14, 165, 233);
        const lines = doc.splitTextToSize(block.content, usableWidth);
        for (const line of lines) {
          checkPage(22);
          doc.text(line, margin, y);
          y += 22;
        }
        doc.setTextColor(0);
        y += 6;
      } else if (block.type === 'h2') {
        y += 6;
        checkPage(24);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(15);
        doc.setTextColor(14, 165, 233);
        const lines = doc.splitTextToSize(block.content, usableWidth);
        for (const line of lines) {
          checkPage(20);
          doc.text(line, margin, y);
          y += 20;
        }
        doc.setTextColor(0);
        y += 4;
      } else if (block.type === 'h3') {
        checkPage(20);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(13);
        const lines = doc.splitTextToSize(block.content, usableWidth);
        for (const line of lines) {
          checkPage(18);
          doc.text(line, margin, y);
          y += 18;
        }
        y += 3;
      } else if (block.type === 'h4') {
        checkPage(18);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(12);
        const lines = doc.splitTextToSize(block.content, usableWidth);
        for (const line of lines) {
          checkPage(16);
          doc.text(line, margin, y);
          y += 16;
        }
      } else if (block.type === 'p') {
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(10.5);
        const plain = stripInline(block.content);
        const lines = doc.splitTextToSize(plain, usableWidth);
        for (const line of lines) {
          checkPage(14);
          doc.text(line, margin, y);
          y += 14;
        }
        y += 4;
      } else if (block.type === 'ul') {
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(10.5);
        for (const item of block.items) {
          const plain = stripInline(item);
          const lines = doc.splitTextToSize('• ' + plain, usableWidth - 12);
          for (const line of lines) {
            checkPage(13);
            doc.text(line, margin + 12, y);
            y += 13;
          }
        }
        y += 4;
      } else if (block.type === 'ol') {
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(10.5);
        for (let idx = 0; idx < block.items.length; idx++) {
          const plain = stripInline(block.items[idx]);
          const lines = doc.splitTextToSize(`${idx + 1}. ${plain}`, usableWidth - 12);
          for (const line of lines) {
            checkPage(13);
            doc.text(line, margin + 12, y);
            y += 13;
          }
        }
        y += 4;
      } else if (block.type === 'table') {
        // Use autoTable if available
        if (doc.autoTable) {
          doc.autoTable({
            head: [block.headers],
            body: block.rows.map(r => r.map(c => stripInline(c))),
            startY: y,
            margin: { left: margin, right: margin },
            styles: { fontSize: 8.5, cellPadding: 4, overflow: 'linebreak' },
            headStyles: { fillColor: [14, 165, 233], textColor: [255, 255, 255], fontStyle: 'bold' },
            alternateRowStyles: { fillColor: [245, 250, 255] },
            theme: 'grid',
          });
          y = doc.lastAutoTable.finalY + 10;
        } else {
          // Fallback: render as text
          doc.setFont('helvetica', 'bold');
          doc.setFontSize(9);
          checkPage(14);
          doc.text(block.headers.join(' | '), margin, y);
          y += 14;
          doc.setFont('helvetica', 'normal');
          for (const row of block.rows) {
            const text = row.map(c => stripInline(c)).join(' | ');
            const lines = doc.splitTextToSize(text, usableWidth);
            for (const line of lines) {
              checkPage(12);
              doc.text(line, margin, y);
              y += 12;
            }
          }
          y += 6;
        }
      } else if (block.type === 'code') {
        doc.setFont('courier', 'normal');
        doc.setFontSize(9);
        const lines = block.content.split('\n');
        for (const line of lines) {
          const wrapped = doc.splitTextToSize(line, usableWidth);
          for (const w of wrapped) {
            checkPage(12);
            doc.text(w, margin, y);
            y += 12;
          }
        }
        y += 6;
      } else if (block.type === 'quote') {
        doc.setFont('helvetica', 'italic');
        doc.setFontSize(10);
        const plain = stripInline(block.content);
        const lines = doc.splitTextToSize(plain, usableWidth - 20);
        for (const line of lines) {
          checkPage(13);
          doc.text(line, margin + 20, y);
          y += 13;
        }
        y += 4;
      } else if (block.type === 'hr') {
        checkPage(10);
        doc.setDrawColor(150);
        doc.line(margin, y, pageWidth - margin, y);
        y += 10;
      }
    }

    // Footer on each page
    const totalPages = doc.internal.getNumberOfPages();
    for (let p = 1; p <= totalPages; p++) {
      doc.setPage(p);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      doc.setTextColor(120);
      doc.text(`GRC Expert · Page ${p} of ${totalPages}`, pageWidth / 2, pageHeight - 20, { align: 'center' });
      doc.setTextColor(0);
    }

    const filename = sanitizeFilename(title || 'GRC-Document') + '.pdf';
    doc.save(filename);
    return filename;
  }

  function stripInline(text) {
    if (!text) return '';
    return String(text)
      .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '$1')
      .replace(/\*\*([^*]+)\*\*/g, '$1')
      .replace(/\*([^*]+)\*/g, '$1')
      .replace(/`([^`]+)`/g, '$1');
  }

  // ============ EXCEL EXPORT (.xlsx) ============

  async function exportExcel(markdown, title) {
    if (!window.XLSX) {
      throw new Error('SheetJS not loaded');
    }

    const tables = getTables(markdown);
    if (tables.length === 0) {
      throw new Error('No tables found in the response');
    }

    const wb = XLSX.utils.book_new();

    tables.forEach((tbl, idx) => {
      // Build sheet data: first row = headers, rest = data rows
      const sheetData = [
        tbl.headers,
        ...tbl.rows.map(row => tbl.headers.map((_, i) => stripInline(row[i] || ''))),
      ];

      const ws = XLSX.utils.aoa_to_sheet(sheetData);

      // Auto-size columns (rough)
      const colWidths = tbl.headers.map((h, i) => {
        let max = h.length;
        for (const row of tbl.rows) {
          const v = stripInline(row[i] || '');
          if (v.length > max) max = v.length;
        }
        return { wch: Math.min(Math.max(max + 2, 10), 60) };
      });
      ws['!cols'] = colWidths;

      // Style headers (basic — SheetJS community version is limited)
      const range = XLSX.utils.decode_range(ws['!ref']);
      for (let c = range.s.c; c <= range.e.c; c++) {
        const addr = XLSX.utils.encode_cell({ r: 0, c });
        if (ws[addr]) {
          ws[addr].s = {
            font: { bold: true, color: { rgb: 'FFFFFF' } },
            fill: { fgColor: { rgb: '0EA5E9' } },
            alignment: { horizontal: 'center', vertical: 'center', wrapText: true },
          };
        }
      }

      // Determine sheet name from context (look for nearby heading)
      let sheetName = `Table ${idx + 1}`;
      // Try to find the heading just before this table in markdown
      const blocks = parseMarkdownToBlocks(markdown);
      let lastHeading = null;
      for (const b of blocks) {
        if (b.type === 'table' && b === tbl) break;
        if (b.type === 'h1' || b.type === 'h2' || b.type === 'h3') {
          lastHeading = b.content;
        }
      }
      if (lastHeading) {
        sheetName = lastHeading.substring(0, 28).replace(/[\\\/\*\?:\[\]]/g, '');
      }

      XLSX.utils.book_append_sheet(wb, ws, sheetName);
    });

    const filename = sanitizeFilename(title || 'GRC-Tables') + '.xlsx';
    XLSX.writeFile(wb, filename);
    return filename;
  }

  // ============ HELPERS ============

  function sanitizeFilename(name) {
    return String(name).replace(/[^\w\s-]/g, '').replace(/\s+/g, '-').substring(0, 80) || 'GRC-Document';
  }

  function triggerDownload(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  // Auto-detect title from first heading
  function inferTitle(markdown) {
    const lines = markdown.split('\n');
    for (const line of lines) {
      const t = line.trim();
      const h = t.match(/^#+\s+(.+)$/);
      if (h) return h[1].trim().replace(/\*\*/g, '').replace(/\*/g, '');
    }
    return null;
  }

  window.exporter = {
    copyText,
    exportWord,
    exportPdf,
    exportExcel,
    hasTable,
    inferTitle,
    parseMarkdownToBlocks,
  };
})(window);
