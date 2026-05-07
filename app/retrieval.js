/**
 * Retrieval Engine - Phase 1 (TF-IDF / Keyword)
 *
 * Phase 2 will swap implementation for vector embeddings,
 * but the public interface (search, addDocuments, removeDocument) stays the same.
 *
 * Public API:
 *   await retrieval.init()                       — Loads built-in KB
 *   retrieval.addDocument(doc)                   — Add a chunk to the index
 *   retrieval.search(query, options) → chunks    — Returns top-k relevant chunks
 *   retrieval.removeDocument(docId)              — Remove a doc from the index
 *   retrieval.stats() → {totalChunks, byFramework}
 *
 * Each chunk: { id, doc_id, title, framework, category, source, text, chunk_idx }
 */

(function (window) {
  'use strict';

  // ============ TF-IDF IMPLEMENTATION ============
  const STOPWORDS = new Set([
    'a','an','and','are','as','at','be','by','for','from','has','have','he','in',
    'is','it','its','of','on','that','the','to','was','were','will','with','this',
    'these','those','they','their','them','i','we','our','you','your','he','she',
    'his','her','him','or','but','not','no','if','so','do','does','did','can',
    'could','would','should','may','might','must','about','what','which','who',
    'when','where','why','how','all','some','any','each','every','also','than',
    'then','too','very','just','only','other','same','such','own','here','there'
  ]);

  function tokenize(text) {
    if (!text) return [];
    return String(text)
      .toLowerCase()
      .replace(/[^\w\s\u0600-\u06ff-]/g, ' ') // keep alphanumeric, Arabic, hyphen
      .split(/\s+/)
      .filter(t => t.length > 1 && !STOPWORDS.has(t));
  }

  // Identify control IDs and framework names — these get a boost
  const CONTROL_ID_REGEX = /\b(\d+(?:[-.]\d+){1,4})\b/g;
  const FRAMEWORK_KEYWORDS = [
    'ecc','cscc','ccc','otcc','dcc','ncs','tcc','msoc','sama','cst','crf','pdpl',
    'sdaia','iso','27001','27002','22301','31000','nist','csf','soc','pci','dss',
    'cis','cobit','itil','gdpr','aramco','nca'
  ];

  function extractSpecialTerms(text) {
    const terms = [];
    const t = String(text).toLowerCase();
    // Control IDs
    const ids = t.match(CONTROL_ID_REGEX) || [];
    terms.push(...ids);
    // Framework mentions
    for (const fw of FRAMEWORK_KEYWORDS) {
      if (t.includes(fw)) terms.push(fw);
    }
    return terms;
  }

  // ============ INDEX ============
  const _state = {
    chunks: [],            // all chunks (built-in + user uploaded)
    chunkById: new Map(),  // id -> chunk
    invertedIndex: new Map(), // term -> [{chunkId, tf}]
    docFreq: new Map(),    // term -> document frequency
    initialized: false,
    loading: false,
  };

  function indexChunk(chunk) {
    if (_state.chunkById.has(chunk.id)) return; // dedup

    const tokens = tokenize(chunk.text + ' ' + chunk.title + ' ' + chunk.framework);
    const tfMap = new Map();
    for (const t of tokens) tfMap.set(t, (tfMap.get(t) || 0) + 1);

    // Special terms boost
    const specialTerms = extractSpecialTerms(chunk.text + ' ' + chunk.title);
    for (const t of specialTerms) tfMap.set(t, (tfMap.get(t) || 0) + 3);

    chunk._tfMap = tfMap;
    chunk._tokenCount = tokens.length;

    _state.chunks.push(chunk);
    _state.chunkById.set(chunk.id, chunk);

    // Inverted index
    for (const [term, tf] of tfMap.entries()) {
      if (!_state.invertedIndex.has(term)) _state.invertedIndex.set(term, []);
      _state.invertedIndex.get(term).push({ chunkId: chunk.id, tf });
      _state.docFreq.set(term, (_state.docFreq.get(term) || 0) + 1);
    }
  }

  function unindexChunk(chunkId) {
    const chunk = _state.chunkById.get(chunkId);
    if (!chunk) return;
    if (chunk._tfMap) {
      for (const term of chunk._tfMap.keys()) {
        const list = _state.invertedIndex.get(term);
        if (list) {
          const filtered = list.filter(e => e.chunkId !== chunkId);
          if (filtered.length === 0) {
            _state.invertedIndex.delete(term);
            _state.docFreq.delete(term);
          } else {
            _state.invertedIndex.set(term, filtered);
            _state.docFreq.set(term, filtered.length);
          }
        }
      }
    }
    _state.chunkById.delete(chunkId);
    _state.chunks = _state.chunks.filter(c => c.id !== chunkId);
  }

  // ============ INIT (Load built-in KB) ============
  async function init(progressCallback) {
    if (_state.initialized) return;
    if (_state.loading) {
      // wait for existing load
      while (_state.loading) await new Promise(r => setTimeout(r, 100));
      return;
    }
    _state.loading = true;
    try {
      if (progressCallback) progressCallback({ stage: 'fetching', message: 'Loading knowledge base...' });
      const res = await fetch('/data/kb.json');
      if (!res.ok) throw new Error('Failed to load knowledge base');
      const chunks = await res.json();

      if (progressCallback) progressCallback({ stage: 'indexing', message: `Indexing ${chunks.length} chunks...`, total: chunks.length });

      // Index in batches to avoid blocking UI
      const BATCH = 200;
      for (let i = 0; i < chunks.length; i += BATCH) {
        const batch = chunks.slice(i, i + BATCH);
        for (const c of batch) {
          c.builtIn = true; // mark as built-in
          indexChunk(c);
        }
        if (progressCallback) progressCallback({ stage: 'indexing', current: Math.min(i + BATCH, chunks.length), total: chunks.length });
        // Yield to UI
        await new Promise(r => setTimeout(r, 0));
      }

      _state.initialized = true;
      if (progressCallback) progressCallback({ stage: 'ready', total: chunks.length });
    } finally {
      _state.loading = false;
    }
  }

  // ============ SEARCH ============
  function search(query, options = {}) {
    const {
      topK = 6,
      frameworks = null,    // null = all, or array of framework names to filter
      categories = null,    // optional category filter
      minScore = 0.05,
      includeUserDocs = true,
      includeBuiltIn = true,
    } = options;

    if (!_state.initialized) {
      return { chunks: [], reason: 'not_initialized' };
    }
    if (!query || !query.trim()) {
      return { chunks: [], reason: 'empty_query' };
    }

    const queryTokens = tokenize(query);
    const querySpecial = extractSpecialTerms(query);
    const allTerms = [...new Set([...queryTokens, ...querySpecial])];

    if (allTerms.length === 0) {
      return { chunks: [], reason: 'no_terms' };
    }

    const N = _state.chunks.length;
    const scores = new Map();

    for (const term of allTerms) {
      const postings = _state.invertedIndex.get(term);
      if (!postings) continue;
      const df = postings.length;
      const idf = Math.log(1 + (N - df + 0.5) / (df + 0.5));

      for (const posting of postings) {
        const chunk = _state.chunkById.get(posting.chunkId);
        if (!chunk) continue;
        // BM25-ish
        const tf = posting.tf;
        const tokenCount = chunk._tokenCount || 1;
        const avgLen = 100; // approximate
        const k1 = 1.5, b = 0.75;
        const tfNorm = (tf * (k1 + 1)) / (tf + k1 * (1 - b + b * tokenCount / avgLen));
        const score = idf * tfNorm;

        // Bonus for control IDs / framework names matching
        const isSpecial = querySpecial.includes(term);
        const finalScore = isSpecial ? score * 2.5 : score;

        scores.set(posting.chunkId, (scores.get(posting.chunkId) || 0) + finalScore);
      }
    }

    // Apply filters and rank
    let results = [];
    for (const [chunkId, score] of scores.entries()) {
      const chunk = _state.chunkById.get(chunkId);
      if (!chunk) continue;
      if (frameworks && frameworks.length > 0 && !frameworks.includes(chunk.framework)) continue;
      if (categories && categories.length > 0 && !categories.includes(chunk.category)) continue;
      if (!includeBuiltIn && chunk.builtIn) continue;
      if (!includeUserDocs && !chunk.builtIn) continue;
      results.push({ chunk, score });
    }

    results.sort((a, b) => b.score - a.score);

    // Normalize and apply minScore
    if (results.length > 0) {
      const maxScore = results[0].score;
      results = results
        .map(r => ({ ...r, normalized: r.score / maxScore }))
        .filter(r => r.normalized >= minScore);
    }

    const topChunks = results.slice(0, topK).map(r => ({
      ..._serializeChunk(r.chunk),
      _score: r.normalized,
    }));

    return { chunks: topChunks, totalMatches: results.length, reason: 'ok' };
  }

  function _serializeChunk(c) {
    // strip internal fields
    return {
      id: c.id,
      doc_id: c.doc_id,
      title: c.title,
      framework: c.framework,
      category: c.category,
      source: c.source,
      text: c.text,
      chunk_idx: c.chunk_idx,
      builtIn: c.builtIn,
    };
  }

  // ============ USER DOCUMENT MANAGEMENT ============
  function addUserChunks(chunks) {
    for (const c of chunks) {
      c.builtIn = false;
      indexChunk(c);
    }
  }

  function removeDocument(docId) {
    const toRemove = _state.chunks.filter(c => c.doc_id === docId).map(c => c.id);
    for (const id of toRemove) unindexChunk(id);
    return toRemove.length;
  }

  function stats() {
    const byFramework = {};
    const userChunks = _state.chunks.filter(c => !c.builtIn);
    const builtInChunks = _state.chunks.filter(c => c.builtIn);
    for (const c of _state.chunks) {
      byFramework[c.framework] = (byFramework[c.framework] || 0) + 1;
    }
    return {
      totalChunks: _state.chunks.length,
      builtInChunks: builtInChunks.length,
      userChunks: userChunks.length,
      uniqueDocuments: new Set(_state.chunks.map(c => c.doc_id)).size,
      uniqueUserDocuments: new Set(userChunks.map(c => c.doc_id)).size,
      byFramework,
      initialized: _state.initialized,
    };
  }

  function listUserDocuments() {
    const userChunks = _state.chunks.filter(c => !c.builtIn);
    const docs = new Map();
    for (const c of userChunks) {
      if (!docs.has(c.doc_id)) {
        docs.set(c.doc_id, {
          doc_id: c.doc_id,
          title: c.title,
          framework: c.framework,
          category: c.category,
          chunks: 0,
        });
      }
      docs.get(c.doc_id).chunks++;
    }
    return Array.from(docs.values());
  }

  // ============ EXPORT ============
  window.retrieval = {
    init,
    search,
    addUserChunks,
    removeDocument,
    listUserDocuments,
    stats,
    isReady: () => _state.initialized,
  };
})(window);
