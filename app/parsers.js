/**
 * File Parser & Chunker
 *
 * Extracts text from uploaded files and chunks intelligently.
 * Returns: { metadata, chunks }
 */

(function (window) {
  'use strict';

  const CHUNK_SIZE = 800;
  const CHUNK_OVERLAP = 100;

  // ============ MAIN ============

  async function parseFile(file, onProgress) {
    const ext = file.name.split('.').pop().toLowerCase();
    const docId = `user_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

    let rawText;
    let pageMetadata = []; // {page, text} for PDF

    if (onProgress) onProgress({ stage: 'extracting', message: 'Extracting text...' });

    if (ext === 'pdf') {
      const result = await extractPdf(file, onProgress);
      rawText = result.text;
      pageMetadata = result.pages;
    } else if (ext === 'docx' || ext === 'doc') {
      rawText = await extractDocx(file);
    } else if (ext === 'xlsx' || ext === 'xls') {
      rawText = await extractXlsx(file);
    } else if (ext === 'csv' || ext === 'txt' || ext === 'md') {
      rawText = await file.text();
    } else {
      throw new Error('Unsupported file type. Use PDF, Word, Excel, CSV, TXT, or Markdown.');
    }

    if (!rawText || rawText.trim().length < 20) {
      throw new Error('Could not extract text from file. The file may be empty, corrupted, or scanned (no embedded text).');
    }

    // Cleanup
    rawText = rawText.replace(/\f/g, '\n\n').replace(/\n{3,}/g, '\n\n').replace(/[ \t]{2,}/g, ' ');

    if (onProgress) onProgress({ stage: 'chunking', message: 'Chunking content...' });

    // Detect framework and category
    const detected = detectFrameworkAndCategory(file.name, rawText);

    // Chunk
    const chunks = chunkText(rawText, {
      docId,
      title: cleanTitle(file.name),
      framework: detected.framework,
      category: detected.category,
      source: `User upload — ${file.name}`,
      pages: pageMetadata,
    });

    return {
      metadata: {
        doc_id: docId,
        title: cleanTitle(file.name),
        filename: file.name,
        filesize: file.size,
        filetype: ext,
        framework: detected.framework,
        category: detected.category,
        chunkCount: chunks.length,
      },
      chunks,
    };
  }

  // ============ EXTRACTORS ============

  async function extractPdf(file, onProgress) {
    if (!window.pdfjsLib) throw new Error('PDF.js not loaded');
    const buffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: buffer }).promise;
    const pages = [];
    let fullText = '';
    for (let i = 1; i <= pdf.numPages; i++) {
      if (onProgress) onProgress({ stage: 'extracting', message: `Reading page ${i}/${pdf.numPages}`, current: i, total: pdf.numPages });
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();
      const pageText = content.items.map(item => item.str).join(' ');
      pages.push({ page: i, text: pageText });
      fullText += `\n\n[Page ${i}]\n${pageText}`;
    }
    return { text: fullText, pages };
  }

  async function extractDocx(file) {
    if (!window.mammoth) throw new Error('Mammoth.js not loaded');
    const buffer = await file.arrayBuffer();
    const result = await mammoth.extractRawText({ arrayBuffer: buffer });
    return result.value;
  }

  async function extractXlsx(file) {
    if (!window.XLSX) throw new Error('SheetJS not loaded');
    const buffer = await file.arrayBuffer();
    const wb = XLSX.read(buffer, { type: 'array' });
    let text = '';
    for (const sheetName of wb.SheetNames) {
      const sheet = wb.Sheets[sheetName];
      text += `\n\n[Sheet: ${sheetName}]\n`;
      // Convert to rows; preserve structure
      const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });
      for (const row of rows) {
        const cells = row.map(c => String(c || '').trim()).filter(c => c.length > 0);
        if (cells.length > 0) text += cells.join(' | ') + '\n';
      }
    }
    return text;
  }

  // ============ DETECTION ============

  function detectFrameworkAndCategory(filename, text) {
    const fname = filename.toLowerCase();
    const sample = text.substring(0, 3000).toLowerCase();
    const combined = fname + ' ' + sample;

    // Framework detection
    let framework = 'User Upload';
    const fwPatterns = [
      [/nca\s*ecc|essential cybersecurity controls/i, 'NCA ECC'],
      [/nca\s*cscc|critical systems cybersecurity/i, 'NCA CSCC'],
      [/nca\s*ccc|cloud cybersecurity controls/i, 'NCA CCC'],
      [/nca\s*otcc|operational technology cybersecurity/i, 'NCA OTCC'],
      [/nca\s*dcc|data cybersecurity controls/i, 'NCA DCC'],
      [/nca\s*tcc|telework cybersecurity/i, 'NCA TCC'],
      [/nca\s*ncs|cryptographic standards/i, 'NCA NCS'],
      [/nca\s*msoc|managed soc/i, 'NCA MSOC'],
      [/sama|saudi arabian monetary/i, 'SAMA CSF'],
      [/cst\s*crf|cybersecurity regulatory framework/i, 'CST CRF'],
      [/sdaia|pdpl|personal data protection/i, 'SDAIA PDPL'],
      [/iso\s*27001|iso\/iec 27001/i, 'ISO 27001'],
      [/iso\s*22301/i, 'ISO 22301'],
      [/iso\s*31000/i, 'ISO 31000'],
      [/nist csf|cybersecurity framework/i, 'NIST CSF'],
      [/nist 800-53/i, 'NIST 800-53'],
      [/soc\s*2|trust services criteria/i, 'SOC 2'],
      [/pci\s*dss|payment card industry/i, 'PCI-DSS'],
      [/cis controls|critical security controls/i, 'CIS Controls'],
      [/aramco/i, 'Aramco CCC'],
    ];
    for (const [pattern, fw] of fwPatterns) {
      if (pattern.test(combined)) {
        framework = fw;
        break;
      }
    }

    // Category detection
    let category = 'Document';
    if (/policy/i.test(fname) || /^policy/i.test(text.substring(0, 500))) category = 'Policy';
    else if (/standard/i.test(fname)) category = 'Standard';
    else if (/procedure/i.test(fname)) category = 'Procedure';
    else if (/register/i.test(fname)) category = 'Register';
    else if (/audit|evidence/i.test(fname)) category = 'Audit';
    else if (/risk/i.test(fname)) category = 'Risk';
    else if (/control/i.test(fname) || /control listing/i.test(combined)) category = 'Controls';
    else if (/checklist/i.test(fname)) category = 'Checklist';
    else if (/report/i.test(fname)) category = 'Report';
    else if (/template/i.test(fname)) category = 'Template';

    return { framework, category };
  }

  // ============ CHUNKING ============

  function chunkText(text, meta) {
    const chunks = [];
    const lines = text.split('\n');

    // Group into paragraphs/sections
    let currentChunk = '';
    let currentPage = null;
    let chunkIdx = 0;

    for (const line of lines) {
      const trimmed = line.trim();

      // Detect page markers from PDF
      const pageMatch = trimmed.match(/^\[Page (\d+)\]/);
      if (pageMatch) {
        currentPage = parseInt(pageMatch[1]);
        continue;
      }

      // Detect sheet markers
      const sheetMatch = trimmed.match(/^\[Sheet: (.+)\]/);
      if (sheetMatch) {
        if (currentChunk.trim()) {
          chunks.push(_makeChunk(currentChunk, meta, chunkIdx++, { sheet: sheetMatch[1] }));
          currentChunk = '';
        }
        continue;
      }

      if (!trimmed) {
        // paragraph break — finalize chunk if it's long enough
        if (currentChunk.length > CHUNK_SIZE) {
          chunks.push(_makeChunk(currentChunk, meta, chunkIdx++, { page: currentPage }));
          currentChunk = '';
        } else {
          currentChunk += '\n';
        }
        continue;
      }

      if (currentChunk.length + trimmed.length > CHUNK_SIZE && currentChunk.trim()) {
        chunks.push(_makeChunk(currentChunk, meta, chunkIdx++, { page: currentPage }));
        // Overlap: keep last sentence
        const lastSentence = currentChunk.split(/[.!?]\s/).slice(-2).join('. ').trim();
        currentChunk = (lastSentence.length < CHUNK_OVERLAP ? lastSentence + ' ' : '') + trimmed + '\n';
      } else {
        currentChunk += trimmed + '\n';
      }
    }

    if (currentChunk.trim()) {
      chunks.push(_makeChunk(currentChunk, meta, chunkIdx++, { page: currentPage }));
    }

    return chunks;
  }

  function _makeChunk(text, meta, idx, extra) {
    return {
      id: `${meta.docId}_chunk_${idx}`,
      doc_id: meta.docId,
      title: meta.title,
      framework: meta.framework,
      category: meta.category,
      source: meta.source,
      chunk_idx: idx,
      text: text.trim(),
      ...(extra && extra.page ? { page: extra.page } : {}),
      ...(extra && extra.sheet ? { sheet: extra.sheet } : {}),
    };
  }

  // ============ HELPERS ============

  function cleanTitle(filename) {
    return filename
      .replace(/\.[^.]+$/, '') // remove extension
      .replace(/[_-]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  window.parsers = {
    parseFile,
    chunkText,
    detectFrameworkAndCategory,
  };
})(window);
