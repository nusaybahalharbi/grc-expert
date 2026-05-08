/**
 * GRC Expert — Post-Init (runs last)
 */
(function () {
  'use strict';

  // PDF.js worker
  if (window.pdfjsLib) {
    pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
    console.log('[init] ✓ PDF.js');
  } else {
    console.warn('[init] ✗ PDF.js');
  }

  // Verify all export libraries
  var checks = [
    ['XLSX (Excel)', !!window.XLSX],
    ['mammoth (Word read)', !!window.mammoth],
    ['docx (Word export)', !!(window.docx && window.docx.Document && window.docx.Packer)],
    ['jsPDF (PDF export)', !!(window.jspdf && window.jspdf.jsPDF)],
  ];

  checks.forEach(function (c) {
    console.log('[init] ' + (c[1] ? '✓' : '✗') + ' ' + c[0]);
  });

  // Test autoTable
  if (window.jspdf && window.jspdf.jsPDF) {
    try {
      var t = new window.jspdf.jsPDF();
      console.log('[init] ' + (typeof t.autoTable === 'function' ? '✓' : '✗') + ' jspdf-autotable');
    } catch (e) {
      console.warn('[init] ✗ jspdf-autotable (error)');
    }
  }

  // Sidebar toggle
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
