/**
 * GRC Expert — Post-Init
 * Runs last after all scripts. Configures PDF.js, verifies libraries.
 */
(function () {
  'use strict';

  // PDF.js worker
  if (window.pdfjsLib) {
    pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
    console.log('[init] ✓ PDF.js configured');
  } else {
    console.warn('[init] ✗ PDF.js not loaded');
  }

  // Verify export libraries
  console.log('[init] Library check:');
  console.log('[init]   XLSX:', !!window.XLSX ? '✓ loaded' : '✗ MISSING');
  console.log('[init]   mammoth:', !!window.mammoth ? '✓ loaded' : '✗ MISSING');
  console.log('[init]   docx:', !!window.docx ? '✓ loaded' : '✗ MISSING');
  if (window.docx) {
    console.log('[init]   docx.Document:', !!window.docx.Document);
    console.log('[init]   docx.Packer:', !!window.docx.Packer);
    console.log('[init]   docx.Paragraph:', !!window.docx.Paragraph);
  }
  console.log('[init]   jspdf:', !!(window.jspdf && window.jspdf.jsPDF) ? '✓ loaded' : '✗ MISSING');
  if (window.jspdf && window.jspdf.jsPDF) {
    var testDoc = new window.jspdf.jsPDF();
    console.log('[init]   autoTable:', typeof testDoc.autoTable === 'function' ? '✓ loaded' : '✗ MISSING');
  }

  // Sidebar framework toggle
  var fwToggle = document.getElementById('fwToggle');
  var fwList = document.getElementById('fwList');
  if (fwToggle && fwList) {
    fwToggle.addEventListener('click', function () {
      fwList.classList.toggle('open');
      fwToggle.classList.toggle('open');
    });
  }

  console.log('[init] GRC Expert ready');
})();
