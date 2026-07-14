/**
 * GRC Expert — Administration Modules
 * Owns: Users, Roles, Departments, Notifications, Audit Logs, Settings, Billing, Help
 *
 * Depends on: window.Auth (auth.js), window.ui (toast/escapeHtml), Supabase client.
 * All data is live from Supabase. Organization isolation + RBAC enforced by RLS
 * and SECURITY DEFINER functions (migration 004). No service_role in this file.
 *
 * Public API: window.Admin.render(pageId, containerEl)
 *   pageId ∈ pg_users|pg_roles|pg_departments|pg_notifications|pg_audit|pg_settings|pg_billing|pg_help
 */
(function (window) {
  'use strict';

  var esc = function (s) { return window.ui ? window.ui.escapeHtml(String(s == null ? '' : s)) : String(s == null ? '' : s); };
  var toast = function (m, t) { if (window.ui && window.ui.toast) window.ui.toast(m, t || 'success'); };
  function A() { return window.Auth; }
  function db() { return window.Auth.client; }
  function can(code) { return window.Auth && window.Auth.can(code); }
  function fmtDate(d) { return d ? new Date(d).toLocaleDateString() : '—'; }
  function fmtDT(d) { return d ? new Date(d).toLocaleString() : '—'; }

  // ---------- one-time styles ----------
  function injectStyles() {
    if (document.getElementById('admin-styles')) return;
    var s = document.createElement('style');
    s.id = 'admin-styles';
    s.textContent = [
      '.adm-head{display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap;margin-bottom:6px}',
      '.adm-crumb{font-size:11px;color:var(--text-dim);margin-bottom:14px}',
      '.adm-crumb b{color:var(--text-muted);font-weight:600}',
      '.adm-toolbar{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:14px}',
      '.adm-input{padding:8px 12px;border-radius:8px;background:var(--bg-hover);border:1px solid var(--border-strong,rgba(99,179,237,.15));color:var(--text);font-family:inherit;font-size:13px;outline:none}',
      '.adm-input:focus{border-color:var(--primary)}',
      '.adm-select{padding:8px 12px;border-radius:8px;background:var(--bg-hover);border:1px solid var(--border-strong,rgba(99,179,237,.15));color:var(--text);font-family:inherit;font-size:13px;cursor:pointer}',
      '.adm-table{width:100%;border-collapse:collapse;font-size:12.5px}',
      '.adm-table th{text-align:left;padding:9px 10px;color:var(--text-dim);font-weight:600;border-bottom:1px solid var(--border);font-size:11px;text-transform:uppercase;letter-spacing:.4px;white-space:nowrap}',
      '.adm-table td{padding:9px 10px;border-bottom:1px solid var(--border);color:var(--text);vertical-align:middle}',
      '.adm-table tr:hover td{background:var(--bg-hover)}',
      '.adm-badge{display:inline-block;padding:2px 8px;border-radius:20px;font-size:10.5px;font-weight:600;line-height:1.6}',
      '.adm-badge.green{background:rgba(16,185,129,.15);color:#6EE7B7}',
      '.adm-badge.gray{background:rgba(148,163,184,.15);color:#94A3B8}',
      '.adm-badge.amber{background:rgba(245,158,11,.15);color:#FCD34D}',
      '.adm-badge.red{background:rgba(239,68,68,.15);color:#FCA5A5}',
      '.adm-badge.blue{background:rgba(56,189,248,.15);color:#7DD3FC}',
      '.adm-btn{padding:6px 12px;border-radius:7px;border:1px solid var(--border-strong,rgba(99,179,237,.15));background:transparent;color:var(--text-muted);font-family:inherit;font-size:12px;cursor:pointer;transition:all .15s}',
      '.adm-btn:hover{border-color:var(--primary);color:var(--primary)}',
      '.adm-btn.danger:hover{border-color:#EF4444;color:#FCA5A5}',
      '.adm-btn.primary{background:linear-gradient(135deg,#0EA5E9,#0284C7);color:#fff;border:none}',
      '.adm-tabs{display:flex;gap:4px;border-bottom:1px solid var(--border);margin-bottom:18px;flex-wrap:wrap}',
      '.adm-tab{padding:9px 14px;background:none;border:none;border-bottom:2px solid transparent;color:var(--text-muted);font-family:inherit;font-size:13px;cursor:pointer}',
      '.adm-tab.active{color:var(--primary);border-bottom-color:var(--primary)}',
      '.adm-overlay{position:fixed;inset:0;background:rgba(0,0,0,.6);display:flex;align-items:center;justify-content:center;z-index:1000;padding:20px}',
      '.adm-modal{background:var(--bg-elev,#0B111E);border:1px solid var(--border-strong,rgba(99,179,237,.2));border-radius:14px;max-width:520px;width:100%;max-height:85vh;overflow:auto;padding:22px;box-shadow:0 20px 60px rgba(0,0,0,.5)}',
      '.adm-modal h3{font-size:16px;font-weight:700;color:var(--text-bright);margin-bottom:14px}',
      '.adm-field{margin-bottom:12px}',
      '.adm-field label{display:block;font-size:11px;color:var(--text-muted);margin-bottom:5px;font-weight:600}',
      '.adm-field input,.adm-field select,.adm-field textarea{width:100%;padding:9px 12px;border-radius:8px;background:var(--bg-hover);border:1px solid var(--border-strong,rgba(99,179,237,.15));color:var(--text);font-family:inherit;font-size:13px;outline:none}',
      '.adm-modal-actions{display:flex;justify-content:flex-end;gap:8px;margin-top:18px}',
      '.adm-perm-group{margin-bottom:14px}',
      '.adm-perm-group h4{font-size:11px;text-transform:uppercase;letter-spacing:.5px;color:var(--primary);margin-bottom:6px}',
      '.adm-check{display:flex;align-items:center;gap:8px;font-size:12.5px;color:var(--text);padding:3px 0}',
      '.adm-check input{width:auto}',
      '.adm-denied{text-align:center;padding:50px 20px;color:var(--text-muted)}',
      '.adm-denied .lock{font-size:34px;margin-bottom:10px}',
      '.adm-count{font-size:11px;color:var(--text-dim);margin-left:6px}',
      '.adm-pager{display:flex;gap:8px;align-items:center;justify-content:flex-end;margin-top:12px;font-size:12px;color:var(--text-muted)}'
    ].join('\n');
    document.head.appendChild(s);
  }

  // ---------- shared UI helpers ----------
  function loading(el) { el.innerHTML = '<div class="kb-page"><div class="empty">Loading…</div></div>'; }
  function denied(el, what) {
    el.innerHTML = '<div class="kb-page"><div class="adm-denied"><div class="lock">🔒</div><div>You don\'t have permission to view ' + esc(what) + '.</div></div></div>';
  }
  function errorState(el, msg, retryFn) {
    el.innerHTML = '<div class="kb-page"><div class="err-bar">Couldn\'t load this page: ' + esc(msg) + '</div><div style="margin-top:12px"><button class="adm-btn primary" id="admRetry">Retry</button></div></div>';
    var b = el.querySelector('#admRetry');
    if (b && retryFn) b.addEventListener('click', retryFn);
  }
  function head(title, actionsHtml) {
    return '<div class="adm-crumb"><b>Administration</b> / ' + esc(title) + '</div>' +
      '<div class="adm-head"><div style="font-size:18px;font-weight:700;color:var(--text-bright)">' + esc(title) + '</div>' +
      '<div style="display:flex;gap:8px">' + (actionsHtml || '') + '</div></div>';
  }
  function modal(html) {
    var ov = document.createElement('div');
    ov.className = 'adm-overlay';
    ov.innerHTML = '<div class="adm-modal">' + html + '</div>';
    ov.addEventListener('click', function (e) { if (e.target === ov) close(); });
    document.body.appendChild(ov);
    function close() { if (ov.parentNode) ov.parentNode.removeChild(ov); }
    document.addEventListener('keydown', function esckey(e) { if (e.key === 'Escape') { close(); document.removeEventListener('keydown', esckey); } });
    return { el: ov, close: close };
  }
  function confirmModal(title, message, onConfirm, danger) {
    var m = modal('<h3>' + esc(title) + '</h3><p style="font-size:13px;color:var(--text-muted);line-height:1.6">' + esc(message) + '</p>' +
      '<div class="adm-modal-actions"><button class="adm-btn" data-x>Cancel</button><button class="adm-btn ' + (danger ? 'danger' : 'primary') + '" data-ok>Confirm</button></div>');
    m.el.querySelector('[data-x]').addEventListener('click', m.close);
    m.el.querySelector('[data-ok]').addEventListener('click', function () { m.close(); onConfirm(); });
  }

  // ============================================================
  // USERS MODULE
  // ============================================================
  async function renderUsers(el) {
    if (!can('users.manage')) return denied(el, 'user management');
    loading(el);
    try {
      var org = A().organization.id;
      var r = await Promise.all([
        db().from('users').select('id,full_name,email,status,last_login_at,created_at,department_id').eq('organization_id', org).order('created_at', { ascending: false }),
        db().from('departments').select('id,name').eq('organization_id', org),
        db().from('roles').select('id,name').eq('organization_id', org),
        db().from('user_roles').select('user_id,role_id'),
      ]);
      if (r[0].error) throw r[0].error;
      var users = r[0].data || [];
      var depts = r[1].data || [];
      var roles = r[2].data || [];
      var userRoles = r[3].data || [];
      var deptMap = {}; depts.forEach(function (d) { deptMap[d.id] = d.name; });
      var roleMap = {}; roles.forEach(function (ro) { roleMap[ro.id] = ro.name; });
      var rolesByUser = {};
      userRoles.forEach(function (ur) { (rolesByUser[ur.user_id] = rolesByUser[ur.user_id] || []).push(ur.role_id); });

      var state = { search: '', role: '', dept: '', status: '', page: 0, per: 15 };

      function statusBadge(s) {
        var cls = s === 'active' ? 'green' : s === 'invited' ? 'blue' : s === 'suspended' ? 'amber' : 'gray';
        return '<span class="adm-badge ' + cls + '">' + esc(s) + '</span>';
      }

      function draw() {
        var filtered = users.filter(function (u) {
          if (state.search && (u.full_name + ' ' + u.email).toLowerCase().indexOf(state.search.toLowerCase()) === -1) return false;
          if (state.status && u.status !== state.status) return false;
          if (state.dept && u.department_id !== state.dept) return false;
          if (state.role && (rolesByUser[u.id] || []).indexOf(state.role) === -1) return false;
          return true;
        });
        var pages = Math.max(1, Math.ceil(filtered.length / state.per));
        if (state.page >= pages) state.page = pages - 1;
        var pageRows = filtered.slice(state.page * state.per, state.page * state.per + state.per);

        var rows = pageRows.map(function (u) {
          var rlist = (rolesByUser[u.id] || []).map(function (id) { return roleMap[id]; }).filter(Boolean);
          return '<tr>' +
            '<td><div style="font-weight:600;color:var(--text-bright)">' + esc(u.full_name) + '</div></td>' +
            '<td>' + esc(u.email) + '</td>' +
            '<td>' + esc(deptMap[u.department_id] || '—') + '</td>' +
            '<td>' + (rlist.length ? rlist.map(function (n) { return '<span class="adm-badge blue" style="margin:1px">' + esc(n) + '</span>'; }).join(' ') : '<span class="adm-badge gray">none</span>') + '</td>' +
            '<td>' + statusBadge(u.status) + '</td>' +
            '<td>' + fmtDT(u.last_login_at) + '</td>' +
            '<td>' + fmtDate(u.created_at) + '</td>' +
            '<td><button class="adm-btn" data-edit="' + u.id + '">Manage</button></td>' +
            '</tr>';
        }).join('') || '<tr><td colspan="8"><div class="empty" style="padding:24px">No users match your filters.</div></td></tr>';

        el.innerHTML = '<div class="kb-page">' +
          head('Users', '<button class="adm-btn primary" id="uInvite">Invite User</button>') +
          '<div class="adm-toolbar">' +
          '<input class="adm-input" id="uSearch" placeholder="Search name or email…" value="' + esc(state.search) + '" style="min-width:220px">' +
          '<select class="adm-select" id="uRole"><option value="">All roles</option>' + roles.map(function (ro) { return '<option value="' + ro.id + '"' + (state.role === ro.id ? ' selected' : '') + '>' + esc(ro.name) + '</option>'; }).join('') + '</select>' +
          '<select class="adm-select" id="uDept"><option value="">All departments</option>' + depts.map(function (d) { return '<option value="' + d.id + '"' + (state.dept === d.id ? ' selected' : '') + '>' + esc(d.name) + '</option>'; }).join('') + '</select>' +
          '<select class="adm-select" id="uStatus"><option value="">All statuses</option>' + ['active', 'invited', 'suspended', 'deactivated'].map(function (s) { return '<option value="' + s + '"' + (state.status === s ? ' selected' : '') + '>' + s + '</option>'; }).join('') + '</select>' +
          '<span class="adm-count">' + filtered.length + ' user' + (filtered.length === 1 ? '' : 's') + '</span>' +
          '</div>' +
          '<div style="overflow-x:auto"><table class="adm-table"><thead><tr><th>Name</th><th>Email</th><th>Department</th><th>Roles</th><th>Status</th><th>Last login</th><th>Created</th><th></th></tr></thead><tbody>' + rows + '</tbody></table></div>' +
          '<div class="adm-pager"><button class="adm-btn" id="uPrev">Prev</button><span>Page ' + (state.page + 1) + ' / ' + pages + '</span><button class="adm-btn" id="uNext">Next</button></div>' +
          '</div>';

        el.querySelector('#uSearch').addEventListener('input', function (e) { state.search = e.target.value; state.page = 0; draw(); });
        el.querySelector('#uRole').addEventListener('change', function (e) { state.role = e.target.value; state.page = 0; draw(); });
        el.querySelector('#uDept').addEventListener('change', function (e) { state.dept = e.target.value; state.page = 0; draw(); });
        el.querySelector('#uStatus').addEventListener('change', function (e) { state.status = e.target.value; state.page = 0; draw(); });
        el.querySelector('#uPrev').addEventListener('click', function () { if (state.page > 0) { state.page--; draw(); } });
        el.querySelector('#uNext').addEventListener('click', function () { if (state.page < pages - 1) { state.page++; draw(); } });
        el.querySelector('#uInvite').addEventListener('click', inviteModal);
        Array.prototype.forEach.call(el.querySelectorAll('[data-edit]'), function (b) {
          b.addEventListener('click', function () { manageModal(b.getAttribute('data-edit')); });
        });
        // preserve focus on search
        var si = el.querySelector('#uSearch'); if (si && state.search) { si.focus(); si.setSelectionRange(si.value.length, si.value.length); }
      }

      function inviteModal() {
        var m = modal('<h3>Invite User</h3>' +
          '<div class="adm-field"><label>Full name</label><input id="ivName" placeholder="Jane Doe"></div>' +
          '<div class="adm-field"><label>Email</label><input id="ivEmail" type="email" placeholder="jane@company.com"></div>' +
          '<p style="font-size:11px;color:var(--text-dim);line-height:1.5">An invitation email will be sent. The user joins your organization with no roles until you assign them.</p>' +
          '<div class="adm-modal-actions"><button class="adm-btn" data-x>Cancel</button><button class="adm-btn primary" data-ok>Send Invite</button></div>');
        m.el.querySelector('[data-x]').addEventListener('click', m.close);
        m.el.querySelector('[data-ok]').addEventListener('click', async function () {
          var name = m.el.querySelector('#ivName').value.trim();
          var email = m.el.querySelector('#ivEmail').value.trim();
          if (!name || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) { toast('Enter a valid name and email', 'error'); return; }
          var btn = m.el.querySelector('[data-ok]'); btn.disabled = true; btn.textContent = 'Sending…';
          try {
            var sess = await db().auth.getSession();
            var token = sess.data.session ? sess.data.session.access_token : '';
            var resp = await fetch('/api/invite', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
              body: JSON.stringify({ email: email, full_name: name }),
            });
            var j = await resp.json().catch(function () { return {}; });
            if (!resp.ok) { toast(j.error || 'Invite failed', 'error'); btn.disabled = false; btn.textContent = 'Send Invite'; return; }
            toast('Invitation sent to ' + email, 'success');
            m.close();
            renderUsers(el);
          } catch (e) {
            toast('Invite failed — is /api/invite deployed?', 'error');
            btn.disabled = false; btn.textContent = 'Send Invite';
          }
        });
      }

      function manageModal(uid) {
        var u = users.find(function (x) { return x.id === uid; });
        if (!u) return;
        var myRoles = (rolesByUser[uid] || []).slice();
        var roleChecks = roles.map(function (ro) {
          var checked = myRoles.indexOf(ro.id) !== -1;
          var isAdmin = ro.name === 'Administrator';
          return '<label class="adm-check"><input type="checkbox" data-role="' + ro.id + '"' + (checked ? ' checked' : '') + '> ' + esc(ro.name) + (isAdmin ? ' <span class="adm-badge amber" style="margin-left:4px">privileged</span>' : '') + '</label>';
        }).join('');
        var deptOpts = '<option value="">— None —</option>' + depts.map(function (d) { return '<option value="' + d.id + '"' + (u.department_id === d.id ? ' selected' : '') + '>' + esc(d.name) + '</option>'; }).join('');

        var m = modal('<h3>Manage · ' + esc(u.full_name) + '</h3>' +
          '<div class="adm-field"><label>Full name</label><input id="mgName" value="' + esc(u.full_name) + '"></div>' +
          '<div class="adm-field"><label>Email (read-only)</label><input value="' + esc(u.email) + '" disabled></div>' +
          '<div class="adm-field"><label>Department</label><select id="mgDept">' + deptOpts + '</select></div>' +
          '<div class="adm-field"><label>Status</label><select id="mgStatus">' + ['active', 'invited', 'suspended', 'deactivated'].map(function (s) { return '<option value="' + s + '"' + (u.status === s ? ' selected' : '') + '>' + s + '</option>'; }).join('') + '</select></div>' +
          '<div class="adm-field"><label>Roles</label>' + roleChecks + '</div>' +
          '<div class="adm-modal-actions"><button class="adm-btn" data-x>Cancel</button><button class="adm-btn primary" data-ok>Save Changes</button></div>');
        m.el.querySelector('[data-x]').addEventListener('click', m.close);
        m.el.querySelector('[data-ok]').addEventListener('click', async function () {
          var btn = m.el.querySelector('[data-ok]'); btn.disabled = true; btn.textContent = 'Saving…';
          try {
            // 1. profile: name + department
            var newName = m.el.querySelector('#mgName').value.trim();
            var newDept = m.el.querySelector('#mgDept').value || null;
            var up = await db().from('users').update({ full_name: newName, department_id: newDept }).eq('id', uid);
            if (up.error) throw up.error;

            // 2. status (via safe RPC — enforces last-admin)
            var newStatus = m.el.querySelector('#mgStatus').value;
            if (newStatus !== u.status) {
              var st = await db().rpc('set_user_status', { target_user: uid, new_status: newStatus });
              if (st.error) throw new Error(mapErr(st.error.message));
            }

            // 3. roles (diff → assign/remove via safe RPC)
            var checks = Array.prototype.slice.call(m.el.querySelectorAll('[data-role]'));
            for (var i = 0; i < checks.length; i++) {
              var rid = checks[i].getAttribute('data-role');
              var want = checks[i].checked;
              var have = myRoles.indexOf(rid) !== -1;
              if (want !== have) {
                var rr = await db().rpc('assign_user_role', { target_user: uid, target_role: rid, do_add: want });
                if (rr.error) throw new Error(mapErr(rr.error.message));
              }
            }
            toast('User updated', 'success');
            m.close();
            renderUsers(el);
          } catch (e) {
            toast(e.message || 'Update failed', 'error');
            btn.disabled = false; btn.textContent = 'Save Changes';
          }
        });
      }

      draw();
    } catch (err) {
      errorState(el, err.message || 'unknown error', function () { renderUsers(el); });
    }
  }

  function mapErr(msg) {
    if (/LAST_ADMIN/.test(msg)) return 'Cannot proceed: this is the last active Administrator.';
    if (/ESCALATION_BLOCKED/.test(msg)) return 'You cannot grant a role with permissions you do not have.';
    if (/PERMISSION_DENIED/.test(msg)) return 'You do not have permission for this action.';
    if (/NOT_IN_ORG|ROLE_NOT_IN_ORG/.test(msg)) return 'Target is not in your organization.';
    return msg;
  }

  // expose partial (rest appended in part 2)

  // ============================================================
  // ROLES MODULE
  // ============================================================
  async function renderRoles(el) {
    if (!can('users.manage')) return denied(el, 'role management');
    loading(el);
    try {
      var org = A().organization.id;
      var r = await Promise.all([
        db().from('roles').select('id,name,description,is_system').eq('organization_id', org).order('name'),
        db().from('permissions').select('id,code,description,module').order('module'),
        db().rpc('role_stats'),
        db().from('role_permissions').select('role_id,permission_id'),
      ]);
      if (r[0].error) throw r[0].error;
      var roles = r[0].data || [];
      var perms = r[1].data || [];
      var stats = {}; (r[2].data || []).forEach(function (s) { stats[s.role_id] = s; });
      var rolePerms = {}; (r[3].data || []).forEach(function (rp) { (rolePerms[rp.role_id] = rolePerms[rp.role_id] || []).push(rp.permission_id); });

      // caller's own permission ids (for escalation guard in UI)
      var myPermCodes = A().permissions; // Set of codes
      var permById = {}; perms.forEach(function (p) { permById[p.id] = p; });

      var rows = roles.map(function (ro) {
        var st = stats[ro.id] || { user_count: 0, perm_count: 0 };
        return '<tr>' +
          '<td><div style="font-weight:600;color:var(--text-bright)">' + esc(ro.name) + '</div><div style="font-size:11px;color:var(--text-dim)">' + esc(ro.description || '') + '</div></td>' +
          '<td>' + (ro.is_system ? '<span class="adm-badge gray">built-in</span>' : '<span class="adm-badge blue">custom</span>') + '</td>' +
          '<td>' + st.user_count + '</td>' +
          '<td>' + st.perm_count + '</td>' +
          '<td><button class="adm-btn" data-view="' + ro.id + '">Permissions</button>' +
          (ro.name !== 'Administrator' && !ro.is_system ? ' <button class="adm-btn danger" data-del="' + ro.id + '">Delete</button>' : '') +
          '</td></tr>';
      }).join('') || '<tr><td colspan="5"><div class="empty" style="padding:24px">No roles.</div></td></tr>';

      el.innerHTML = '<div class="kb-page">' +
        head('Roles', '<button class="adm-btn primary" id="rNew">Create Role</button>') +
        '<div style="overflow-x:auto"><table class="adm-table"><thead><tr><th>Role</th><th>Type</th><th>Users</th><th>Permissions</th><th></th></tr></thead><tbody>' + rows + '</tbody></table></div></div>';

      el.querySelector('#rNew').addEventListener('click', function () { editRole(null); });
      Array.prototype.forEach.call(el.querySelectorAll('[data-view]'), function (b) {
        b.addEventListener('click', function () { editRole(b.getAttribute('data-view')); });
      });
      Array.prototype.forEach.call(el.querySelectorAll('[data-del]'), function (b) {
        b.addEventListener('click', function () {
          var rid = b.getAttribute('data-del');
          var st = stats[rid] || { user_count: 0 };
          if (st.user_count > 0) { toast('Reassign its ' + st.user_count + ' user(s) first', 'error'); return; }
          confirmModal('Delete role', 'This custom role will be permanently removed. Continue?', async function () {
            var d = await db().from('roles').delete().eq('id', rid);
            if (d.error) toast(d.error.message, 'error');
            else { toast('Role deleted', 'success'); renderRoles(el); }
          }, true);
        });
      });

      function editRole(rid) {
        var ro = rid ? roles.find(function (x) { return x.id === rid; }) : null;
        var isAdmin = ro && ro.name === 'Administrator';
        var mine = rolePerms[rid] || [];
        // group perms by module
        var byModule = {};
        perms.forEach(function (p) { (byModule[p.module] = byModule[p.module] || []).push(p); });
        var groups = Object.keys(byModule).map(function (mod) {
          return '<div class="adm-perm-group"><h4>' + esc(mod) + '</h4>' + byModule[mod].map(function (p) {
            var checked = mine.indexOf(p.id) !== -1;
            var iCanGrant = myPermCodes.has(p.code);
            return '<label class="adm-check" title="' + esc(p.description || '') + '"><input type="checkbox" data-perm="' + p.id + '" data-code="' + esc(p.code) + '"' + (checked ? ' checked' : '') + (isAdmin || !iCanGrant ? ' disabled' : '') + '> ' + esc(p.code) + (!iCanGrant ? ' <span class="adm-badge gray" style="margin-left:4px">you lack this</span>' : '') + '</label>';
          }).join('') + '</div>';
        }).join('');

        var m = modal('<h3>' + (ro ? 'Role · ' + esc(ro.name) : 'Create Role') + '</h3>' +
          (ro ? '' : '<div class="adm-field"><label>Role name</label><input id="roName"></div><div class="adm-field"><label>Description</label><input id="roDesc"></div>') +
          (isAdmin ? '<p style="font-size:12px;color:var(--text-muted);margin-bottom:10px">The Administrator role always has all permissions and cannot be modified.</p>' : '') +
          '<div style="max-height:320px;overflow:auto;padding-right:4px">' + groups + '</div>' +
          '<div class="adm-modal-actions"><button class="adm-btn" data-x>Close</button>' + (isAdmin ? '' : '<button class="adm-btn primary" data-ok>Save</button>') + '</div>');
        m.el.querySelector('[data-x]').addEventListener('click', m.close);
        var okBtn = m.el.querySelector('[data-ok]');
        if (okBtn) okBtn.addEventListener('click', async function () {
          okBtn.disabled = true; okBtn.textContent = 'Saving…';
          try {
            var roleId = rid;
            if (!roleId) {
              var nm = m.el.querySelector('#roName').value.trim();
              if (!nm) { toast('Enter a role name', 'error'); okBtn.disabled = false; okBtn.textContent = 'Save'; return; }
              var ins = await db().from('roles').insert({ organization_id: org, name: nm, description: m.el.querySelector('#roDesc').value.trim(), is_system: false }).select('id').single();
              if (ins.error) throw ins.error;
              roleId = ins.data.id;
            }
            // diff permissions
            var checks = Array.prototype.slice.call(m.el.querySelectorAll('[data-perm]'));
            var want = checks.filter(function (c) { return c.checked; }).map(function (c) { return c.getAttribute('data-perm'); });
            var have = rolePerms[roleId] || [];
            var toAdd = want.filter(function (id) { return have.indexOf(id) === -1; });
            var toRemove = have.filter(function (id) { return want.indexOf(id) === -1; });
            if (toAdd.length) {
              var ins2 = await db().from('role_permissions').insert(toAdd.map(function (pid) { return { role_id: roleId, permission_id: pid }; }));
              if (ins2.error) throw ins2.error;
            }
            for (var i = 0; i < toRemove.length; i++) {
              var del = await db().from('role_permissions').delete().eq('role_id', roleId).eq('permission_id', toRemove[i]);
              if (del.error) throw del.error;
            }
            await db().from('audit_logs').insert({ organization_id: org, user_id: A().user.id, event: 'role_updated', entity_type: 'role', entity_id: roleId });
            toast('Role saved', 'success');
            m.close();
            renderRoles(el);
          } catch (e) {
            toast(e.message || 'Save failed', 'error');
            okBtn.disabled = false; okBtn.textContent = 'Save';
          }
        });
      }
    } catch (err) {
      errorState(el, err.message, function () { renderRoles(el); });
    }
  }

  // ============================================================
  // DEPARTMENTS MODULE
  // ============================================================
  async function renderDepartments(el) {
    if (!can('users.manage')) return denied(el, 'departments');
    loading(el);
    try {
      var org = A().organization.id;
      var r = await Promise.all([
        db().from('departments').select('id,name,parent_id,head_user_id,created_at').eq('organization_id', org).order('name'),
        db().from('users').select('id,full_name').eq('organization_id', org),
        db().rpc('department_user_counts'),
      ]);
      if (r[0].error) throw r[0].error;
      var depts = r[0].data || [];
      var users = r[1].data || [];
      var counts = {}; (r[2].data || []).forEach(function (c) { counts[c.department_id] = c.user_count; });
      var userMap = {}; users.forEach(function (u) { userMap[u.id] = u.full_name; });
      var search = '';

      function draw() {
        var filtered = depts.filter(function (d) { return !search || d.name.toLowerCase().indexOf(search.toLowerCase()) !== -1; });
        var rows = filtered.map(function (d) {
          return '<tr>' +
            '<td style="font-weight:600;color:var(--text-bright)">' + esc(d.name) + '</td>' +
            '<td>' + esc(userMap[d.head_user_id] || '—') + '</td>' +
            '<td>' + (counts[d.id] || 0) + '</td>' +
            '<td>' + fmtDate(d.created_at) + '</td>' +
            '<td><button class="adm-btn" data-edit="' + d.id + '">Edit</button> <button class="adm-btn danger" data-del="' + d.id + '">Delete</button></td>' +
            '</tr>';
        }).join('') || '<tr><td colspan="5"><div class="empty" style="padding:24px">No departments yet. Create one to organize users.</div></td></tr>';

        el.innerHTML = '<div class="kb-page">' +
          head('Departments', '<button class="adm-btn primary" id="dNew">Create Department</button>') +
          '<div class="adm-toolbar"><input class="adm-input" id="dSearch" placeholder="Search departments…" value="' + esc(search) + '" style="min-width:220px"><span class="adm-count">' + filtered.length + ' department' + (filtered.length === 1 ? '' : 's') + '</span></div>' +
          '<div style="overflow-x:auto"><table class="adm-table"><thead><tr><th>Name</th><th>Manager</th><th>Users</th><th>Created</th><th></th></tr></thead><tbody>' + rows + '</tbody></table></div></div>';

        el.querySelector('#dSearch').addEventListener('input', function (e) { search = e.target.value; draw(); var i = el.querySelector('#dSearch'); i.focus(); i.setSelectionRange(i.value.length, i.value.length); });
        el.querySelector('#dNew').addEventListener('click', function () { editDept(null); });
        Array.prototype.forEach.call(el.querySelectorAll('[data-edit]'), function (b) { b.addEventListener('click', function () { editDept(b.getAttribute('data-edit')); }); });
        Array.prototype.forEach.call(el.querySelectorAll('[data-del]'), function (b) {
          b.addEventListener('click', function () {
            var did = b.getAttribute('data-del');
            var n = counts[did] || 0;
            var msg = n > 0 ? 'This department has ' + n + ' assigned user(s). They will be unassigned (set to no department). Continue?' : 'Delete this department?';
            confirmModal('Delete department', msg, async function () {
              if (n > 0) { await db().from('users').update({ department_id: null }).eq('department_id', did); }
              var d = await db().from('departments').delete().eq('id', did);
              if (d.error) toast(d.error.message, 'error'); else { toast('Department deleted', 'success'); renderDepartments(el); }
            }, true);
          });
        });
      }

      function editDept(did) {
        var d = did ? depts.find(function (x) { return x.id === did; }) : null;
        var headOpts = '<option value="">— None —</option>' + users.map(function (u) { return '<option value="' + u.id + '"' + (d && d.head_user_id === u.id ? ' selected' : '') + '>' + esc(u.full_name) + '</option>'; }).join('');
        var m = modal('<h3>' + (d ? 'Edit Department' : 'Create Department') + '</h3>' +
          '<div class="adm-field"><label>Name</label><input id="deName" value="' + esc(d ? d.name : '') + '"></div>' +
          '<div class="adm-field"><label>Manager</label><select id="deHead">' + headOpts + '</select></div>' +
          '<div class="adm-modal-actions"><button class="adm-btn" data-x>Cancel</button><button class="adm-btn primary" data-ok>Save</button></div>');
        m.el.querySelector('[data-x]').addEventListener('click', m.close);
        m.el.querySelector('[data-ok]').addEventListener('click', async function () {
          var nm = m.el.querySelector('#deName').value.trim();
          if (!nm) { toast('Enter a name', 'error'); return; }
          var headId = m.el.querySelector('#deHead').value || null;
          var res;
          if (d) res = await db().from('departments').update({ name: nm, head_user_id: headId }).eq('id', did);
          else res = await db().from('departments').insert({ organization_id: org, name: nm, head_user_id: headId });
          if (res.error) toast(res.error.message, 'error');
          else { toast('Department saved', 'success'); m.close(); renderDepartments(el); }
        });
      }

      draw();
    } catch (err) {
      errorState(el, err.message, function () { renderDepartments(el); });
    }
  }

  // ============================================================
  // NOTIFICATIONS MODULE
  // ============================================================
  async function renderNotifications(el) {
    loading(el);
    try {
      var uid = A().user.id;
      var r = await db().from('notifications').select('id,type,title,body,link,is_read,created_at').eq('user_id', uid).order('created_at', { ascending: false }).limit(200);
      if (r.error) throw r.error;
      var notes = r.data || [];
      var prefs = (A().user.notification_prefs) || { evidence: true, risk: true, policy: true, task: true, invitation: true, approval: true, security: true };
      var filterType = '', showTab = 'inbox';

      function draw() {
        var unread = notes.filter(function (n) { return !n.is_read; }).length;
        var filtered = notes.filter(function (n) { return !filterType || n.type === filterType; });

        var inbox = filtered.map(function (n) {
          return '<div class="doc-row" style="padding:11px 12px;' + (n.is_read ? 'opacity:.6' : '') + '">' +
            '<div class="doc-info"><div class="doc-name" style="font-size:13px">' + (n.is_read ? '' : '<span style="color:var(--primary)">● </span>') + esc(n.title) + '</div>' +
            '<div class="doc-meta">' + esc((n.body || '').slice(0, 120)) + ' · ' + fmtDT(n.created_at) + '</div></div>' +
            '<div style="display:flex;gap:6px">' +
            (n.link ? '<button class="adm-btn" data-open="' + esc(n.link) + '">Open</button>' : '') +
            (!n.is_read ? '<button class="adm-btn" data-read="' + n.id + '">Mark read</button>' : '') +
            '<button class="adm-btn danger" data-del="' + n.id + '">Delete</button>' +
            '</div></div>';
        }).join('') || '<div class="empty" style="padding:30px">No notifications' + (filterType ? ' of this type' : '') + '.</div>';

        var types = ['evidence_assigned', 'evidence_approved', 'evidence_rejected', 'gap_complete', 'policy_generated', 'procedure_generated', 'risk_updated', 'task_assigned', 'review_due', 'system'];

        var prefRows = [
          ['evidence', 'Evidence requests'], ['risk', 'Risk due dates'], ['policy', 'Policy reviews'],
          ['task', 'Task assignments'], ['invitation', 'User invitations'], ['approval', 'Approval / rejection events'], ['security', 'Security alerts']
        ].map(function (p) {
          return '<label class="adm-check"><input type="checkbox" data-pref="' + p[0] + '"' + (prefs[p[0]] ? ' checked' : '') + '> ' + esc(p[1]) + '</label>';
        }).join('');

        el.innerHTML = '<div class="kb-page">' +
          head('Notifications', unread > 0 ? '<button class="adm-btn primary" id="nAllRead">Mark all read (' + unread + ')</button>' : '') +
          '<div class="adm-tabs"><button class="adm-tab ' + (showTab === 'inbox' ? 'active' : '') + '" data-tab="inbox">Inbox</button><button class="adm-tab ' + (showTab === 'prefs' ? 'active' : '') + '" data-tab="prefs">Preferences</button></div>' +
          (showTab === 'inbox'
            ? '<div class="adm-toolbar"><select class="adm-select" id="nType"><option value="">All types</option>' + types.map(function (t) { return '<option value="' + t + '"' + (filterType === t ? ' selected' : '') + '>' + t.replace(/_/g, ' ') + '</option>'; }).join('') + '</select></div>' + inbox
            : '<div class="kb-section"><h3>Notify me about</h3>' + prefRows + '<div style="margin-top:14px"><button class="adm-btn primary" id="nSavePrefs">Save Preferences</button></div></div>') +
          '</div>';

        Array.prototype.forEach.call(el.querySelectorAll('[data-tab]'), function (b) { b.addEventListener('click', function () { showTab = b.getAttribute('data-tab'); draw(); }); });

        if (showTab === 'inbox') {
          var ts = el.querySelector('#nType'); if (ts) ts.addEventListener('change', function (e) { filterType = e.target.value; draw(); });
          var ar = el.querySelector('#nAllRead');
          if (ar) ar.addEventListener('click', async function () {
            await db().from('notifications').update({ is_read: true }).eq('user_id', uid).eq('is_read', false);
            notes.forEach(function (n) { n.is_read = true; });
            updateBadge();
            draw();
          });
          Array.prototype.forEach.call(el.querySelectorAll('[data-read]'), function (b) {
            b.addEventListener('click', async function () {
              var id = b.getAttribute('data-read');
              await db().from('notifications').update({ is_read: true }).eq('id', id);
              var n = notes.find(function (x) { return x.id === id; }); if (n) n.is_read = true;
              updateBadge(); draw();
            });
          });
          Array.prototype.forEach.call(el.querySelectorAll('[data-del]'), function (b) {
            b.addEventListener('click', async function () {
              var id = b.getAttribute('data-del');
              await db().from('notifications').delete().eq('id', id);
              notes = notes.filter(function (x) { return x.id !== id; });
              updateBadge(); draw();
            });
          });
          Array.prototype.forEach.call(el.querySelectorAll('[data-open]'), function (b) {
            b.addEventListener('click', function () {
              var link = b.getAttribute('data-open');
              var nav = document.querySelector('.nav-item[data-page="' + link + '"]');
              if (nav) nav.click(); else toast('Linked item unavailable', 'error');
            });
          });
        } else {
          el.querySelector('#nSavePrefs').addEventListener('click', async function () {
            var newPrefs = {};
            Array.prototype.forEach.call(el.querySelectorAll('[data-pref]'), function (c) { newPrefs[c.getAttribute('data-pref')] = c.checked; });
            var up = await db().from('users').update({ notification_prefs: newPrefs }).eq('id', uid);
            if (up.error) toast(up.error.message, 'error');
            else { A().user.notification_prefs = newPrefs; prefs = newPrefs; toast('Preferences saved', 'success'); }
          });
        }
      }
      draw();
    } catch (err) {
      errorState(el, err.message, function () { renderNotifications(el); });
    }
  }

  // sidebar badge (called on load + after changes)
  async function updateBadge() {
    try {
      if (!A() || !A().user) return;
      var r = await db().from('notifications').select('id', { count: 'exact', head: true }).eq('user_id', A().user.id).eq('is_read', false);
      var n = r.count || 0;
      var item = document.querySelector('.nav-item[data-page="pg_notifications"]');
      if (!item) return;
      var badge = item.querySelector('.adm-nav-badge');
      if (n > 0) {
        if (!badge) { badge = document.createElement('span'); badge.className = 'adm-nav-badge'; badge.style.cssText = 'margin-left:auto;background:#EF4444;color:#fff;font-size:10px;font-weight:700;border-radius:10px;padding:1px 7px'; item.appendChild(badge); }
        badge.textContent = n > 99 ? '99+' : String(n);
      } else if (badge) { badge.remove(); }
    } catch (e) { }
  }

  // ============================================================
  // AUDIT LOGS MODULE
  // ============================================================
  async function renderAudit(el) {
    if (!can('audit.view')) return denied(el, 'audit logs');
    loading(el);
    try {
      var org = A().organization.id;
      var r = await Promise.all([
        db().from('audit_logs').select('id,user_id,event,entity_type,entity_id,after_state,created_at').eq('organization_id', org).order('created_at', { ascending: false }).limit(500),
        db().from('users').select('id,full_name,email').eq('organization_id', org),
      ]);
      if (r[0].error) throw r[0].error;
      var logs = r[0].data || [];
      var users = r[1].data || [];
      var uMap = {}; users.forEach(function (u) { uMap[u.id] = u; });
      var state = { search: '', event: '', from: '', to: '', page: 0, per: 20 };
      var events = logs.reduce(function (acc, l) { if (acc.indexOf(l.event) === -1) acc.push(l.event); return acc; }, []);

      function draw() {
        var filtered = logs.filter(function (l) {
          if (state.event && l.event !== state.event) return false;
          if (state.from && new Date(l.created_at) < new Date(state.from)) return false;
          if (state.to && new Date(l.created_at) > new Date(state.to + 'T23:59:59')) return false;
          if (state.search) {
            var u = uMap[l.user_id] || {};
            var hay = (l.event + ' ' + (l.entity_type || '') + ' ' + (u.full_name || '') + ' ' + (u.email || '')).toLowerCase();
            if (hay.indexOf(state.search.toLowerCase()) === -1) return false;
          }
          return true;
        });
        var pages = Math.max(1, Math.ceil(filtered.length / state.per));
        if (state.page >= pages) state.page = pages - 1;
        var rows = filtered.slice(state.page * state.per, state.page * state.per + state.per).map(function (l) {
          var u = uMap[l.user_id] || {};
          return '<tr>' +
            '<td style="white-space:nowrap">' + fmtDT(l.created_at) + '</td>' +
            '<td>' + esc(u.full_name || '—') + '</td>' +
            '<td>' + esc(u.email || '—') + '</td>' +
            '<td><span class="adm-badge blue">' + esc(l.event) + '</span></td>' +
            '<td>' + esc(l.entity_type || '—') + '</td>' +
            '<td><button class="adm-btn" data-meta="' + l.id + '">View</button></td>' +
            '</tr>';
        }).join('') || '<tr><td colspan="6"><div class="empty" style="padding:24px">No audit events match your filters.</div></td></tr>';

        el.innerHTML = '<div class="kb-page">' +
          head('Audit Logs', '<button class="adm-btn" id="aExport">Export CSV</button>') +
          '<div class="adm-toolbar">' +
          '<input class="adm-input" id="aSearch" placeholder="Search actor or action…" value="' + esc(state.search) + '" style="min-width:200px">' +
          '<select class="adm-select" id="aEvent"><option value="">All actions</option>' + events.map(function (e2) { return '<option value="' + esc(e2) + '"' + (state.event === e2 ? ' selected' : '') + '>' + esc(e2) + '</option>'; }).join('') + '</select>' +
          '<input class="adm-input" id="aFrom" type="date" value="' + esc(state.from) + '" title="From date">' +
          '<input class="adm-input" id="aTo" type="date" value="' + esc(state.to) + '" title="To date">' +
          '<span class="adm-count">' + filtered.length + ' event' + (filtered.length === 1 ? '' : 's') + '</span>' +
          '</div>' +
          '<div style="overflow-x:auto"><table class="adm-table"><thead><tr><th>Timestamp</th><th>Actor</th><th>Email</th><th>Action</th><th>Object</th><th></th></tr></thead><tbody>' + rows + '</tbody></table></div>' +
          '<div class="adm-pager"><button class="adm-btn" id="aPrev">Prev</button><span>Page ' + (state.page + 1) + ' / ' + pages + '</span><button class="adm-btn" id="aNext">Next</button></div>' +
          '</div>';

        el.querySelector('#aSearch').addEventListener('input', function (e) { state.search = e.target.value; state.page = 0; draw(); var i = el.querySelector('#aSearch'); i.focus(); i.setSelectionRange(i.value.length, i.value.length); });
        el.querySelector('#aEvent').addEventListener('change', function (e) { state.event = e.target.value; state.page = 0; draw(); });
        el.querySelector('#aFrom').addEventListener('change', function (e) { state.from = e.target.value; state.page = 0; draw(); });
        el.querySelector('#aTo').addEventListener('change', function (e) { state.to = e.target.value; state.page = 0; draw(); });
        el.querySelector('#aPrev').addEventListener('click', function () { if (state.page > 0) { state.page--; draw(); } });
        el.querySelector('#aNext').addEventListener('click', function () { if (state.page < pages - 1) { state.page++; draw(); } });
        el.querySelector('#aExport').addEventListener('click', function () { exportCsv(filtered); });
        Array.prototype.forEach.call(el.querySelectorAll('[data-meta]'), function (b) {
          b.addEventListener('click', function () {
            var l = logs.find(function (x) { return x.id === b.getAttribute('data-meta'); });
            var u = uMap[l.user_id] || {};
            var meta = l.after_state ? JSON.stringify(l.after_state, null, 2) : '(none)';
            modal('<h3>Audit Event</h3><div style="font-size:12.5px;line-height:1.9;color:var(--text)">' +
              '<div><b>Time:</b> ' + fmtDT(l.created_at) + '</div>' +
              '<div><b>Actor:</b> ' + esc(u.full_name || '—') + ' (' + esc(u.email || '—') + ')</div>' +
              '<div><b>Action:</b> ' + esc(l.event) + '</div>' +
              '<div><b>Object:</b> ' + esc(l.entity_type || '—') + ' ' + esc(l.entity_id || '') + '</div></div>' +
              '<div style="margin-top:10px"><b style="font-size:12px;color:var(--text-muted)">Metadata</b><pre style="background:var(--bg-hover);padding:10px;border-radius:8px;font-size:11px;overflow:auto;color:var(--text);margin-top:6px">' + esc(meta) + '</pre></div>' +
              '<div class="adm-modal-actions"><button class="adm-btn primary" data-x>Close</button></div>').el.querySelector('[data-x]').addEventListener('click', function (ev) { ev.target.closest('.adm-overlay').remove(); });
          });
        });
      }

      function exportCsv(rows) {
        var header = ['Timestamp', 'Actor', 'Email', 'Action', 'ObjectType', 'ObjectID'];
        var lines = [header.join(',')];
        rows.forEach(function (l) {
          var u = uMap[l.user_id] || {};
          var cells = [l.created_at, u.full_name || '', u.email || '', l.event, l.entity_type || '', l.entity_id || ''];
          lines.push(cells.map(function (c) { return '"' + String(c).replace(/"/g, '""') + '"'; }).join(','));
        });
        var blob = new Blob([lines.join('\n')], { type: 'text/csv' });
        var a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = 'audit-logs-' + new Date().toISOString().slice(0, 10) + '.csv';
        document.body.appendChild(a); a.click(); document.body.removeChild(a);
        toast('CSV exported', 'success');
      }
      draw();
    } catch (err) {
      errorState(el, err.message, function () { renderAudit(el); });
    }
  }

  // ============================================================
  // SETTINGS MODULE (tabbed)
  // ============================================================
  async function renderSettings(el) {
    loading(el);
    try {
      var A2 = A(), org = A2.organization, uid = A2.user.id;
      var tab = 'org';
      var subRes = await db().from('subscriptions').select('*').eq('organization_id', org.id).maybeSingle();
      var sub = subRes.data;
      // resolve the current user's department name (for My Profile display)
      var myDeptName = '—';
      if (A2.user.department_id) {
        var dRes = await db().from('departments').select('name').eq('id', A2.user.department_id).maybeSingle();
        if (dRes.data) myDeptName = dRes.data.name;
      }

      function draw() {
        var canOrg = can('settings.manage');
        var tabs = [['org', 'Organization'], ['me', 'My Profile'], ['security', 'Security'], ['notif', 'Notifications'], ['brand', 'Branding'], ['data', 'Data & Retention']];
        var tabsHtml = tabs.map(function (t) { return '<button class="adm-tab ' + (tab === t[0] ? 'active' : '') + '" data-tab="' + t[0] + '">' + t[1] + '</button>'; }).join('');

        var body = '';
        if (tab === 'org') {
          if (!canOrg) body = '<div class="adm-denied"><div class="lock">🔒</div>Only administrators can edit organization settings.</div>';
          else body = '<div class="kb-section"><h3>Organization Profile</h3>' +
            field('oName', 'Organization name', org.name) +
            field('oLegal', 'Legal name', org.legal_name || '') +
            field('oIndustry', 'Industry', org.industry || '') +
            field('oCountry', 'Country', org.country || '') +
            field('oTz', 'Time zone', org.timezone || 'Asia/Riyadh') +
            field('oContact', 'Contact email', org.contact_email || '', 'email') +
            '<div class="adm-field"><label>Organization logo</label>' +
            (org.logo_url ? '<div style="margin-bottom:8px"><img src="' + esc(org.logo_url) + '" alt="Current logo" style="max-height:48px;border-radius:6px;background:var(--bg-hover);padding:4px"></div>' : '') +
            '<input id="oLogo" type="file" accept="image/png,image/jpeg,image/svg+xml,image/webp"><div style="font-size:11px;color:var(--text-dim);margin-top:4px">PNG, JPG, WebP or SVG · max 2 MB</div></div>' +
            '<button class="adm-btn primary" id="saveOrg" style="margin-top:8px">Save Organization</button></div>';
        } else if (tab === 'me') {
          body = '<div class="kb-section"><h3>My Profile</h3>' +
            field('pName', 'Full name', A2.user.full_name) +
            '<div class="adm-field"><label>Email</label><input value="' + esc(A2.user.email) + '" disabled></div>' +
            '<div class="adm-field"><label>Role(s)</label><input value="' + esc(A2.roles.join(', ') || 'None') + '" disabled></div>' +
            '<div class="adm-field"><label>Department</label><input value="' + esc(myDeptName) + '" disabled></div>' +
            field('pTitle', 'Job title', A2.user.job_title || '') +
            '<button class="adm-btn primary" id="saveMe" style="margin-top:8px">Save Profile</button></div>' +
            '<div class="kb-section"><h3>Change Password</h3>' +
            '<div class="adm-field"><label>New password</label><div style="position:relative"><input id="pPass" type="password" placeholder="Min 8 chars, 1 letter, 1 number, 1 special"><button type="button" class="adm-btn" id="pToggle" style="position:absolute;right:4px;top:3px;padding:4px 8px" aria-label="Show password">Show</button></div></div>' +
            '<div id="pHint" style="font-size:11px;color:var(--text-dim);margin-bottom:8px"></div>' +
            '<button class="adm-btn primary" id="savePass">Update Password</button></div>';
        } else if (tab === 'security') {
          body = '<div class="kb-section"><h3>Security</h3>' +
            '<p style="font-size:12.5px;color:var(--text-muted);line-height:1.7">' +
            'Your session uses Supabase Auth with automatic JWT refresh. Sessions persist securely in this browser and expire per your project policy.<br><br>' +
            '<b style="color:var(--text)">Multi-factor authentication:</b> managed at the Supabase Auth level. MFA enrollment UI is not yet enabled in this build.<br>' +
            '<b style="color:var(--text)">Active sessions across devices:</b> not exposed by the current Supabase client configuration.</p>' +
            '<button class="adm-btn" id="secSignout" style="margin-top:8px">Sign out of this session</button></div>';
        } else if (tab === 'notif') {
          var prefs = A2.user.notification_prefs || {};
          body = '<div class="kb-section"><h3>Notification Preferences</h3>' +
            [['evidence', 'Evidence requests'], ['risk', 'Risk due dates'], ['policy', 'Policy reviews'], ['task', 'Task assignments'], ['invitation', 'User invitations'], ['approval', 'Approval / rejection events'], ['security', 'Security alerts']].map(function (p) {
              return '<label class="adm-check"><input type="checkbox" data-npref="' + p[0] + '"' + (prefs[p[0]] !== false ? ' checked' : '') + '> ' + esc(p[1]) + '</label>';
            }).join('') +
            '<button class="adm-btn primary" id="saveNotif" style="margin-top:12px">Save Preferences</button></div>';
        } else if (tab === 'brand') {
          body = '<div class="kb-section"><h3>Branding</h3>' +
            '<div class="adm-field"><label>Primary display name</label><input value="' + esc(org.name) + '" disabled></div>' +
            '<div class="adm-field"><label>Organization logo</label>' + (org.logo_url ? '<div><img src="' + esc(org.logo_url) + '" alt="Logo" style="max-height:56px;border-radius:6px;background:var(--bg-hover);padding:4px"></div><div style="font-size:11px;color:var(--text-dim);margin-top:4px">Upload a new logo from the Organization tab.</div>' : '<div style="font-size:12px;color:var(--text-dim)">No logo set. Upload one from the Organization tab (requires a public "logos" storage bucket).</div>') + '</div>' +
            '<div class="adm-field"><label>Email sender (SMTP)</label><div style="font-size:12.5px;color:var(--text-muted)">Custom SMTP status: <span class="adm-badge gray">Not configured</span><br><span style="font-size:11px;color:var(--text-dim)">Emails currently send via Supabase\'s default sender. Configure SMTP in Supabase → Auth → SMTP to use noreply@your-domain.</span></div></div></div>';
        } else if (tab === 'data') {
          body = '<div class="kb-section"><h3>Data & Retention</h3>' +
            '<p style="font-size:12.5px;color:var(--text-muted);line-height:1.7">Audit logs are append-only and retained indefinitely. Evidence and documents remain until explicitly deleted by an administrator.</p>' +
            '<button class="adm-btn" id="dataExport" style="margin-top:8px">Request Data Export</button>' +
            (canOrg ? '<div style="margin-top:20px;padding-top:16px;border-top:1px solid var(--border)"><h3 style="color:#FCA5A5">Danger Zone</h3><p style="font-size:12px;color:var(--text-muted)">Organization deletion is disabled in this build for safety and must be performed by a platform administrator.</p></div>' : '') +
            '</div>';
        }

        el.innerHTML = '<div class="kb-page">' + head('Settings', '') +
          '<div class="adm-tabs">' + tabsHtml + '</div>' + body + '</div>';

        Array.prototype.forEach.call(el.querySelectorAll('[data-tab]'), function (b) { b.addEventListener('click', function () { tab = b.getAttribute('data-tab'); draw(); }); });
        wire();
      }

      function field(id, label, val, type) {
        return '<div class="adm-field"><label>' + esc(label) + '</label><input id="' + id + '" type="' + (type || 'text') + '" value="' + esc(val) + '"></div>';
      }

      function wire() {
        var so = el.querySelector('#saveOrg');
        if (so) so.addEventListener('click', async function () {
          so.disabled = true; so.textContent = 'Saving…';
          var patch = {
            name: el.querySelector('#oName').value.trim(),
            legal_name: el.querySelector('#oLegal').value.trim() || null,
            industry: el.querySelector('#oIndustry').value.trim() || null,
            country: el.querySelector('#oCountry').value.trim() || null,
            timezone: el.querySelector('#oTz').value.trim() || null,
            contact_email: el.querySelector('#oContact').value.trim() || null,
          };
          // Optional logo upload → Supabase Storage "logos" bucket (tenant-scoped path)
          var fileInput = el.querySelector('#oLogo');
          if (fileInput && fileInput.files && fileInput.files[0]) {
            var f = fileInput.files[0];
            if (f.size > 2 * 1024 * 1024) { toast('Logo must be under 2 MB', 'error'); so.disabled = false; so.textContent = 'Save Organization'; return; }
            var ext = (f.name.split('.').pop() || 'png').toLowerCase().replace(/[^a-z0-9]/g, '');
            var path = org.id + '/logo-' + Date.now() + '.' + ext;
            try {
              var up = await db().storage.from('logos').upload(path, f, { upsert: true, contentType: f.type });
              if (up.error) {
                toast('Logo upload skipped: ' + up.error.message + ' (create a public "logos" storage bucket to enable)', 'error');
              } else {
                var pub = db().storage.from('logos').getPublicUrl(path);
                if (pub && pub.data && pub.data.publicUrl) patch.logo_url = pub.data.publicUrl;
              }
            } catch (e) {
              toast('Logo upload unavailable — saving other fields', 'error');
            }
          }
          var r = await db().from('organizations').update(patch).eq('id', org.id);
          so.disabled = false; so.textContent = 'Save Organization';
          if (r.error) toast(r.error.message, 'error');
          else { Object.assign(org, patch); toast('Organization saved', 'success'); draw(); }
        });
        var sm = el.querySelector('#saveMe');
        if (sm) sm.addEventListener('click', async function () {
          var patch = { full_name: el.querySelector('#pName').value.trim(), job_title: el.querySelector('#pTitle').value.trim() || null };
          var r = await db().from('users').update(patch).eq('id', uid);
          if (r.error) toast(r.error.message, 'error');
          else { A2.user.full_name = patch.full_name; A2.user.job_title = patch.job_title; toast('Profile saved', 'success'); var c = document.getElementById('userChipName'); if (c) c.textContent = patch.full_name; }
        });
        var pt = el.querySelector('#pToggle');
        if (pt) pt.addEventListener('click', function () { var i = el.querySelector('#pPass'); if (i.type === 'password') { i.type = 'text'; pt.textContent = 'Hide'; } else { i.type = 'password'; pt.textContent = 'Show'; } });
        var pp = el.querySelector('#pPass');
        if (pp) pp.addEventListener('input', function () {
          var v = pp.value, ok = v.length >= 8 && /[A-Za-z]/.test(v) && /[0-9]/.test(v) && /[^A-Za-z0-9]/.test(v);
          el.querySelector('#pHint').innerHTML = ok ? '<span style="color:#6EE7B7">✓ Meets requirements</span>' : '8+ chars, 1 letter, 1 number, 1 special character';
        });
        var sp = el.querySelector('#savePass');
        if (sp) sp.addEventListener('click', async function () {
          var v = el.querySelector('#pPass').value;
          if (!(v.length >= 8 && /[A-Za-z]/.test(v) && /[0-9]/.test(v) && /[^A-Za-z0-9]/.test(v))) { toast('Password does not meet requirements', 'error'); return; }
          var r = await db().auth.updateUser({ password: v });
          if (r.error) toast(r.error.message, 'error'); else { el.querySelector('#pPass').value = ''; toast('Password updated', 'success'); }
        });
        var ss = el.querySelector('#secSignout');
        if (ss) ss.addEventListener('click', function () { A2.logout(); });
        var sn = el.querySelector('#saveNotif');
        if (sn) sn.addEventListener('click', async function () {
          var np = {}; Array.prototype.forEach.call(el.querySelectorAll('[data-npref]'), function (c) { np[c.getAttribute('data-npref')] = c.checked; });
          var r = await db().from('users').update({ notification_prefs: np }).eq('id', uid);
          if (r.error) toast(r.error.message, 'error'); else { A2.user.notification_prefs = np; toast('Preferences saved', 'success'); }
        });
        var de = el.querySelector('#dataExport');
        if (de) de.addEventListener('click', async function () {
          await db().from('support_tickets').insert({ organization_id: org.id, user_id: uid, subject: 'Data export request', category: 'general', message: 'User requested an organization data export.' });
          toast('Data export request submitted', 'success');
        });
      }
      draw();
    } catch (err) {
      errorState(el, err.message, function () { renderSettings(el); });
    }
  }

  // ============================================================
  // BILLING MODULE
  // ============================================================
  async function renderBilling(el) {
    if (!can('settings.manage')) return denied(el, 'billing');
    loading(el);
    try {
      var org = A().organization.id;
      var r = await Promise.all([
        db().from('subscriptions').select('*').eq('organization_id', org).maybeSingle(),
        db().from('licenses').select('*').eq('organization_id', org).order('issued_at', { ascending: false }),
        db().from('users').select('id,status', { count: 'exact', head: false }).eq('organization_id', org),
        db().from('ai_usage').select('id', { count: 'exact', head: true }).eq('organization_id', org),
      ]);
      var sub = r[0].data;
      var licenses = r[1].data || [];
      var users = r[2].data || [];
      var activeUsers = users.filter(function (u) { return u.status === 'active'; }).length;
      var aiCount = r[3].count || 0;

      function stat(label, val, sub2) {
        return '<div class="kb-stat"><div class="kb-stat-label">' + esc(label) + '</div><div class="kb-stat-value">' + esc(val) + '</div>' + (sub2 ? '<div class="kb-stat-sub">' + esc(sub2) + '</div>' : '') + '</div>';
      }

      var planName = sub ? sub.plan : 'trial';
      var status = sub ? sub.status : 'trialing';
      var seats = sub ? sub.seats : '—';
      var quota = sub ? sub.ai_monthly_quota : '—';
      var trialEnds = sub && sub.trial_ends_at ? fmtDate(sub.trial_ends_at) : '—';
      var renew = sub && sub.current_period_end ? fmtDate(sub.current_period_end) : '—';

      el.innerHTML = '<div class="kb-page">' + head('Billing & Subscription', '') +
        '<div class="kb-stats" style="grid-template-columns:repeat(auto-fit,minmax(160px,1fr))">' +
        stat('Current Plan', String(planName).toUpperCase(), 'Status: ' + status) +
        stat('Licensed Users', seats, activeUsers + ' active') +
        stat('AI Requests', aiCount, 'Quota: ' + quota + '/mo') +
        stat('Trial Ends', trialEnds, '') +
        stat('Renewal Date', renew, '') +
        '</div>' +
        '<div class="kb-section"><h3>Plan Details</h3>' +
        '<table class="adm-table"><tbody>' +
        row('Plan', String(planName).toUpperCase()) +
        row('Subscription status', esc(status)) +
        row('Licensed seats', String(seats)) +
        row('Active users', String(activeUsers)) +
        row('AI monthly quota', String(quota)) +
        row('Storage usage', 'Not metered in this build') +
        row('Billing contact', esc(A().organization.contact_email || 'Not set — configure in Settings')) +
        '</tbody></table></div>' +
        '<div class="kb-section"><h3>Licenses</h3>' +
        (licenses.length ? '<table class="adm-table"><thead><tr><th>Key</th><th>Plan</th><th>Seats</th><th>Issued</th><th>Expires</th><th>Active</th></tr></thead><tbody>' +
          licenses.map(function (l) { return '<tr><td style="font-family:monospace;font-size:11px">' + esc(l.license_key) + '</td><td>' + esc(l.plan) + '</td><td>' + l.seats + '</td><td>' + fmtDate(l.issued_at) + '</td><td>' + fmtDate(l.expires_at) + '</td><td>' + (l.is_active ? '<span class="adm-badge green">yes</span>' : '<span class="adm-badge gray">no</span>') + '</td></tr>'; }).join('') + '</tbody></table>'
          : '<div class="empty" style="padding:20px">No licenses issued.</div>') +
        '</div>' +
        '<div class="kb-section"><h3>Invoices</h3><div class="empty" style="padding:20px">No payment provider is connected, so invoice history is unavailable. Plan and license data above is managed internally.</div></div>' +
        '</div>';

      function row(k, v) { return '<tr><td style="color:var(--text-muted);width:200px">' + esc(k) + '</td><td style="font-weight:600;color:var(--text-bright)">' + v + '</td></tr>'; }
    } catch (err) {
      errorState(el, err.message, function () { renderBilling(el); });
    }
  }

  // ============================================================
  // HELP MODULE
  // ============================================================
  var HELP_TOPICS = [
    ['Getting started', 'GRC Expert helps you manage governance, risk, and compliance across NCA, SAMA, CST, PDPL, ISO 27001, NIST and more. Start from the Dashboard for a live overview, then use the AI Assistant to draft policies, procedures, risk registers, and gap assessments. Administration (Users, Roles, Departments) lets you set up your team.'],
    ['Account and login', 'Sign in with your work email and password at the login page. Passwords require at least 8 characters with a letter, a number, and a special character. Use "Forgot password?" to receive a secure reset link. Your session stays active and refreshes automatically; use Logout in the sidebar to end it.'],
    ['Dashboard', 'The Dashboard shows live counts pulled directly from your organization\'s data: compliance score (from control implementations), open risks by severity, evidence status, policies due for review, tasks, notifications, and recent activity. Quick-nav buttons jump straight into the AI tools.'],
    ['Users and roles', 'Administration → Users lists everyone in your organization. Invite users by email, assign roles, set departments, and activate/deactivate accounts. Roles use permission-based RBAC — the platform prevents you from granting a role with permissions you do not hold, and blocks removing the last administrator.'],
    ['Risk register', 'Create and track risks using an ISO 31000 5×5 methodology. Each risk records likelihood, impact, an automatically computed inherent score, treatment plan, owner, target date, and residual score. Risks feed the Dashboard risk distribution chart.'],
    ['Evidence management', 'Evidence requests link a control to an owner with a due date. Owners submit files or notes; reviewers approve or reject. Rejections require a mandatory reason, enforced at the database level. All actions are logged.'],
    ['Policies and procedures', 'Generate policies and procedures with the AI tools, then save them as versioned documents with an owner, approver, effective date, and review date. Policies due for review appear on the Dashboard.'],
    ['Frameworks and controls', 'Built-in frameworks (NCA ECC, SAMA CSF, ISO 27001, and others) are available to every organization. Track per-control implementation status and maturity (0–5). Compliance percentage is derived from these implementation records.'],
    ['AI assistant', 'The AI Assistant answers GRC questions grounded in an indexed knowledge base and can generate policies, procedures, risk registers, gap assessments, and framework mappings. It cites only controls it can confirm and marks uncertain mappings for validation. Always verify AI output before relying on it.'],
    ['Uploads and exports', 'Upload PDF, Word, Excel, CSV, or text files for the AI to analyze. Generated content exports to Word, PDF, and (for tables) Excel. Policy and procedure outputs export to Word and PDF; tabular outputs like risk registers also export to Excel.'],
    ['Security and privacy', 'Every organization\'s data is isolated by Row Level Security in the database. Users can only read and write records in their own organization. Privileged actions are audited. Never share your password; administrators cannot see it.'],
  ];

  async function renderHelp(el) {
    var search = '';
    var buildNumber = (window.GRC_BUILD || 'dev');

    function draw() {
      var filtered = HELP_TOPICS.filter(function (t) { return !search || (t[0] + ' ' + t[1]).toLowerCase().indexOf(search.toLowerCase()) !== -1; });
      var topics = filtered.map(function (t) {
        return '<div class="kb-section"><h3>' + esc(t[0]) + '</h3><p style="font-size:13px;color:var(--text-muted);line-height:1.7">' + esc(t[1]) + '</p></div>';
      }).join('') || '<div class="empty" style="padding:24px">No help topics match "' + esc(search) + '".</div>';

      el.innerHTML = '<div class="kb-page">' + head('Help & Support', '<button class="adm-btn primary" id="hContact">Contact Support</button>') +
        '<div class="adm-toolbar"><input class="adm-input" id="hSearch" placeholder="Search help topics…" value="' + esc(search) + '" style="min-width:260px"></div>' +
        topics +
        '<div class="kb-section"><h3>About</h3><p style="font-size:12.5px;color:var(--text-muted);line-height:1.7">' +
        'GRC Expert · Build ' + esc(buildNumber) + '<br>Privacy policy and Terms of Service pages are not yet published in this build.</p></div>' +
        '</div>';

      el.querySelector('#hSearch').addEventListener('input', function (e) { search = e.target.value; draw(); var i = el.querySelector('#hSearch'); i.focus(); i.setSelectionRange(i.value.length, i.value.length); });
      el.querySelector('#hContact').addEventListener('click', contactModal);
    }

    function contactModal() {
      var m = modal('<h3>Contact Support</h3>' +
        '<div class="adm-field"><label>Subject</label><input id="csSubject" placeholder="Brief summary"></div>' +
        '<div class="adm-field"><label>Category</label><select id="csCat"><option value="general">General question</option><option value="bug">Bug report</option><option value="billing">Billing</option><option value="feature">Feature request</option><option value="security">Security concern</option></select></div>' +
        '<div class="adm-field"><label>Message</label><textarea id="csMsg" rows="5" placeholder="Describe your issue or question…"></textarea></div>' +
        '<div class="adm-modal-actions"><button class="adm-btn" data-x>Cancel</button><button class="adm-btn primary" data-ok>Submit</button></div>');
      m.el.querySelector('[data-x]').addEventListener('click', m.close);
      m.el.querySelector('[data-ok]').addEventListener('click', async function () {
        var subject = m.el.querySelector('#csSubject').value.trim();
        var msg = m.el.querySelector('#csMsg').value.trim();
        if (!subject || !msg) { toast('Subject and message are required', 'error'); return; }
        var btn = m.el.querySelector('[data-ok]'); btn.disabled = true; btn.textContent = 'Submitting…';
        var r = await db().from('support_tickets').insert({
          organization_id: A().organization.id, user_id: A().user.id,
          subject: subject, category: m.el.querySelector('#csCat').value, message: msg,
        });
        if (r.error) { toast(r.error.message, 'error'); btn.disabled = false; btn.textContent = 'Submit'; }
        else { toast('Support request submitted', 'success'); m.close(); }
      });
    }
    draw();
  }

  // ============================================================
  // ROUTER
  // ============================================================
  function render(pageId, el) {
    injectStyles();
    switch (pageId) {
      case 'pg_users': return renderUsers(el);
      case 'pg_roles': return renderRoles(el);
      case 'pg_departments': return renderDepartments(el);
      case 'pg_notifications': return renderNotifications(el);
      case 'pg_audit': return renderAudit(el);
      case 'pg_settings': return renderSettings(el);
      case 'pg_billing': return renderBilling(el);
      case 'pg_help': return renderHelp(el);
      default:
        var titles = { pg_frameworks: 'Frameworks', pg_controls: 'Controls', pg_policies: 'Policies', pg_procedures: 'Procedures', pg_risks: 'Risk Register', pg_gaps: 'Gap Assessments', pg_evidence: 'Evidence Requests', pg_evidence_review: 'Evidence Review', pg_tasks: 'Tasks', pg_reports: 'Reports' };
        var nm = titles[pageId] || 'Module';
        el.innerHTML = '<div class="kb-page">' + head(nm, '') +
          '<div class="kb-section"><p style="font-size:13px;color:var(--text-muted);line-height:1.7">The <b>' + esc(nm) + '</b> workspace is being built out. Its database tables, organization isolation, and permissions are already live — the management interface is coming in the next development phase.</p></div></div>';
    }
  }

  window.Admin = { render: render, updateBadge: updateBadge };
})(window);
