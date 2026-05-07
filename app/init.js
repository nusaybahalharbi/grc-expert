/**
 * GRC Expert — Post-Init Script
 * Runs after all CDN and app scripts have loaded (all are defer).
 * Configures PDF.js, verifies libraries, wires sidebar toggle.
 */
(function () {
  'use strict';

  // Configure PDF.js worker
  if (window.pdfjsLib) {
    pdfjsLib.GlobalWorkerOptions.workerSrc =
      'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
    console.log('[init] ✓ PDF.js configured');
  } else {
    console.warn('[init] ✗ PDF.js not loaded — PDF upload disabled');
  }

  // Verify export libraries
  var libs = {
    'SheetJS (xlsx)': !!window.XLSX,
    'Mammoth (docx read)': !!window.mammoth,
    'docx (Word export)': !!window.docx,
    'jsPDF': !!(window.jspdf && window.jspdf.jsPDF),
    'jspdf-autotable': !!(window.jspdf && window.jspdf.jsPDF && typeof new (window.jspdf.jsPDF)().autoTable === 'function'),
  };

  for (var name in libs) {
    if (libs[name]) {
      console.log('[init] ✓ ' + name + ' loaded');
    } else {
      console.warn('[init] ✗ ' + name + ' NOT loaded — some exports may fail');
    }
  }

  // Wire framework toggle
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
