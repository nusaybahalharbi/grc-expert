/**
 * GRC Expert — GRC Operations Modules
 * Owns: Frameworks, Controls, Policies, Procedures, Risk Register,
 *       Gap Assessments, Evidence Requests, Evidence Review, Tasks, Reports
 *
 * Live Supabase data only. Organization isolation + RBAC via RLS (migrations 001–006).
 * Reuses UI helpers from admin.js (window.Admin.ui). No service_role in this file.
 *
 * Public API: window.GRCOps.render(pageId, containerEl)
 */
(function (window) {
  'use strict';

  function H() { return window.Admin && window.Admin.ui ? window.Admin.ui : null; }
  function esc(s) { return H() ? H().esc(s) : String(s == null ? '' : s); }
  function toast(m, t) { if (H()) H().toast(m, t); }
  function A() { return window.Auth; }
  function db() { return window.Auth.client; }
  function can(c) { return window.Auth && window.Auth.can(c); }
  function fmtDate(d) { return d ? new Date(d).toLocaleDateString() : '—'; }
  function fmtDT(d) { return d ? new Date(d).toLocaleString() : '—'; }
  function loading(el) { if (H()) H().loading(el); else el.innerHTML = 'Loading…'; }
  function denied(el, w) { if (H()) H().denied(el, w); }
  function errorState(el, m, fn) { if (H()) H().errorState(el, m, fn); else el.innerHTML = 'Error: ' + esc(m); }
  function head(t, a) { return H() ? H().head(t, a) : '<h2>' + esc(t) + '</h2>'; }
  function modal(html) { return H().modal(html); }
  function confirmModal(t, m, cb, d) { return H().confirmModal(t, m, cb, d); }
  function ensureStyles() { if (H()) H().injectStyles(); }

  function riskLevel(score) {
    if (score >= 16) return { label: 'Critical', cls: 'red' };
    if (score >= 10) return { label: 'High', cls: 'amber' };
    if (score >= 5) return { label: 'Medium', cls: 'blue' };
    return { label: 'Low', cls: 'green' };
  }
  function statusBadge(s) {
    var map = { open: 'amber', in_treatment: 'blue', monitored: 'blue', closed: 'green', draft: 'gray', in_review: 'amber', approved: 'green', published: 'green', expired: 'red', archived: 'gray', pending: 'amber', submitted: 'blue', under_review: 'blue', rejected: 'red', overdue: 'red', need_more_info: 'amber', in_progress: 'blue', complete: 'green', done: 'green', blocked: 'red', cancelled: 'gray' };
    return '<span class="adm-badge ' + (map[s] || 'gray') + '">' + esc(String(s).replace(/_/g, ' ')) + '</span>';
  }
  function field(id, label, val, type) {
    return '<div class="adm-field"><label>' + esc(label) + '</label><input id="' + id + '" type="' + (type || 'text') + '" value="' + esc(val == null ? '' : val) + '"></div>';
  }
  function textarea(id, label, val) {
    return '<div class="adm-field"><label>' + esc(label) + '</label><textarea id="' + id + '" rows="3">' + esc(val || '') + '</textarea></div>';
  }
  function select(id, label, opts, cur) {
    return '<div class="adm-field"><label>' + esc(label) + '</label><select id="' + id + '">' +
      opts.map(function (o) { var v = o[0], t = o[1]; return '<option value="' + esc(v) + '"' + (String(cur) === String(v) ? ' selected' : '') + '>' + esc(t) + '</option>'; }).join('') +
      '</select></div>';
  }
  function csvExport(filename, headers, rows) {
    var lines = [headers.join(',')];
    rows.forEach(function (r) { lines.push(r.map(function (c) { return '"' + String(c == null ? '' : c).replace(/"/g, '""') + '"'; }).join(',')); });
    var blob = new Blob([lines.join('\n')], { type: 'text/csv' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = filename;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    toast('CSV exported', 'success');
  }
  function audit(event, entityType, entityId, after) {
    try {
      db().from('audit_logs').insert({ organization_id: A().organization.id, user_id: A().user.id, event: event, entity_type: entityType, entity_id: entityId, after_state: after || null });
    } catch (e) { }
  }

  // ============================================================
  // FRAMEWORKS
  // ============================================================
  async function renderFrameworks(el) {
    loading(el);
    try {
      var org = A().organization.id;
      var r = await Promise.all([
        db().from('frameworks').select('id,organization_id,code,name,version,authority,official_url,is_active').or('organization_id.is.null,organization_id.eq.' + org).order('authority'),
        db().from('controls').select('framework_id'),
      ]);
      if (r[0].error) throw r[0].error;
      var fws = r[0].data || [];
      var ctrlCounts = {}; (r[1].data || []).forEach(function (c) { ctrlCounts[c.framework_id] = (ctrlCounts[c.framework_id] || 0) + 1; });
      var search = '';

      function draw() {
        var filtered = fws.filter(function (f) { return !search || (f.name + ' ' + f.code + ' ' + (f.authority || '')).toLowerCase().indexOf(search.toLowerCase()) !== -1; });
        var rows = filtered.map(function (f) {
          var isGlobal = !f.organization_id;
          return '<tr>' +
            '<td><div style="font-weight:600;color:var(--text-bright)">' + esc(f.name) + '</div><div style="font-size:11px;color:var(--text-dim)">' + esc(f.code) + (f.version ? ' · v' + esc(f.version) : '') + '</div></td>' +
            '<td>' + esc(f.authority || '—') + '</td>' +
            '<td>' + (ctrlCounts[f.id] || 0) + '</td>' +
            '<td>' + (isGlobal ? '<span class="adm-badge blue">global</span>' : '<span class="adm-badge green">custom</span>') + '</td>' +
            '<td>' + (f.is_active ? '<span class="adm-badge green">active</span>' : '<span class="adm-badge gray">inactive</span>') + '</td>' +
            '<td>' + (isGlobal ? '<span style="font-size:11px;color:var(--text-dim)">protected</span>' : '<button class="adm-btn" data-edit="' + f.id + '">Edit</button>') + '</td>' +
            '</tr>';
        }).join('') || '<tr><td colspan="6"><div class="empty" style="padding:24px">No frameworks match.</div></td></tr>';

        el.innerHTML = '<div class="kb-page">' +
          head('Frameworks', can('settings.manage') ? '<button class="adm-btn primary" id="fNew">Add Framework</button>' : '') +
          '<div class="adm-toolbar"><input class="adm-input" id="fSearch" placeholder="Search frameworks…" value="' + esc(search) + '" style="min-width:240px"><span class="adm-count">' + filtered.length + ' framework' + (filtered.length === 1 ? '' : 's') + '</span></div>' +
          '<div style="overflow-x:auto"><table class="adm-table"><thead><tr><th>Framework</th><th>Authority</th><th>Controls</th><th>Type</th><th>Status</th><th></th></tr></thead><tbody>' + rows + '</tbody></table></div></div>';

        el.querySelector('#fSearch').addEventListener('input', function (e) { search = e.target.value; draw(); var i = el.querySelector('#fSearch'); i.focus(); i.setSelectionRange(i.value.length, i.value.length); });
        var nb = el.querySelector('#fNew'); if (nb) nb.addEventListener('click', function () { editFw(null); });
        Array.prototype.forEach.call(el.querySelectorAll('[data-edit]'), function (b) { b.addEventListener('click', function () { editFw(b.getAttribute('data-edit')); }); });
      }

      function editFw(id) {
        var f = id ? fws.find(function (x) { return x.id === id; }) : null;
        var m = modal('<h3>' + (f ? 'Edit Framework' : 'Add Framework') + '</h3>' +
          field('fwName', 'Name', f ? f.name : '') +
          field('fwCode', 'Code', f ? f.code : '') +
          field('fwVer', 'Version', f ? f.version : '') +
          field('fwAuth', 'Authority', f ? f.authority : '') +
          field('fwUrl', 'Official URL', f ? f.official_url : '') +
          '<div class="adm-modal-actions"><button class="adm-btn" data-x>Cancel</button><button class="adm-btn primary" data-ok>Save</button></div>');
        m.el.querySelector('[data-x]').addEventListener('click', m.close);
        m.el.querySelector('[data-ok]').addEventListener('click', async function () {
          var name = m.el.querySelector('#fwName').value.trim();
          var code = m.el.querySelector('#fwCode').value.trim();
          if (!name || !code) { toast('Name and code required', 'error'); return; }
          var patch = { name: name, code: code, version: m.el.querySelector('#fwVer').value.trim() || null, authority: m.el.querySelector('#fwAuth').value.trim() || null, official_url: m.el.querySelector('#fwUrl').value.trim() || null };
          var res;
          if (f) res = await db().from('frameworks').update(patch).eq('id', id);
          else { patch.organization_id = org; patch.is_active = true; res = await db().from('frameworks').insert(patch); }
          if (res.error) toast(res.error.message, 'error');
          else { audit(f ? 'framework_updated' : 'framework_created', 'framework', id); toast('Framework saved', 'success'); m.close(); renderFrameworks(el); }
        });
      }
      draw();
    } catch (err) { errorState(el, err.message, function () { renderFrameworks(el); }); }
  }

  // ============================================================
  // CONTROLS
  // ============================================================
  async function renderControls(el) {
    loading(el);
    try {
      var org = A().organization.id;
      var fwRes = await db().from('frameworks').select('id,name,code').or('organization_id.is.null,organization_id.eq.' + org).order('name');
      if (fwRes.error) throw fwRes.error;
      var fws = fwRes.data || [];
      if (!fws.length) { el.innerHTML = '<div class="kb-page">' + head('Controls', '') + '<div class="empty" style="padding:30px">No frameworks available yet.</div></div>'; return; }
      var state = { fw: fws[0].id, search: '', status: '', page: 0, per: 20 };

      async function load() {
        loading(el);
        var r = await Promise.all([
          db().from('controls').select('id,control_id,domain,subdomain,title,description').eq('framework_id', state.fw).order('sort_order').limit(2000),
          db().from('control_implementations').select('control_id,status,maturity_level,owner_id,notes').eq('organization_id', org),
          db().from('users').select('id,full_name').eq('organization_id', org),
        ]);
        if (r[0].error) throw r[0].error;
        var controls = r[0].data || [];
        var impl = {}; (r[1].data || []).forEach(function (i) { impl[i.control_id] = i; });
        var users = r[2].data || [];
        draw(controls, impl, users);
      }

      function draw(controls, impl, users) {
        var filtered = controls.filter(function (c) {
          if (state.search && (c.control_id + ' ' + c.title + ' ' + (c.domain || '')).toLowerCase().indexOf(state.search.toLowerCase()) === -1) return false;
          if (state.status) { var st = impl[c.id] ? impl[c.id].status : 'not_implemented'; if (st !== state.status) return false; }
          return true;
        });
        var pages = Math.max(1, Math.ceil(filtered.length / state.per));
        if (state.page >= pages) state.page = pages - 1;
        var pageRows = filtered.slice(state.page * state.per, state.page * state.per + state.per);
        var userMap = {}; users.forEach(function (u) { userMap[u.id] = u.full_name; });

        var rows = pageRows.map(function (c) {
          var im = impl[c.id] || { status: 'not_implemented', maturity_level: null, owner_id: null };
          var stCls = { implemented: 'green', partially_implemented: 'amber', not_implemented: 'gray', not_applicable: 'blue' }[im.status] || 'gray';
          return '<tr>' +
            '<td style="font-family:monospace;font-size:11.5px;color:var(--primary)">' + esc(c.control_id) + '</td>' +
            '<td><div style="font-weight:600;color:var(--text-bright)">' + esc(c.title) + '</div><div style="font-size:11px;color:var(--text-dim)">' + esc(c.domain || '') + '</div></td>' +
            '<td><span class="adm-badge ' + stCls + '">' + esc((im.status || 'not_implemented').replace(/_/g, ' ')) + '</span></td>' +
            '<td>' + (im.maturity_level != null ? im.maturity_level : '—') + '</td>' +
            '<td>' + esc(userMap[im.owner_id] || '—') + '</td>' +
            '<td>' + (can('gap.run') || can('risk.edit') ? '<button class="adm-btn" data-impl="' + c.id + '">Update</button>' : '') + '</td>' +
            '</tr>';
        }).join('') || '<tr><td colspan="6"><div class="empty" style="padding:24px">No controls match.</div></td></tr>';

        el.innerHTML = '<div class="kb-page">' + head('Controls', '') +
          '<div class="adm-toolbar">' +
          '<select class="adm-select" id="cFw">' + fws.map(function (f) { return '<option value="' + f.id + '"' + (state.fw === f.id ? ' selected' : '') + '>' + esc(f.name) + '</option>'; }).join('') + '</select>' +
          '<input class="adm-input" id="cSearch" placeholder="Search controls…" value="' + esc(state.search) + '" style="min-width:200px">' +
          '<select class="adm-select" id="cStatus"><option value="">All statuses</option>' + [['implemented', 'Implemented'], ['partially_implemented', 'Partially implemented'], ['not_implemented', 'Not implemented'], ['not_applicable', 'Not applicable']].map(function (o) { return '<option value="' + o[0] + '"' + (state.status === o[0] ? ' selected' : '') + '>' + o[1] + '</option>'; }).join('') + '</select>' +
          '<span class="adm-count">' + filtered.length + ' control' + (filtered.length === 1 ? '' : 's') + '</span>' +
          '</div>' +
          '<div style="overflow-x:auto"><table class="adm-table"><thead><tr><th>ID</th><th>Control</th><th>Status</th><th>Maturity</th><th>Owner</th><th></th></tr></thead><tbody>' + rows + '</tbody></table></div>' +
          '<div class="adm-pager"><button class="adm-btn" id="cPrev">Prev</button><span>Page ' + (state.page + 1) + ' / ' + pages + '</span><button class="adm-btn" id="cNext">Next</button></div></div>';

        el.querySelector('#cFw').addEventListener('change', function (e) { state.fw = e.target.value; state.page = 0; load(); });
        el.querySelector('#cSearch').addEventListener('input', function (e) { state.search = e.target.value; state.page = 0; draw(controls, impl, users); var i = el.querySelector('#cSearch'); i.focus(); i.setSelectionRange(i.value.length, i.value.length); });
        el.querySelector('#cStatus').addEventListener('change', function (e) { state.status = e.target.value; state.page = 0; draw(controls, impl, users); });
        el.querySelector('#cPrev').addEventListener('click', function () { if (state.page > 0) { state.page--; draw(controls, impl, users); } });
        el.querySelector('#cNext').addEventListener('click', function () { if (state.page < pages - 1) { state.page++; draw(controls, impl, users); } });
        Array.prototype.forEach.call(el.querySelectorAll('[data-impl]'), function (b) {
          b.addEventListener('click', function () { editImpl(b.getAttribute('data-impl'), controls, impl, users); });
        });
      }

      function editImpl(cid, controls, impl, users) {
        var c = controls.find(function (x) { return x.id === cid; });
        var im = impl[cid] || {};
        var m = modal('<h3>Control · ' + esc(c.control_id) + '</h3>' +
          '<div style="font-size:12px;color:var(--text-muted);margin-bottom:12px">' + esc(c.title) + '</div>' +
          select('imStatus', 'Implementation status', [['not_implemented', 'Not implemented'], ['partially_implemented', 'Partially implemented'], ['implemented', 'Implemented'], ['not_applicable', 'Not applicable']], im.status || 'not_implemented') +
          select('imMat', 'Maturity level', [['', '—'], ['0', '0'], ['1', '1'], ['2', '2'], ['3', '3'], ['4', '4'], ['5', '5']], im.maturity_level == null ? '' : String(im.maturity_level)) +
          select('imOwner', 'Owner', [['', '— None —']].concat(users.map(function (u) { return [u.id, u.full_name]; })), im.owner_id || '') +
          textarea('imNotes', 'Notes', im.notes || '') +
          '<div class="adm-modal-actions"><button class="adm-btn" data-x>Cancel</button><button class="adm-btn primary" data-ok>Save</button></div>');
        m.el.querySelector('[data-x]').addEventListener('click', m.close);
        m.el.querySelector('[data-ok]').addEventListener('click', async function () {
          var payload = {
            organization_id: org, control_id: cid,
            status: m.el.querySelector('#imStatus').value,
            maturity_level: m.el.querySelector('#imMat').value === '' ? null : parseInt(m.el.querySelector('#imMat').value, 10),
            owner_id: m.el.querySelector('#imOwner').value || null,
            notes: m.el.querySelector('#imNotes').value.trim() || null,
            last_assessed_at: new Date().toISOString(),
          };
          // upsert on (organization_id, control_id)
          var res = await db().from('control_implementations').upsert(payload, { onConflict: 'organization_id,control_id' });
          if (res.error) toast(res.error.message, 'error');
          else { audit('control_impl_updated', 'control', cid, { status: payload.status }); toast('Control updated', 'success'); m.close(); load(); }
        });
      }
      await load();
    } catch (err) { errorState(el, err.message, function () { renderControls(el); }); }
  }

  // ============================================================
  // RISK REGISTER
  // ============================================================
  async function renderRisks(el) {
    if (!can('risk.view')) return denied(el, 'the risk register');
    loading(el);
    try {
      var org = A().organization.id;
      var r = await Promise.all([
        db().from('risk_registers').select('id,name').eq('organization_id', org).order('created_at'),
        db().from('risks').select('*').eq('organization_id', org).order('created_at', { ascending: false }),
        db().from('users').select('id,full_name').eq('organization_id', org),
      ]);
      if (r[1].error) throw r[1].error;
      var registers = r[0].data || [];
      var risks = r[1].data || [];
      var users = r[2].data || [];
      var userMap = {}; users.forEach(function (u) { userMap[u.id] = u.full_name; });
      var state = { search: '', status: '', level: '', page: 0, per: 15 };
      var editable = can('risk.edit');

      // ensure a default register exists for creating risks
      async function ensureRegister() {
        if (registers.length) return registers[0].id;
        var ins = await db().from('risk_registers').insert({ organization_id: org, name: 'Enterprise Risk Register', owner_id: A().user.id }).select('id').single();
        if (ins.error) throw ins.error;
        registers.push({ id: ins.data.id, name: 'Enterprise Risk Register' });
        return ins.data.id;
      }

      function draw() {
        var filtered = risks.filter(function (rk) {
          if (state.search && ((rk.risk_code || '') + ' ' + (rk.title || '')).toLowerCase().indexOf(state.search.toLowerCase()) === -1) return false;
          if (state.status && rk.status !== state.status) return false;
          if (state.level) { var lv = riskLevel(rk.inherent_score || 0).label.toLowerCase(); if (lv !== state.level) return false; }
          return true;
        });
        var pages = Math.max(1, Math.ceil(filtered.length / state.per));
        if (state.page >= pages) state.page = pages - 1;
        var rows = filtered.slice(state.page * state.per, state.page * state.per + state.per).map(function (rk) {
          var lvl = riskLevel(rk.inherent_score || 0);
          return '<tr>' +
            '<td style="font-family:monospace;font-size:11.5px;color:var(--primary)">' + esc(rk.risk_code) + '</td>' +
            '<td><div style="font-weight:600;color:var(--text-bright)">' + esc(rk.title) + '</div></td>' +
            '<td>' + (rk.likelihood || '—') + '×' + (rk.impact || '—') + ' = <b>' + (rk.inherent_score || '—') + '</b></td>' +
            '<td><span class="adm-badge ' + lvl.cls + '">' + lvl.label + '</span></td>' +
            '<td>' + esc(userMap[rk.owner_id] || '—') + '</td>' +
            '<td>' + statusBadge(rk.status) + '</td>' +
            '<td><button class="adm-btn" data-view="' + rk.id + '">' + (editable ? 'Edit' : 'View') + '</button></td>' +
            '</tr>';
        }).join('') || '<tr><td colspan="7"><div class="empty" style="padding:24px">No risks match. ' + (editable ? 'Create your first risk.' : '') + '</div></td></tr>';

        el.innerHTML = '<div class="kb-page">' +
          head('Risk Register', (editable ? '<button class="adm-btn primary" id="rkNew">Add Risk</button> ' : '') + '<button class="adm-btn" id="rkCsv">Export CSV</button>') +
          '<div class="adm-toolbar">' +
          '<input class="adm-input" id="rkSearch" placeholder="Search risks…" value="' + esc(state.search) + '" style="min-width:200px">' +
          '<select class="adm-select" id="rkStatus"><option value="">All statuses</option>' + [['open', 'Open'], ['in_treatment', 'In treatment'], ['monitored', 'Monitored'], ['closed', 'Closed']].map(function (o) { return '<option value="' + o[0] + '"' + (state.status === o[0] ? ' selected' : '') + '>' + o[1] + '</option>'; }).join('') + '</select>' +
          '<select class="adm-select" id="rkLevel"><option value="">All levels</option>' + ['critical', 'high', 'medium', 'low'].map(function (l) { return '<option value="' + l + '"' + (state.level === l ? ' selected' : '') + '>' + l[0].toUpperCase() + l.slice(1) + '</option>'; }).join('') + '</select>' +
          '<span class="adm-count">' + filtered.length + ' risk' + (filtered.length === 1 ? '' : 's') + '</span>' +
          '</div>' +
          '<div style="overflow-x:auto"><table class="adm-table"><thead><tr><th>ID</th><th>Title</th><th>L×I</th><th>Level</th><th>Owner</th><th>Status</th><th></th></tr></thead><tbody>' + rows + '</tbody></table></div>' +
          '<div class="adm-pager"><button class="adm-btn" id="rkPrev">Prev</button><span>Page ' + (state.page + 1) + ' / ' + pages + '</span><button class="adm-btn" id="rkNext">Next</button></div></div>';

        el.querySelector('#rkSearch').addEventListener('input', function (e) { state.search = e.target.value; state.page = 0; draw(); var i = el.querySelector('#rkSearch'); i.focus(); i.setSelectionRange(i.value.length, i.value.length); });
        el.querySelector('#rkStatus').addEventListener('change', function (e) { state.status = e.target.value; state.page = 0; draw(); });
        el.querySelector('#rkLevel').addEventListener('change', function (e) { state.level = e.target.value; state.page = 0; draw(); });
        el.querySelector('#rkPrev').addEventListener('click', function () { if (state.page > 0) { state.page--; draw(); } });
        el.querySelector('#rkNext').addEventListener('click', function () { if (state.page < pages - 1) { state.page++; draw(); } });
        el.querySelector('#rkCsv').addEventListener('click', function () {
          csvExport('risk-register-' + new Date().toISOString().slice(0, 10) + '.csv',
            ['Code', 'Title', 'Likelihood', 'Impact', 'InherentScore', 'Level', 'Treatment', 'Owner', 'Status', 'TargetDate'],
            filtered.map(function (rk) { return [rk.risk_code, rk.title, rk.likelihood, rk.impact, rk.inherent_score, riskLevel(rk.inherent_score || 0).label, rk.treatment, userMap[rk.owner_id] || '', rk.status, rk.target_date || '']; }));
        });
        var nb = el.querySelector('#rkNew'); if (nb) nb.addEventListener('click', function () { editRisk(null); });
        Array.prototype.forEach.call(el.querySelectorAll('[data-view]'), function (b) { b.addEventListener('click', function () { editRisk(b.getAttribute('data-view')); }); });
      }

      function editRisk(id) {
        var rk = id ? risks.find(function (x) { return x.id === id; }) : {};
        var ro = !editable;
        var userOpts = [['', '— None —']].concat(users.map(function (u) { return [u.id, u.full_name]; }));
        var lvlOpts = [['1', '1'], ['2', '2'], ['3', '3'], ['4', '4'], ['5', '5']];
        var body = '<h3>' + (id ? (ro ? 'Risk · ' : 'Edit Risk · ') + esc(rk.risk_code) : 'Add Risk') + '</h3>' +
          field('rkCode', 'Reference code', rk.risk_code || '') +
          field('rkTitle', 'Title', rk.title || '') +
          textarea('rkDesc', 'Description', rk.description || '') +
          field('rkAsset', 'Business process / asset', rk.asset_process || '') +
          field('rkThreat', 'Threat', rk.threat || '') +
          field('rkVuln', 'Vulnerability', rk.vulnerability || '') +
          textarea('rkCtrls', 'Existing controls', rk.existing_controls || '') +
          '<div style="display:flex;gap:10px">' + select('rkLike', 'Likelihood', lvlOpts, rk.likelihood || '3') + select('rkImp', 'Impact', lvlOpts, rk.impact || '3') + '</div>' +
          select('rkTreat', 'Treatment', [['', '—'], ['avoid', 'Avoid'], ['reduce', 'Reduce'], ['transfer', 'Transfer'], ['accept', 'Accept']], rk.treatment || '') +
          textarea('rkPlan', 'Treatment plan', rk.treatment_actions || '') +
          select('rkOwner', 'Owner', userOpts, rk.owner_id || '') +
          field('rkTarget', 'Target date', rk.target_date || '', 'date') +
          '<div style="display:flex;gap:10px">' + select('rkRLike', 'Residual likelihood', [['', '—']].concat(lvlOpts), rk.residual_likelihood || '') + select('rkRImp', 'Residual impact', [['', '—']].concat(lvlOpts), rk.residual_impact || '') + '</div>' +
          select('rkStatus', 'Status', [['open', 'Open'], ['in_treatment', 'In treatment'], ['monitored', 'Monitored'], ['closed', 'Closed']], rk.status || 'open') +
          '<div class="adm-modal-actions"><button class="adm-btn" data-x>Close</button>' + (ro ? '' : '<button class="adm-btn primary" data-ok>Save</button>') + '</div>';
        var m = modal(body);
        if (ro) { Array.prototype.forEach.call(m.el.querySelectorAll('input,select,textarea'), function (i) { i.disabled = true; }); }
        m.el.querySelector('[data-x]').addEventListener('click', m.close);
        var ok = m.el.querySelector('[data-ok]');
        if (ok) ok.addEventListener('click', async function () {
          var title = m.el.querySelector('#rkTitle').value.trim();
          var code = m.el.querySelector('#rkCode').value.trim();
          if (!title || !code) { toast('Code and title required', 'error'); return; }
          ok.disabled = true; ok.textContent = 'Saving…';
          try {
            var regId = await ensureRegister();
            var payload = {
              organization_id: org, register_id: regId, risk_code: code, title: title,
              description: m.el.querySelector('#rkDesc').value.trim() || null,
              asset_process: m.el.querySelector('#rkAsset').value.trim() || null,
              threat: m.el.querySelector('#rkThreat').value.trim() || null,
              vulnerability: m.el.querySelector('#rkVuln').value.trim() || null,
              existing_controls: m.el.querySelector('#rkCtrls').value.trim() || null,
              likelihood: parseInt(m.el.querySelector('#rkLike').value, 10),
              impact: parseInt(m.el.querySelector('#rkImp').value, 10),
              treatment: m.el.querySelector('#rkTreat').value || null,
              treatment_actions: m.el.querySelector('#rkPlan').value.trim() || null,
              owner_id: m.el.querySelector('#rkOwner').value || null,
              target_date: m.el.querySelector('#rkTarget').value || null,
              residual_likelihood: m.el.querySelector('#rkRLike').value ? parseInt(m.el.querySelector('#rkRLike').value, 10) : null,
              residual_impact: m.el.querySelector('#rkRImp').value ? parseInt(m.el.querySelector('#rkRImp').value, 10) : null,
              status: m.el.querySelector('#rkStatus').value,
            };
            var res;
            if (id) res = await db().from('risks').update(payload).eq('id', id);
            else { payload.created_by = A().user.id; res = await db().from('risks').insert(payload); }
            if (res.error) throw res.error;
            audit(id ? 'risk_updated' : 'risk_created', 'risk', id, { code: code });
            toast('Risk saved', 'success'); m.close(); renderRisks(el);
          } catch (e) { toast(e.message || 'Save failed', 'error'); ok.disabled = false; ok.textContent = 'Save'; }
        });
      }
      draw();
    } catch (err) { errorState(el, err.message, function () { renderRisks(el); }); }
  }

  // expose partial; rest appended in part 2

  // ============================================================
  // POLICIES  (and PROCEDURES share this via a `kind` param)
  // ============================================================
  async function renderDocs(el, kind) {
    // kind: 'policies' | 'procedures'
    var isPolicy = kind === 'policies';
    var table = isPolicy ? 'policies' : 'procedures';
    var label = isPolicy ? 'Policies' : 'Procedures';
    var permView = 'policy.view', permEdit = 'policy.generate', permApprove = 'policy.approve';
    if (!can(permView)) return denied(el, label.toLowerCase());
    loading(el);
    try {
      var org = A().organization.id;
      var r = await Promise.all([
        db().from(table).select('*').eq('organization_id', org).order('updated_at', { ascending: false }),
        db().from('users').select('id,full_name').eq('organization_id', org),
      ]);
      if (r[0].error) throw r[0].error;
      var docs = r[0].data || [];
      var users = r[1].data || [];
      var userMap = {}; users.forEach(function (u) { userMap[u.id] = u.full_name; });
      var editable = can(permEdit);
      var canApprove = can(permApprove);
      var state = { search: '', status: '' };

      function draw() {
        var filtered = docs.filter(function (d) {
          if (state.search && (d.title || '').toLowerCase().indexOf(state.search.toLowerCase()) === -1) return false;
          if (state.status && d.status !== state.status) return false;
          return true;
        });
        var today = new Date().toISOString().slice(0, 10);
        var rows = filtered.map(function (d) {
          var overdue = d.review_date && d.review_date < today && d.status !== 'archived';
          return '<tr>' +
            '<td><div style="font-weight:600;color:var(--text-bright)">' + esc(d.title) + '</div><div style="font-size:11px;color:var(--text-dim)">v' + esc(d.version || '1.0') + (d.ai_generated ? ' · <span style="color:var(--primary)">AI-assisted</span>' : '') + '</div></td>' +
            '<td>' + statusBadge(d.status) + '</td>' +
            '<td>' + esc(userMap[d.owner_id] || '—') + '</td>' +
            '<td>' + fmtDate(d.review_date) + (overdue ? ' <span class="adm-badge red">overdue</span>' : '') + '</td>' +
            '<td><button class="adm-btn" data-view="' + d.id + '">' + (editable ? 'Open' : 'View') + '</button></td>' +
            '</tr>';
        }).join('') || '<tr><td colspan="5"><div class="empty" style="padding:24px">No ' + label.toLowerCase() + ' yet.</div></td></tr>';

        el.innerHTML = '<div class="kb-page">' +
          head(label, editable ? '<button class="adm-btn primary" id="dNew">New ' + (isPolicy ? 'Policy' : 'Procedure') + '</button>' : '') +
          '<div class="adm-toolbar">' +
          '<input class="adm-input" id="dSearch" placeholder="Search…" value="' + esc(state.search) + '" style="min-width:220px">' +
          '<select class="adm-select" id="dStatus"><option value="">All statuses</option>' + [['draft', 'Draft'], ['in_review', 'In review'], ['approved', 'Approved'], ['published', 'Published'], ['expired', 'Expired'], ['archived', 'Archived']].map(function (o) { return '<option value="' + o[0] + '"' + (state.status === o[0] ? ' selected' : '') + '>' + o[1] + '</option>'; }).join('') + '</select>' +
          '<span class="adm-count">' + filtered.length + '</span></div>' +
          '<div style="overflow-x:auto"><table class="adm-table"><thead><tr><th>Title</th><th>Status</th><th>Owner</th><th>Review date</th><th></th></tr></thead><tbody>' + rows + '</tbody></table></div></div>';

        el.querySelector('#dSearch').addEventListener('input', function (e) { state.search = e.target.value; draw(); var i = el.querySelector('#dSearch'); i.focus(); i.setSelectionRange(i.value.length, i.value.length); });
        el.querySelector('#dStatus').addEventListener('change', function (e) { state.status = e.target.value; draw(); });
        var nb = el.querySelector('#dNew'); if (nb) nb.addEventListener('click', function () { editDoc(null); });
        Array.prototype.forEach.call(el.querySelectorAll('[data-view]'), function (b) { b.addEventListener('click', function () { editDoc(b.getAttribute('data-view')); }); });
      }

      function editDoc(id) {
        var d = id ? docs.find(function (x) { return x.id === id; }) : {};
        var ro = !editable;
        var userOpts = [['', '— None —']].concat(users.map(function (u) { return [u.id, u.full_name]; }));
        var body = '<h3>' + (id ? esc(d.title) : 'New ' + (isPolicy ? 'Policy' : 'Procedure')) + '</h3>' +
          field('dTitle', 'Title', d.title || '') +
          field('dVersion', 'Version', d.version || '1.0') +
          select('dStatusF', 'Status', [['draft', 'Draft'], ['in_review', 'In review'], ['approved', 'Approved'], ['published', 'Published'], ['expired', 'Expired'], ['archived', 'Archived']], d.status || 'draft') +
          select('dOwner', 'Owner', userOpts, d.owner_id || '') +
          select('dApprover', 'Approver', userOpts, d.approver_id || '') +
          field('dEffective', 'Effective date', d.effective_date || '', 'date') +
          field('dReview', 'Review date', d.review_date || '', 'date') +
          textarea('dContent', 'Content (markdown)', d.content_md || '') +
          '<div class="adm-modal-actions"><button class="adm-btn" data-x>Close</button>' +
          (ro ? '' : (canApprove && d.status === 'in_review' ? '<button class="adm-btn" data-approve>Approve</button>' : '') + '<button class="adm-btn primary" data-ok>Save</button>') +
          '</div>';
        var m = modal(body);
        if (ro) Array.prototype.forEach.call(m.el.querySelectorAll('input,select,textarea'), function (i) { i.disabled = true; });
        m.el.querySelector('[data-x]').addEventListener('click', m.close);
        var ap = m.el.querySelector('[data-approve]');
        if (ap) ap.addEventListener('click', async function () {
          var res = await db().from(table).update({ status: 'approved', approved_at: new Date().toISOString(), approver_id: A().user.id }).eq('id', id);
          if (res.error) toast(res.error.message, 'error');
          else { audit(isPolicy ? 'policy_approved' : 'procedure_approved', table, id); toast('Approved', 'success'); m.close(); renderDocs(el, kind); }
        });
        var ok = m.el.querySelector('[data-ok]');
        if (ok) ok.addEventListener('click', async function () {
          var title = m.el.querySelector('#dTitle').value.trim();
          if (!title) { toast('Title required', 'error'); return; }
          // Do not silently overwrite an approved doc: bump status back to draft on edit unless it stays approved by an approver
          var payload = {
            organization_id: org, title: title,
            version: m.el.querySelector('#dVersion').value.trim() || '1.0',
            status: m.el.querySelector('#dStatusF').value,
            owner_id: m.el.querySelector('#dOwner').value || null,
            approver_id: m.el.querySelector('#dApprover').value || null,
            effective_date: m.el.querySelector('#dEffective').value || null,
            review_date: m.el.querySelector('#dReview').value || null,
            content_md: m.el.querySelector('#dContent').value,
          };
          var res;
          if (id) res = await db().from(table).update(payload).eq('id', id);
          else { payload.created_by = A().user.id; res = await db().from(table).insert(payload); }
          if (res.error) toast(res.error.message, 'error');
          else { audit(id ? (isPolicy ? 'policy_updated' : 'procedure_updated') : (isPolicy ? 'policy_created' : 'procedure_created'), table, id); toast('Saved', 'success'); m.close(); renderDocs(el, kind); }
        });
      }
      draw();
    } catch (err) { errorState(el, err.message, function () { renderDocs(el, kind); }); }
  }

  // ============================================================
  // GAP ASSESSMENTS
  // ============================================================
  async function renderGaps(el) {
    if (!can('gap.run')) return denied(el, 'gap assessments');
    loading(el);
    try {
      var org = A().organization.id;
      var r = await Promise.all([
        db().from('gap_assessments').select('*').eq('organization_id', org).order('created_at', { ascending: false }),
        db().from('frameworks').select('id,name').or('organization_id.is.null,organization_id.eq.' + org),
        db().from('users').select('id,full_name').eq('organization_id', org),
      ]);
      if (r[0].error) throw r[0].error;
      var gaps = r[0].data || [];
      var fws = r[1].data || [];
      var users = r[2].data || [];
      var fwMap = {}; fws.forEach(function (f) { fwMap[f.id] = f.name; });
      var userMap = {}; users.forEach(function (u) { userMap[u.id] = u.full_name; });

      var rows = gaps.map(function (g) {
        return '<tr>' +
          '<td style="font-weight:600;color:var(--text-bright)">' + esc(g.name) + '</td>' +
          '<td>' + esc(fwMap[g.framework_id] || '—') + '</td>' +
          '<td>' + statusBadge(g.status) + '</td>' +
          '<td>' + (g.overall_score != null ? g.overall_score + '%' : '—') + '</td>' +
          '<td>' + esc(userMap[g.performed_by] || '—') + '</td>' +
          '<td>' + fmtDate(g.created_at) + '</td>' +
          '<td><button class="adm-btn" data-open="' + g.id + '">Open</button></td>' +
          '</tr>';
      }).join('') || '<tr><td colspan="7"><div class="empty" style="padding:24px">No gap assessments yet.</div></td></tr>';

      el.innerHTML = '<div class="kb-page">' + head('Gap Assessments', '<button class="adm-btn primary" id="gNew">New Assessment</button>') +
        '<div style="overflow-x:auto"><table class="adm-table"><thead><tr><th>Name</th><th>Framework</th><th>Status</th><th>Score</th><th>Assessor</th><th>Created</th><th></th></tr></thead><tbody>' + rows + '</tbody></table></div></div>';

      el.querySelector('#gNew').addEventListener('click', function () {
        var m = modal('<h3>New Gap Assessment</h3>' +
          field('gName', 'Assessment name', '') +
          select('gFw', 'Framework', fws.map(function (f) { return [f.id, f.name]; }), fws[0] ? fws[0].id : '') +
          '<div class="adm-modal-actions"><button class="adm-btn" data-x>Cancel</button><button class="adm-btn primary" data-ok>Create</button></div>');
        m.el.querySelector('[data-x]').addEventListener('click', m.close);
        m.el.querySelector('[data-ok]').addEventListener('click', async function () {
          var name = m.el.querySelector('#gName').value.trim();
          if (!name) { toast('Name required', 'error'); return; }
          var res = await db().from('gap_assessments').insert({ organization_id: org, name: name, framework_id: m.el.querySelector('#gFw').value, performed_by: A().user.id, status: 'in_progress' });
          if (res.error) toast(res.error.message, 'error');
          else { audit('gap_created', 'gap_assessment', null, { name: name }); toast('Assessment created', 'success'); m.close(); renderGaps(el); }
        });
      });
      Array.prototype.forEach.call(el.querySelectorAll('[data-open]'), function (b) { b.addEventListener('click', function () { openGap(b.getAttribute('data-open')); }); });

      async function openGap(gid) {
        var g = gaps.find(function (x) { return x.id === gid; });
        var itemsRes = await db().from('gap_assessment_items').select('*').eq('gap_assessment_id', gid);
        var items = itemsRes.data || [];
        var itemRows = items.map(function (it) {
          return '<tr><td>' + esc(it.control_ref || '—') + '</td><td>' + esc(it.gap_description || '') + '</td><td>' + (it.severity ? statusBadge(it.severity) : '—') + '</td><td>' + esc(it.status) + '</td></tr>';
        }).join('') || '<tr><td colspan="4"><div class="empty" style="padding:16px">No findings recorded yet.</div></td></tr>';
        var m = modal('<h3>' + esc(g.name) + '</h3>' +
          '<div style="font-size:12px;color:var(--text-muted);margin-bottom:10px">Status: ' + esc(g.status) + (g.overall_score != null ? ' · Score ' + g.overall_score + '%' : '') + '</div>' +
          '<div style="max-height:280px;overflow:auto"><table class="adm-table"><thead><tr><th>Control</th><th>Gap</th><th>Severity</th><th>Status</th></tr></thead><tbody>' + itemRows + '</tbody></table></div>' +
          '<div class="adm-field" style="margin-top:14px"><label>Add finding — control reference</label><input id="giRef"></div>' +
          textarea('giGap', 'Gap description', '') +
          select('giSev', 'Severity', [['low', 'Low'], ['medium', 'Medium'], ['high', 'High'], ['critical', 'Critical']], 'medium') +
          '<div class="adm-modal-actions"><button class="adm-btn" data-x>Close</button><button class="adm-btn" data-complete>Mark Complete</button><button class="adm-btn primary" data-add>Add Finding</button></div>');
        m.el.querySelector('[data-x]').addEventListener('click', m.close);
        m.el.querySelector('[data-add]').addEventListener('click', async function () {
          var ref = m.el.querySelector('#giRef').value.trim();
          if (!ref) { toast('Control reference required', 'error'); return; }
          var res = await db().from('gap_assessment_items').insert({ gap_assessment_id: gid, control_ref: ref, gap_description: m.el.querySelector('#giGap').value.trim() || null, severity: m.el.querySelector('#giSev').value, status: 'open' });
          if (res.error) toast(res.error.message, 'error'); else { toast('Finding added', 'success'); m.close(); openGap(gid); }
        });
        m.el.querySelector('[data-complete]').addEventListener('click', async function () {
          var res = await db().from('gap_assessments').update({ status: 'complete', completed_at: new Date().toISOString() }).eq('id', gid);
          if (res.error) toast(res.error.message, 'error'); else { audit('gap_completed', 'gap_assessment', gid); toast('Assessment completed', 'success'); m.close(); renderGaps(el); }
        });
      }
    } catch (err) { errorState(el, err.message, function () { renderGaps(el); }); }
  }

  // ============================================================
  // EVIDENCE REQUESTS
  // ============================================================
  async function renderEvidence(el) {
    if (!can('evidence.request') && !can('evidence.submit')) return denied(el, 'evidence requests');
    loading(el);
    try {
      var org = A().organization.id;
      var r = await Promise.all([
        db().from('evidence_requests').select('*').eq('organization_id', org).order('created_at', { ascending: false }),
        db().from('users').select('id,full_name').eq('organization_id', org),
        db().from('frameworks').select('id,name').or('organization_id.is.null,organization_id.eq.' + org),
      ]);
      if (r[0].error) throw r[0].error;
      var reqs = r[0].data || [];
      var users = r[1].data || [];
      var fws = r[2].data || [];
      var userMap = {}; users.forEach(function (u) { userMap[u.id] = u.full_name; });
      var canCreate = can('evidence.request');
      var state = { search: '', status: '' };
      var today = new Date().toISOString().slice(0, 10);

      function draw() {
        var filtered = reqs.filter(function (rq) {
          if (state.search && (rq.title || '').toLowerCase().indexOf(state.search.toLowerCase()) === -1) return false;
          if (state.status && rq.status !== state.status) return false;
          return true;
        });
        var rows = filtered.map(function (rq) {
          var overdue = rq.due_date && rq.due_date < today && ['approved', 'rejected'].indexOf(rq.status) === -1;
          return '<tr>' +
            '<td><div style="font-weight:600;color:var(--text-bright)">' + esc(rq.title) + '</div></td>' +
            '<td>' + esc(userMap[rq.owner_id] || '—') + '</td>' +
            '<td>' + fmtDate(rq.due_date) + (overdue ? ' <span class="adm-badge red">overdue</span>' : '') + '</td>' +
            '<td>' + statusBadge(rq.status) + '</td>' +
            '<td><span class="adm-badge ' + (rq.priority === 'critical' || rq.priority === 'high' ? 'amber' : 'gray') + '">' + esc(rq.priority) + '</span></td>' +
            '<td><button class="adm-btn" data-open="' + rq.id + '">Open</button></td>' +
            '</tr>';
        }).join('') || '<tr><td colspan="6"><div class="empty" style="padding:24px">No evidence requests.</div></td></tr>';

        el.innerHTML = '<div class="kb-page">' + head('Evidence Requests', canCreate ? '<button class="adm-btn primary" id="evNew">New Request</button>' : '') +
          '<div class="adm-toolbar"><input class="adm-input" id="evSearch" placeholder="Search…" value="' + esc(state.search) + '" style="min-width:200px">' +
          '<select class="adm-select" id="evStatus"><option value="">All statuses</option>' + ['pending', 'submitted', 'under_review', 'approved', 'rejected', 'overdue', 'need_more_info'].map(function (s) { return '<option value="' + s + '"' + (state.status === s ? ' selected' : '') + '>' + s.replace(/_/g, ' ') + '</option>'; }).join('') + '</select>' +
          '<span class="adm-count">' + filtered.length + '</span></div>' +
          '<div style="overflow-x:auto"><table class="adm-table"><thead><tr><th>Title</th><th>Owner</th><th>Due</th><th>Status</th><th>Priority</th><th></th></tr></thead><tbody>' + rows + '</tbody></table></div></div>';

        el.querySelector('#evSearch').addEventListener('input', function (e) { state.search = e.target.value; draw(); var i = el.querySelector('#evSearch'); i.focus(); i.setSelectionRange(i.value.length, i.value.length); });
        el.querySelector('#evStatus').addEventListener('change', function (e) { state.status = e.target.value; draw(); });
        var nb = el.querySelector('#evNew'); if (nb) nb.addEventListener('click', newReq);
        Array.prototype.forEach.call(el.querySelectorAll('[data-open]'), function (b) { b.addEventListener('click', function () { openReq(b.getAttribute('data-open')); }); });
      }

      function newReq() {
        var m = modal('<h3>New Evidence Request</h3>' +
          field('erTitle', 'Title', '') +
          textarea('erDesc', 'Instructions / description', '') +
          select('erOwner', 'Evidence owner', users.map(function (u) { return [u.id, u.full_name]; }), A().user.id) +
          select('erFw', 'Framework', [['', '— None —']].concat(fws.map(function (f) { return [f.id, f.name]; })), '') +
          field('erDue', 'Due date', '', 'date') +
          select('erPrio', 'Priority', [['low', 'Low'], ['medium', 'Medium'], ['high', 'High'], ['critical', 'Critical']], 'medium') +
          '<div class="adm-modal-actions"><button class="adm-btn" data-x>Cancel</button><button class="adm-btn primary" data-ok>Create</button></div>');
        m.el.querySelector('[data-x]').addEventListener('click', m.close);
        m.el.querySelector('[data-ok]').addEventListener('click', async function () {
          var title = m.el.querySelector('#erTitle').value.trim();
          var owner = m.el.querySelector('#erOwner').value;
          if (!title || !owner) { toast('Title and owner required', 'error'); return; }
          var res = await db().from('evidence_requests').insert({
            organization_id: org, title: title, description: m.el.querySelector('#erDesc').value.trim() || null,
            owner_id: owner, requested_by: A().user.id, framework_id: m.el.querySelector('#erFw').value || null,
            due_date: m.el.querySelector('#erDue').value || null, priority: m.el.querySelector('#erPrio').value, status: 'pending',
          }).select('id').single();
          if (res.error) { toast(res.error.message, 'error'); return; }
          audit('evidence_requested', 'evidence_request', res.data.id, { title: title });
          // notify the owner
          try { await db().from('notifications').insert({ organization_id: org, user_id: owner, type: 'evidence_assigned', title: 'New evidence request: ' + title, body: 'You have been assigned an evidence request.', link: 'pg_evidence' }); } catch (e) { }
          toast('Evidence request created', 'success'); m.close(); renderEvidence(el);
        });
      }

      async function openReq(rid) {
        var rq = reqs.find(function (x) { return x.id === rid; });
        var isOwner = rq.owner_id === A().user.id;
        var respRes = await db().from('evidence_responses').select('*').eq('request_id', rid).order('submitted_at', { ascending: false });
        var responses = respRes.data || [];
        var respHtml = responses.map(function (rp) { return '<div class="doc-row" style="padding:8px 10px"><div class="doc-info"><div class="doc-name" style="font-size:12px">' + esc(userMap[rp.submitted_by] || 'User') + '</div><div class="doc-meta">' + esc(rp.notes || '') + ' · ' + fmtDT(rp.submitted_at) + '</div></div></div>'; }).join('') || '<div class="empty" style="padding:12px">No submissions yet.</div>';
        var m = modal('<h3>' + esc(rq.title) + '</h3>' +
          '<div style="font-size:12px;color:var(--text-muted);margin-bottom:6px">Status: ' + esc(rq.status) + ' · Due ' + fmtDate(rq.due_date) + '</div>' +
          '<p style="font-size:12.5px;color:var(--text);line-height:1.6">' + esc(rq.description || 'No instructions provided.') + '</p>' +
          '<h4 style="font-size:11px;text-transform:uppercase;color:var(--primary);margin:14px 0 6px">Submissions</h4>' + respHtml +
          (isOwner && ['approved', 'rejected'].indexOf(rq.status) === -1 ? textarea('erResp', 'Your response / notes', '') + '<div class="adm-modal-actions"><button class="adm-btn" data-x>Close</button><button class="adm-btn primary" data-submit>Submit Evidence</button></div>' : '<div class="adm-modal-actions"><button class="adm-btn primary" data-x>Close</button></div>'));
        m.el.querySelector('[data-x]').addEventListener('click', m.close);
        var sb = m.el.querySelector('[data-submit]');
        if (sb) sb.addEventListener('click', async function () {
          var notes = m.el.querySelector('#erResp').value.trim();
          if (!notes) { toast('Add a note describing your evidence', 'error'); return; }
          var res = await db().from('evidence_responses').insert({ request_id: rid, submitted_by: A().user.id, notes: notes });
          if (res.error) { toast(res.error.message, 'error'); return; }
          await db().from('evidence_requests').update({ status: 'submitted' }).eq('id', rid);
          audit('evidence_submitted', 'evidence_request', rid);
          try { await db().from('notifications').insert({ organization_id: org, user_id: rq.requested_by, type: 'evidence_approved', title: 'Evidence submitted: ' + rq.title, body: 'Evidence is ready for review.', link: 'pg_evidence_review' }); } catch (e) { }
          toast('Evidence submitted', 'success'); m.close(); renderEvidence(el);
        });
      }
      draw();
    } catch (err) { errorState(el, err.message, function () { renderEvidence(el); }); }
  }

  // ============================================================
  // EVIDENCE REVIEW
  // ============================================================
  async function renderEvidenceReview(el) {
    if (!can('evidence.approve')) return denied(el, 'evidence review');
    loading(el);
    try {
      var org = A().organization.id;
      var r = await Promise.all([
        db().from('evidence_requests').select('*').eq('organization_id', org).in('status', ['submitted', 'under_review']).order('updated_at', { ascending: false }),
        db().from('users').select('id,full_name').eq('organization_id', org),
      ]);
      if (r[0].error) throw r[0].error;
      var queue = r[0].data || [];
      var users = r[1].data || [];
      var userMap = {}; users.forEach(function (u) { userMap[u.id] = u.full_name; });

      var rows = queue.map(function (rq) {
        return '<tr><td style="font-weight:600;color:var(--text-bright)">' + esc(rq.title) + '</td><td>' + esc(userMap[rq.owner_id] || '—') + '</td><td>' + statusBadge(rq.status) + '</td><td>' + fmtDate(rq.due_date) + '</td><td><button class="adm-btn" data-review="' + rq.id + '">Review</button></td></tr>';
      }).join('') || '<tr><td colspan="5"><div class="empty" style="padding:24px">Nothing awaiting review.</div></td></tr>';

      el.innerHTML = '<div class="kb-page">' + head('Evidence Review', '') +
        '<div style="overflow-x:auto"><table class="adm-table"><thead><tr><th>Title</th><th>Owner</th><th>Status</th><th>Due</th><th></th></tr></thead><tbody>' + rows + '</tbody></table></div></div>';

      Array.prototype.forEach.call(el.querySelectorAll('[data-review]'), function (b) { b.addEventListener('click', function () { review(b.getAttribute('data-review')); }); });

      async function review(rid) {
        var rq = queue.find(function (x) { return x.id === rid; });
        var respRes = await db().from('evidence_responses').select('*').eq('request_id', rid).order('submitted_at', { ascending: false });
        var responses = respRes.data || [];
        var respHtml = responses.map(function (rp) { return '<div class="doc-row" style="padding:8px 10px"><div class="doc-info"><div class="doc-name" style="font-size:12px">' + esc(userMap[rp.submitted_by] || 'User') + '</div><div class="doc-meta">' + esc(rp.notes || '') + ' · ' + fmtDT(rp.submitted_at) + '</div></div></div>'; }).join('') || '<div class="empty" style="padding:12px">No submissions.</div>';
        var m = modal('<h3>Review · ' + esc(rq.title) + '</h3>' + respHtml +
          textarea('rvReason', 'Reason (required if rejecting)', '') +
          '<div class="adm-modal-actions"><button class="adm-btn" data-x>Close</button><button class="adm-btn danger" data-reject>Reject</button><button class="adm-btn" data-more>Need info</button><button class="adm-btn primary" data-approve>Approve</button></div>');
        m.el.querySelector('[data-x]').addEventListener('click', m.close);
        function decide(decision, newStatus) {
          return async function () {
            var reason = m.el.querySelector('#rvReason').value.trim();
            if (decision === 'rejected' && !reason) { toast('A reason is mandatory to reject', 'error'); return; }
            var ap = await db().from('evidence_approvals').insert({ request_id: rid, reviewed_by: A().user.id, decision: decision, reason: reason || null });
            if (ap.error) { toast(ap.error.message, 'error'); return; }
            await db().from('evidence_requests').update({ status: newStatus }).eq('id', rid);
            audit('evidence_' + decision, 'evidence_request', rid, reason ? { reason: reason } : null);
            try { await db().from('notifications').insert({ organization_id: org, user_id: rq.owner_id, type: decision === 'approved' ? 'evidence_approved' : 'evidence_rejected', title: 'Evidence ' + decision + ': ' + rq.title, body: reason || '', link: 'pg_evidence' }); } catch (e) { }
            toast('Evidence ' + decision, 'success'); m.close(); renderEvidenceReview(el);
          };
        }
        m.el.querySelector('[data-approve]').addEventListener('click', decide('approved', 'approved'));
        m.el.querySelector('[data-reject]').addEventListener('click', decide('rejected', 'rejected'));
        m.el.querySelector('[data-more]').addEventListener('click', decide('need_more_info', 'need_more_info'));
      }
    } catch (err) { errorState(el, err.message, function () { renderEvidenceReview(el); }); }
  }

  // ============================================================
  // TASKS
  // ============================================================
  async function renderTasks(el) {
    loading(el);
    try {
      var org = A().organization.id;
      var r = await Promise.all([
        db().from('tasks').select('*').eq('organization_id', org).order('due_date', { ascending: true }),
        db().from('users').select('id,full_name').eq('organization_id', org),
      ]);
      if (r[0].error) throw r[0].error;
      var tasks = r[0].data || [];
      var users = r[1].data || [];
      var userMap = {}; users.forEach(function (u) { userMap[u.id] = u.full_name; });
      var state = { scope: 'mine', status: '' };
      var today = new Date().toISOString().slice(0, 10);

      function draw() {
        var filtered = tasks.filter(function (t) {
          if (state.scope === 'mine' && t.assignee_id !== A().user.id) return false;
          if (state.status && t.status !== state.status) return false;
          return true;
        });
        var rows = filtered.map(function (t) {
          var overdue = t.due_date && t.due_date < today && t.status !== 'done';
          return '<tr><td><div style="font-weight:600;color:var(--text-bright)">' + esc(t.title) + '</div><div style="font-size:11px;color:var(--text-dim)">' + esc(t.module || '') + '</div></td>' +
            '<td>' + esc(userMap[t.assignee_id] || '—') + '</td>' +
            '<td><span class="adm-badge ' + (t.priority === 'critical' || t.priority === 'high' ? 'amber' : 'gray') + '">' + esc(t.priority) + '</span></td>' +
            '<td>' + statusBadge(t.status) + '</td>' +
            '<td>' + fmtDate(t.due_date) + (overdue ? ' <span class="adm-badge red">overdue</span>' : '') + '</td>' +
            '<td><button class="adm-btn" data-edit="' + t.id + '">Open</button></td></tr>';
        }).join('') || '<tr><td colspan="6"><div class="empty" style="padding:24px">No tasks.</div></td></tr>';

        el.innerHTML = '<div class="kb-page">' + head('Tasks', '<button class="adm-btn primary" id="tNew">New Task</button>') +
          '<div class="adm-tabs"><button class="adm-tab ' + (state.scope === 'mine' ? 'active' : '') + '" data-scope="mine">My Tasks</button><button class="adm-tab ' + (state.scope === 'team' ? 'active' : '') + '" data-scope="team">Team Tasks</button></div>' +
          '<div class="adm-toolbar"><select class="adm-select" id="tStatus"><option value="">All statuses</option>' + ['open', 'in_progress', 'blocked', 'done', 'cancelled'].map(function (s) { return '<option value="' + s + '"' + (state.status === s ? ' selected' : '') + '>' + s.replace(/_/g, ' ') + '</option>'; }).join('') + '</select><span class="adm-count">' + filtered.length + '</span></div>' +
          '<div style="overflow-x:auto"><table class="adm-table"><thead><tr><th>Task</th><th>Assignee</th><th>Priority</th><th>Status</th><th>Due</th><th></th></tr></thead><tbody>' + rows + '</tbody></table></div></div>';

        Array.prototype.forEach.call(el.querySelectorAll('[data-scope]'), function (b) { b.addEventListener('click', function () { state.scope = b.getAttribute('data-scope'); draw(); }); });
        el.querySelector('#tStatus').addEventListener('change', function (e) { state.status = e.target.value; draw(); });
        el.querySelector('#tNew').addEventListener('click', function () { editTask(null); });
        Array.prototype.forEach.call(el.querySelectorAll('[data-edit]'), function (b) { b.addEventListener('click', function () { editTask(b.getAttribute('data-edit')); }); });
      }

      function editTask(id) {
        var t = id ? tasks.find(function (x) { return x.id === id; }) : {};
        var m = modal('<h3>' + (id ? 'Edit Task' : 'New Task') + '</h3>' +
          field('tkTitle', 'Title', t.title || '') +
          textarea('tkDesc', 'Description', t.description || '') +
          select('tkAssignee', 'Assignee', [['', '— None —']].concat(users.map(function (u) { return [u.id, u.full_name]; })), t.assignee_id || A().user.id) +
          select('tkPrio', 'Priority', [['low', 'Low'], ['medium', 'Medium'], ['high', 'High'], ['critical', 'Critical']], t.priority || 'medium') +
          select('tkStatus', 'Status', [['open', 'Open'], ['in_progress', 'In progress'], ['blocked', 'Blocked'], ['done', 'Done'], ['cancelled', 'Cancelled']], t.status || 'open') +
          field('tkDue', 'Due date', t.due_date || '', 'date') +
          '<div class="adm-modal-actions"><button class="adm-btn" data-x>Cancel</button><button class="adm-btn primary" data-ok>Save</button></div>');
        m.el.querySelector('[data-x]').addEventListener('click', m.close);
        m.el.querySelector('[data-ok]').addEventListener('click', async function () {
          var title = m.el.querySelector('#tkTitle').value.trim();
          if (!title) { toast('Title required', 'error'); return; }
          var assignee = m.el.querySelector('#tkAssignee').value || null;
          var payload = { organization_id: org, title: title, description: m.el.querySelector('#tkDesc').value.trim() || null, assignee_id: assignee, priority: m.el.querySelector('#tkPrio').value, status: m.el.querySelector('#tkStatus').value, due_date: m.el.querySelector('#tkDue').value || null };
          var res;
          if (id) res = await db().from('tasks').update(payload).eq('id', id);
          else { payload.created_by = A().user.id; res = await db().from('tasks').insert(payload); }
          if (res.error) toast(res.error.message, 'error');
          else {
            if (!id && assignee && assignee !== A().user.id) { try { await db().from('notifications').insert({ organization_id: org, user_id: assignee, type: 'task_assigned', title: 'New task: ' + title, link: 'pg_tasks' }); } catch (e) { } }
            toast('Task saved', 'success'); m.close(); renderTasks(el);
          }
        });
      }
      draw();
    } catch (err) { errorState(el, err.message, function () { renderTasks(el); }); }
  }

  // ============================================================
  // REPORTS
  // ============================================================
  async function renderReports(el) {
    loading(el);
    try {
      var org = A().organization.id;
      var r = await Promise.all([
        db().from('control_implementations').select('status,maturity_level'),
        db().from('risks').select('inherent_score,status').neq('status', 'closed'),
        db().from('evidence_requests').select('status'),
        db().from('policies').select('review_date,status'),
        db().from('tasks').select('status,due_date'),
      ]);
      var impl = r[0].data || [], risks = r[1].data || [], ev = r[2].data || [], pol = r[3].data || [], tasks = r[4].data || [];
      var today = new Date().toISOString().slice(0, 10);

      var implemented = impl.filter(function (i) { return i.status === 'implemented'; }).length;
      var partial = impl.filter(function (i) { return i.status === 'partially_implemented'; }).length;
      var applicable = impl.filter(function (i) { return i.status !== 'not_applicable'; }).length;
      var compliance = applicable ? Math.round(((implemented + partial * 0.5) / applicable) * 100) : 0;

      var riskBuckets = { Critical: 0, High: 0, Medium: 0, Low: 0 };
      risks.forEach(function (rk) { riskBuckets[riskLevel(rk.inherent_score || 0).label]++; });
      var evBuckets = {}; ev.forEach(function (e) { evBuckets[e.status] = (evBuckets[e.status] || 0) + 1; });
      var policyOverdue = pol.filter(function (p) { return p.review_date && p.review_date < today && p.status !== 'archived'; }).length;
      var tasksOverdue = tasks.filter(function (t) { return t.due_date && t.due_date < today && t.status !== 'done'; }).length;

      function card(title, value, sub) { return '<div class="kb-stat"><div class="kb-stat-label">' + esc(title) + '</div><div class="kb-stat-value">' + esc(value) + '</div>' + (sub ? '<div class="kb-stat-sub">' + esc(sub) + '</div>' : '') + '</div>'; }

      el.innerHTML = '<div class="kb-page">' + head('Reports', '<button class="adm-btn" id="repCsv">Export Summary CSV</button>') +
        '<div class="kb-stats" style="grid-template-columns:repeat(auto-fit,minmax(160px,1fr))">' +
        card('Compliance', applicable ? compliance + '%' : '—', implemented + '/' + applicable + ' controls') +
        card('Open Risks', risks.length, riskBuckets.Critical + ' critical, ' + riskBuckets.High + ' high') +
        card('Evidence Open', ev.filter(function (e) { return ['approved', 'rejected'].indexOf(e.status) === -1; }).length, 'of ' + ev.length + ' total') +
        card('Policies Overdue', policyOverdue, 'past review date') +
        card('Tasks Overdue', tasksOverdue, 'past due date') +
        '</div>' +
        '<div class="kb-section"><h3>Risk Report</h3><table class="adm-table"><tbody>' +
        Object.keys(riskBuckets).map(function (k) { return '<tr><td>' + k + '</td><td style="font-weight:600">' + riskBuckets[k] + '</td></tr>'; }).join('') + '</tbody></table></div>' +
        '<div class="kb-section"><h3>Evidence Status Report</h3><table class="adm-table"><tbody>' +
        (Object.keys(evBuckets).length ? Object.keys(evBuckets).map(function (k) { return '<tr><td>' + esc(k.replace(/_/g, ' ')) + '</td><td style="font-weight:600">' + evBuckets[k] + '</td></tr>'; }).join('') : '<tr><td colspan="2"><div class="empty" style="padding:12px">No evidence requests.</div></td></tr>') +
        '</tbody></table></div>' +
        '<div class="kb-section"><h3>Control Maturity Report</h3><table class="adm-table"><tbody>' +
        [0, 1, 2, 3, 4, 5].map(function (lvl) { var n = impl.filter(function (i) { return i.maturity_level === lvl; }).length; return '<tr><td>Maturity ' + lvl + '</td><td style="font-weight:600">' + n + '</td></tr>'; }).join('') +
        '</tbody></table></div></div>';

      el.querySelector('#repCsv').addEventListener('click', function () {
        csvExport('grc-summary-' + today + '.csv', ['Metric', 'Value'], [
          ['Compliance %', applicable ? compliance : 'N/A'], ['Controls implemented', implemented], ['Controls applicable', applicable],
          ['Open risks', risks.length], ['Critical risks', riskBuckets.Critical], ['High risks', riskBuckets.High],
          ['Policies overdue', policyOverdue], ['Tasks overdue', tasksOverdue],
        ]);
      });
    } catch (err) { errorState(el, err.message, function () { renderReports(el); }); }
  }

  // ============================================================
  // ROUTER
  // ============================================================
  function render(pageId, el) {
    ensureStyles();
    switch (pageId) {
      case 'pg_frameworks': return renderFrameworks(el);
      case 'pg_controls': return renderControls(el);
      case 'pg_policies': return renderDocs(el, 'policies');
      case 'pg_procedures': return renderDocs(el, 'procedures');
      case 'pg_risks': return renderRisks(el);
      case 'pg_gaps': return renderGaps(el);
      case 'pg_evidence': return renderEvidence(el);
      case 'pg_evidence_review': return renderEvidenceReview(el);
      case 'pg_tasks': return renderTasks(el);
      case 'pg_reports': return renderReports(el);
      default: el.innerHTML = '<div class="kb-page"><div class="empty">Unknown module.</div></div>';
    }
  }

  window.GRCOps = { render: render };
})(window);
