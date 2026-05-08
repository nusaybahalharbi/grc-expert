/**
 * Source Library — Frameworks, Modes, Generators, Official URLs
 */

(function (window) {
  'use strict';

  const FRAMEWORKS = [
    // NCA (Saudi National Cybersecurity Authority)
    { id: 'nca_ecc', name: 'NCA ECC', longName: 'Essential Cybersecurity Controls', group: 'NCA', kbName: 'NCA ECC', officialUrl: 'https://nca.gov.sa/en/regulatory-documents/' },
    { id: 'nca_cscc', name: 'NCA CSCC', longName: 'Critical Systems Cybersecurity Controls', group: 'NCA', kbName: 'NCA CSCC', officialUrl: 'https://nca.gov.sa/en/regulatory-documents/' },
    { id: 'nca_ccc', name: 'NCA CCC', longName: 'Cloud Cybersecurity Controls', group: 'NCA', kbName: 'NCA CCC', officialUrl: 'https://nca.gov.sa/en/regulatory-documents/' },
    { id: 'nca_otcc', name: 'NCA OTCC', longName: 'Operational Technology Cybersecurity Controls', group: 'NCA', kbName: 'NCA OTCC', officialUrl: 'https://nca.gov.sa/en/regulatory-documents/' },
    { id: 'nca_dcc', name: 'NCA DCC', longName: 'Data Cybersecurity Controls', group: 'NCA', kbName: 'NCA DCC', officialUrl: 'https://nca.gov.sa/en/regulatory-documents/' },
    { id: 'nca_tcc', name: 'NCA TCC', longName: 'Telework Cybersecurity Controls', group: 'NCA', kbName: 'NCA TCC', officialUrl: 'https://nca.gov.sa/en/regulatory-documents/' },
    { id: 'nca_ncs', name: 'NCS-1:2020', longName: 'National Cryptographic Standards', group: 'NCA', kbName: 'NCA NCS', officialUrl: 'https://nca.gov.sa/en/regulatory-documents/' },
    { id: 'nca_msoc', name: 'NCA MSOC', longName: 'Saudi Managed SOC Licensing', group: 'NCA', kbName: 'NCA MSOC', officialUrl: 'https://nca.gov.sa/en/regulatory-documents/' },
    { id: 'nca_toolkit', name: 'NCA Toolkit', longName: 'NCA Cybersecurity Toolkit (Policies, Standards, Procedures)', group: 'NCA', kbName: 'NCA', officialUrl: 'https://nca.gov.sa/en/regulatory-documents/guidelines-list/cybersecurity-toolkits/' },
    { id: 'nca_scywf', name: 'SCyWF', longName: 'Saudi Cybersecurity Workforce Framework', group: 'NCA', kbName: 'NCA SCyWF', officialUrl: 'https://nca.gov.sa/en/regulatory-documents/' },

    // Saudi Regulatory
    { id: 'sama_csf', name: 'SAMA CSF', longName: 'SAMA Cyber Security Framework', group: 'Saudi Regulatory', kbName: 'SAMA CSF', officialUrl: 'https://rulebook.sama.gov.sa/en/cyber-security-framework-3' },
    { id: 'sama_crfr', name: 'SAMA CRFR', longName: 'SAMA Cyber Risk Framework Regulation', group: 'Saudi Regulatory', kbName: 'SAMA CRFR', officialUrl: 'https://rulebook.sama.gov.sa/' },
    { id: 'sama_mvc', name: 'SAMA MVC', longName: 'SAMA Minimum Viable Controls', group: 'Saudi Regulatory', kbName: 'SAMA MVC', officialUrl: 'https://rulebook.sama.gov.sa/' },
    { id: 'cst_crf', name: 'CST CRF', longName: 'CST Cybersecurity Regulatory Framework', group: 'Saudi Regulatory', kbName: 'CST CRF', officialUrl: 'http://cst.gov.sa/en/regulations-and-licenses/regulations/Document-413' },
    { id: 'sdaia_pdpl', name: 'SDAIA PDPL', longName: 'Personal Data Protection Law', group: 'Saudi Regulatory', kbName: 'SDAIA PDPL', officialUrl: 'https://sdaia.gov.sa/en/Research/Pages/DataProtection.aspx' },
    { id: 'aramco_ccc', name: 'Aramco CCC', longName: 'Aramco Third-Party Cybersecurity Controls', group: 'Saudi Regulatory', kbName: 'Aramco CCC', officialUrl: '' },

    // International
    { id: 'iso_27001', name: 'ISO 27001', longName: 'ISO/IEC 27001:2022 ISMS', group: 'International', kbName: 'ISO 27001', officialUrl: 'https://www.iso.org/standard/27001' },
    { id: 'iso_27002', name: 'ISO 27002', longName: 'ISO/IEC 27002:2022 Controls', group: 'International', kbName: 'ISO 27002', officialUrl: 'https://www.iso.org/standard/75652.html' },
    { id: 'iso_22301', name: 'ISO 22301', longName: 'Business Continuity Management', group: 'International', kbName: 'ISO 22301', officialUrl: 'https://www.iso.org/standard/75106.html' },
    { id: 'iso_31000', name: 'ISO 31000', longName: 'Risk Management', group: 'International', kbName: 'ISO 31000', officialUrl: 'https://www.iso.org/standard/65694.html' },
    { id: 'nist_csf', name: 'NIST CSF 2.0', longName: 'NIST Cybersecurity Framework', group: 'International', kbName: 'NIST CSF', officialUrl: 'https://www.nist.gov/cyberframework' },
    { id: 'nist_800_53', name: 'NIST 800-53', longName: 'Security and Privacy Controls', group: 'International', kbName: 'NIST 800-53', officialUrl: 'https://csrc.nist.gov/pubs/sp/800/53/r5/upd1/final' },
    { id: 'nist_800_171', name: 'NIST 800-171', longName: 'CUI Protection', group: 'International', kbName: 'NIST 800-171', officialUrl: 'https://csrc.nist.gov/pubs/sp/800/171/r3/final' },
    { id: 'soc2', name: 'SOC 2', longName: 'Trust Services Criteria', group: 'International', kbName: 'SOC 2', officialUrl: 'https://www.aicpa-cima.com/' },
    { id: 'cis', name: 'CIS Controls v8', longName: 'CIS Critical Security Controls', group: 'International', kbName: 'CIS Controls', officialUrl: 'https://www.cisecurity.org/controls' },
    { id: 'pci_dss', name: 'PCI-DSS v4.0', longName: 'Payment Card Industry Data Security Standard', group: 'International', kbName: 'PCI-DSS', officialUrl: 'https://www.pcisecuritystandards.org/' },
    { id: 'cobit', name: 'COBIT 2019', longName: 'Control Objectives for IT', group: 'International', kbName: 'COBIT', officialUrl: 'https://www.isaca.org/resources/cobit' },
    { id: 'gdpr', name: 'GDPR', longName: 'General Data Protection Regulation', group: 'International', kbName: 'GDPR', officialUrl: 'https://gdpr.eu/' },
  ];

  const MODES = [
    { id: 'chat', name: 'AI Assistant', icon: 'message', desc: 'General GRC consulting', mode: 'chat', generator: null },
    { id: 'saudi', name: 'Saudi GRC', icon: 'shield', desc: 'NCA + SAMA + CST + SDAIA', mode: 'saudi', generator: null },
    { id: 'international', name: 'International', icon: 'globe', desc: 'ISO, NIST, SOC 2, PCI-DSS', mode: 'international', generator: null },
    { id: 'mapping', name: 'Framework Mapping', icon: 'link', desc: 'Cross-reference controls', mode: 'mapping', generator: 'mapping' },
  ];

  const GENERATORS = [
    { id: 'policy', name: 'Policy Generator', icon: 'doc', desc: 'Generate policies aligned with frameworks', generator: 'policy' },
    { id: 'procedure', name: 'Procedure Generator', icon: 'list', desc: 'Generate executable procedures', generator: 'procedure' },
    { id: 'risk_register', name: 'Risk Register', icon: 'alert', desc: 'Generate risk registers using NCA risk register template structure', generator: 'risk_register' },
    { id: 'audit_evidence', name: 'Audit Evidence Builder', icon: 'check', desc: 'Generate evidence request lists', generator: 'audit_evidence' },
    { id: 'gap', name: 'Gap Assessment', icon: 'gap', desc: 'Compliance gap analysis', generator: 'gap' },
    { id: 'mapping_doc', name: 'Mapping Document', icon: 'link', desc: 'Detailed framework mapping', generator: 'mapping_doc' },
  ];

  const PAGES = {
    chat: { title: 'AI GRC Assistant', desc: 'Your Saudi-first AI GRC consultant. Ask about any framework, control, or compliance topic.' },
    knowledge: { title: 'Knowledge Base', desc: 'Browse the indexed framework documentation and your uploaded files.' },
    upload: { title: 'File Upload Center', desc: 'Upload PDFs, Word, Excel, CSV, or TXT files. They will be parsed, indexed, and available for AI analysis.' },
    mapping: { title: 'Framework Mapping', desc: 'Compare and cross-reference controls between frameworks.' },
    policy: { title: 'Policy Generator', desc: 'Generate professional policies aligned with NCA toolkit, ISO 27001, and other frameworks.' },
    procedure: { title: 'Procedure Generator', desc: 'Generate executable procedures with roles, steps, and evidence requirements.' },
    risk: { title: 'Risk Register Generator', desc: 'Generate risk registers following the NCA cybersecurity risk register template and risk treatment methodology.' },
    audit: { title: 'Audit Evidence Builder', desc: 'Generate evidence request lists, audit checklists, and finding response templates.' },
    gap: { title: 'Gap Assessment', desc: 'Conduct compliance gap analysis with severity ratings and remediation plans.' },
    sources: { title: 'Source Library', desc: 'Official framework documents and external sources.' },
  };

  // Suggested prompts per page
  const STARTERS = {
    chat: [
      { i: '🛡', t: 'Explain the 5 main domains of NCA ECC and key controls in each' },
      { i: '🏦', t: 'What does SAMA CSF require for incident management?' },
      { i: '⚖️', t: 'Summarize SDAIA PDPL data subject rights and controller obligations' },
      { i: '🔐', t: 'How should a Saudi telecom comply with both CST CRF and NCA ECC?' },
      { i: '☁️', t: 'NCA CCC controls for cloud service providers vs cloud tenants' },
      { i: '📊', t: 'Compare NCA ECC IAM controls with ISO 27001 Annex A.5.15-A.5.18' },
    ],
    upload: [
      { i: '📤', t: 'Click the upload button to add your own policy, control list, or audit document' },
      { i: '🔍', t: 'After uploading, ask: "Analyze this policy and identify gaps vs NCA ECC"' },
      { i: '📋', t: 'Upload an Excel control list and ask: "Map these controls to ISO 27001"' },
      { i: '📝', t: 'Upload an audit report and ask: "Extract findings and classify by severity"' },
    ],
    mapping: [
      { i: '🔄', t: 'Map all NCA ECC controls to ISO 27001 Annex A' },
      { i: '🎯', t: 'Compare SAMA CSF with NCA ECC — show overlap and unique controls' },
      { i: '📊', t: 'Map ISO 27001 to NIST CSF 2.0' },
      { i: '🌐', t: 'NCA ECC vs SOC 2 Trust Services Criteria' },
    ],
    policy: [
      { i: '📋', t: 'Generate an Information Security Policy aligned with NCA ECC for a Saudi bank' },
      { i: '🔐', t: 'Generate an Identity and Access Management Policy mapped to NCA ECC and ISO 27001 A.5.15' },
      { i: '☁️', t: 'Generate a Cloud Computing Policy aligned with NCA CCC for a fintech startup' },
      { i: '🏢', t: 'Generate a Third-Party Cybersecurity Policy for an oil & gas company' },
      { i: '📱', t: 'Generate a BYOD Policy aligned with NCA ECC and PDPL' },
      { i: '💼', t: 'Generate an Acceptable Use Policy for employees' },
    ],
    procedure: [
      { i: '🚨', t: 'Generate an Incident Response Procedure aligned with NCA ECC and NIST 800-61' },
      { i: '🔄', t: 'Generate a Vulnerability Management Procedure' },
      { i: '📊', t: 'Generate a Cybersecurity Risk Management Procedure (ISO 31000)' },
      { i: '🔍', t: 'Generate an Internal Cybersecurity Audit Procedure' },
      { i: '🛡', t: 'Generate a Patch Management Procedure' },
      { i: '📤', t: 'Generate a Data Backup and Recovery Procedure' },
    ],
    risk: [
      { i: '🎯', t: 'Generate a cybersecurity risk register for a Saudi bank with 15 application development risks using the NCA template structure' },
      { i: '☁️', t: 'Risk register for cloud migration aligned with NCA CCC' },
      { i: '🏭', t: 'OT/ICS risk register for an industrial facility (NCA OTCC)' },
      { i: '🔓', t: 'Third-party risk register with vendor categorization' },
      { i: '📊', t: 'Risk register methodology document with 5x5 risk matrix' },
    ],
    audit: [
      { i: '✅', t: 'Generate an evidence request list for a NCA ECC compliance audit' },
      { i: '📋', t: 'Generate audit interview questions for IT operations team' },
      { i: '🔍', t: 'SOC 2 Type II audit evidence list for access controls (CC6)' },
      { i: '📝', t: 'Audit findings template with severity classification' },
      { i: '🎯', t: 'How to respond to an audit finding on missing access reviews?' },
    ],
    gap: [
      { i: '🎯', t: 'Generate a NCA ECC gap assessment template covering all 5 domains' },
      { i: '📊', t: 'ISO 27001 readiness assessment for a SaaS company' },
      { i: '🏦', t: 'SAMA CSF maturity assessment for a fintech' },
      { i: '☁️', t: 'NCA CCC gap analysis for a cloud-native company' },
      { i: '📋', t: 'PDPL compliance gap assessment with prioritized remediation' },
    ],
  };

  window.sources = {
    FRAMEWORKS,
    MODES,
    GENERATORS,
    PAGES,
    STARTERS,
    getFramework: (id) => FRAMEWORKS.find(f => f.id === id),
    getOfficialUrl: (kbName) => {
      const f = FRAMEWORKS.find(f => f.kbName === kbName);
      return f ? f.officialUrl : '';
    },
  };
})(window);
