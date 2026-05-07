/**
 * Persistent Storage (IndexedDB)
 *
 * Stores user-uploaded documents and their extracted chunks across sessions.
 * Phase 2: this layer stays the same; vector embeddings get added to chunk records.
 *
 * Public API:
 *   await storage.init()
 *   await storage.saveDocument(doc, chunks)
 *   await storage.deleteDocument(docId)
 *   await storage.listDocuments()
 *   await storage.loadAllChunks()
 *   await storage.savePreferences(prefs)
 *   await storage.loadPreferences()
 */

(function (window) {
  'use strict';

  const DB_NAME = 'GRCExpertDB';
  const DB_VERSION = 1;

  let _db = null;

  function init() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onerror = () => reject(new Error('IndexedDB error'));
      request.onsuccess = (e) => {
        _db = e.target.result;
        resolve();
      };
      request.onupgradeneeded = (e) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains('documents')) {
          const docs = db.createObjectStore('documents', { keyPath: 'doc_id' });
          docs.createIndex('uploadedAt', 'uploadedAt', { unique: false });
        }
        if (!db.objectStoreNames.contains('chunks')) {
          const chunks = db.createObjectStore('chunks', { keyPath: 'id' });
          chunks.createIndex('doc_id', 'doc_id', { unique: false });
        }
        if (!db.objectStoreNames.contains('preferences')) {
          db.createObjectStore('preferences', { keyPath: 'key' });
        }
        if (!db.objectStoreNames.contains('conversations')) {
          const convs = db.createObjectStore('conversations', { keyPath: 'id' });
          convs.createIndex('updatedAt', 'updatedAt', { unique: false });
        }
      };
    });
  }

  function _tx(stores, mode = 'readonly') {
    if (!_db) throw new Error('Storage not initialized');
    return _db.transaction(stores, mode);
  }

  function _promisify(req) {
    return new Promise((resolve, reject) => {
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  // ============ DOCUMENTS ============

  async function saveDocument(docMeta, chunks) {
    const tx = _tx(['documents', 'chunks'], 'readwrite');
    const docs = tx.objectStore('documents');
    const chunkStore = tx.objectStore('chunks');

    docs.put({
      doc_id: docMeta.doc_id,
      title: docMeta.title,
      framework: docMeta.framework || 'User Upload',
      category: docMeta.category || 'Document',
      filename: docMeta.filename,
      filesize: docMeta.filesize,
      filetype: docMeta.filetype,
      chunkCount: chunks.length,
      uploadedAt: Date.now(),
    });

    for (const c of chunks) chunkStore.put(c);

    return new Promise((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  async function deleteDocument(docId) {
    const tx = _tx(['documents', 'chunks'], 'readwrite');
    tx.objectStore('documents').delete(docId);
    const idx = tx.objectStore('chunks').index('doc_id');
    const range = IDBKeyRange.only(docId);
    const cursor = idx.openCursor(range);
    cursor.onsuccess = (e) => {
      const c = e.target.result;
      if (c) {
        c.delete();
        c.continue();
      }
    };
    return new Promise((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  async function listDocuments() {
    const tx = _tx(['documents']);
    const store = tx.objectStore('documents');
    const all = await _promisify(store.getAll());
    return all.sort((a, b) => b.uploadedAt - a.uploadedAt);
  }

  async function loadAllChunks() {
    const tx = _tx(['chunks']);
    const store = tx.objectStore('chunks');
    return await _promisify(store.getAll());
  }

  // ============ PREFERENCES ============

  async function savePreference(key, value) {
    const tx = _tx(['preferences'], 'readwrite');
    tx.objectStore('preferences').put({ key, value });
    return new Promise((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  async function loadPreference(key) {
    const tx = _tx(['preferences']);
    const result = await _promisify(tx.objectStore('preferences').get(key));
    return result ? result.value : null;
  }

  // ============ CONVERSATIONS ============

  async function saveConversation(conv) {
    const tx = _tx(['conversations'], 'readwrite');
    tx.objectStore('conversations').put(conv);
    return new Promise((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  async function listConversations() {
    const tx = _tx(['conversations']);
    const all = await _promisify(tx.objectStore('conversations').getAll());
    return all.sort((a, b) => b.updatedAt - a.updatedAt);
  }

  async function deleteConversation(id) {
    const tx = _tx(['conversations'], 'readwrite');
    tx.objectStore('conversations').delete(id);
    return new Promise((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  window.storage = {
    init,
    saveDocument,
    deleteDocument,
    listDocuments,
    loadAllChunks,
    savePreference,
    loadPreference,
    saveConversation,
    listConversations,
    deleteConversation,
  };
})(window);
