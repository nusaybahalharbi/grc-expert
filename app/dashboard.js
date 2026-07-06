/**
 * GRC Expert — Dashboard Module
 * Live data from Supabase. No mock data.
 * Renders into a container via window.Dashboard.render(el).
 */
(function (window) {
  'use strict';

  function esc(s) { return window.ui ? window.ui.escapeHtml(s) : String(s || ''); }

  async function count(table, filters) {
    var q = window.Auth.client.from(table).select('*', { count: 'exact', head: true });
    if (filters) filters(q);
    var r = await q;
    return r.count || 0;
  }

  async function render(container) {
    container.innerHTML = '<div class="kb-page"><div class="empty">Loading dashboard…</div></div>';
    await window.Auth.ready;
    var A = window.Auth;
    var c = A.client;
    var orgId = A.organization.id;

    try {
      // Parallel live queries
      var results = await Promise.all([
        count('frameworks', function (q) { q.or('organization_id.is.null,organization_id.eq.' + orgId); }),  // 0 frameworks
        count('controls'),                                                                                     // 1 controls (RLS scopes)
        count('evidence_requests'),                                                                            // 2 evidence total
        count('evidence_requests', function (q) { q.in('status', ['pending', 'submitted', 'under_review', 'overdue', 'need_more_info']); }), // 3 open evidence
        count('risks', function (q) { q.neq('status', 'closed'); }),                                           // 4 open risks
        count('policies'),                                                                                     // 5 policies
        count('procedures'),                                                                                   // 6 procedures
        count('ai_usage'),                                                                                     // 7 AI requests
        c.from('control_implementations').select('status'),                                                    // 8 compliance calc
        c.from('risks').select('inherent_score,status').neq('status', 'closed'),                               // 9 risk distribution
        c.from('evidence_requests').select('status'),                                                          // 10 evidence by status
        c.from('activity_logs').select('action,module,created_at,user_id').order('created_at', { ascending: false }).limit(8), // 11 recent activity
        c.from('notifications').select('title,type,created_at,is_read').eq('user_id', A.user.id).order('created_at', { ascending: false }).limit(6), // 12
        c.from('tasks').select('title,priority,status,due_date').eq('assignee_id', A.user.id).neq('status', 'done').order('due_date', { ascending: true }).limit(6), // 13
        c.from('policies').select('title,review_date').not('review_date', 'is', null).gte('review_date', new Date().toISOString().slice(0, 10)).order('review_date').limit(5), // 14 upcoming reviews
      ]);

      var impl = results[8].data || [];
      var implemented = impl.filter(function (i) { return i.status === 'implemented'; }).length;
      var partial = impl.filter(function (i) { return i.status === 'partially_implemented'; }).length;
      var applicable = impl.filter(function (i) { return i.status !== 'not_applicable'; }).length;
      var compliance = applicable > 0 ? Math.round(((implemented + partial * 0.5) / applicable) * 100) : 0;

      var risks = results[9].data || [];
      var riskBuckets = { low: 0, medium: 0, high: 0, critical: 0 };
      risks.forEach(function (r) {
        var s = r.inherent_score || 0;
        if (s >= 16) riskBuckets.critical++;
        else if (s >= 10) riskBuckets.high++;
        else if (s >= 5) riskBuckets.medium++;
        else riskBuckets.low++;
      });

      var ev = results[10].data || [];
      var evBuckets = {};
      ev.forEach(function (e) { evBuckets[e.status] = (evBuckets[e.status] || 0) + 1; });

      var stats = [
        { label: 'Compliance Score', value: applicable > 0 ? compliance + '%' : '—', sub: applicable > 0 ? implemented + ' of ' + applicable + ' controls' : 'No assessments yet', accent: true },
        { label: 'Frameworks', value: results[0], sub: 'Available' },
        { label: 'Controls', value: results[1], sub: 'In scope' },
        { label: 'Open Risks', value: results[4], sub: riskBuckets.critical + ' critical' },
        { label: 'Evidence Requests', value: results[3], sub: 'Open of ' + results[2] + ' total' },
        { label: 'Policies', value: results[5], sub: 'Documents' },
        { label: 'Procedures', value: results[6], sub: 'Documents' },
        { label: 'AI Requests', value: results[7], sub: 'All time' },
      ];

      var statsHtml = stats.map(function (s) {
        return '<div class="kb-stat">' +
          '<div class="kb-stat-label">' + esc(s.label) + '</div>' +
          '<div class="kb-stat-value"' + (s.accent ? ' style="color:var(--primary)"' : '') + '>' + esc(String(s.value)) + '</div>' +
          '<div class="kb-stat-sub">' + esc(s.sub) + '</div></div>';
      }).join('');

      // Risk distribution bars
      var maxRisk = Math.max(riskBuckets.low, riskBuckets.medium, riskBuckets.high, riskBuckets.critical, 1);
      function bar(label, val, color) {
        var pct = Math.round((val / maxRisk) * 100);
        return '<div style="margin-bottom:10px">' +
          '<div style="display:flex;justify-content:space-between;font-size:11.5px;color:var(--text-muted);margin-bottom:4px"><span>' + label + '</span><span>' + val + '</span></div>' +
          '<div style="height:8px;background:var(--bg-hover);border-radius:4px;overflow:hidden"><div style="width:' + pct + '%;height:100%;background:' + color + ';border-radius:4px"></div></div></div>';
      }
      var riskChart = bar('Critical (16-25)', riskBuckets.critical, '#EF4444') + bar('High (10-15)', riskBuckets.high, '#F59E0B') + bar('Medium (5-9)', riskBuckets.medium, '#38BDF8') + bar('Low (1-4)', riskBuckets.low, '#10B981');

      // Evidence status bars
      var evLabels = { pending: '#F59E0B', submitted: '#38BDF8', under_review: '#8B5CF6', approved: '#10B981', rejected: '#EF4444', overdue: '#DC2626', need_more_info: '#F97316' };
      var maxEv = Math.max.apply(null, Object.keys(evBuckets).map(function (k) { return evBuckets[k]; }).concat([1]));
      var evChart = Object.keys(evLabels).filter(function (k) { return evBuckets[k]; }).map(function (k) {
        return bar(k.replace(/_/g, ' '), evBuckets[k], evLabels[k]);
      }).join('') || '<div class="empty" style="padding:12px">No evidence requests yet</div>';

      // Compliance ring
      var ring = '<div style="display:flex;align-items:center;gap:20px;padding:8px 0">' +
        '<div style="position:relative;width:110px;height:110px;flex-shrink:0">' +
        '<svg viewBox="0 0 36 36" style="width:110px;height:110px;transform:rotate(-90deg)">' +
        '<circle cx="18" cy="18" r="15.9" fill="none" stroke="var(--bg-hover)" stroke-width="3.2"/>' +
        '<circle cx="18" cy="18" r="15.9" fill="none" stroke="var(--primary)" stroke-width="3.2" stroke-linecap="round" stroke-dasharray="' + compliance + ' 100"/>' +
        '</svg>' +
        '<div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-size:22px;font-weight:800;color:var(--text-bright)">' + (applicable > 0 ? compliance + '%' : '—') + '</div></div>' +
        '<div style="font-size:12.5px;color:var(--text-muted);line-height:1.7">' +
        '<div><strong style="color:#10B981">' + implemented + '</strong> implemented</div>' +
        '<div><strong style="color:#F59E0B">' + partial + '</strong> partially implemented</div>' +
        '<div><strong style="color:var(--text-dim)">' + Math.max(applicable - implemented - partial, 0) + '</strong> not implemented</div></div></div>';

      // Recent activity
      var act = (results[11].data || []).map(function (a) {
        return '<div class="doc-row" style="padding:9px 12px"><div class="doc-info"><div class="doc-name" style="font-size:12.5px">' + esc(a.action.replace(/_/g, ' ')) + (a.module ? ' · ' + esc(a.module) : '') + '</div><div class="doc-meta">' + new Date(a.created_at).toLocaleString() + '</div></div></div>';
      }).join('') || '<div class="empty" style="padding:12px">No activity yet</div>';

      var notifs = (results[12].data || []).map(function (n) {
        return '<div class="doc-row" style="padding:9px 12px' + (n.is_read ? ';opacity:.6' : '') + '"><div class="doc-info"><div class="doc-name" style="font-size:12.5px">' + esc(n.title) + '</div><div class="doc-meta">' + new Date(n.created_at).toLocaleString() + '</div></div></div>';
      }).join('') || '<div class="empty" style="padding:12px">No notifications</div>';

      var tasks = (results[13].data || []).map(function (t) {
        return '<div class="doc-row" style="padding:9px 12px"><div class="doc-info"><div class="doc-name" style="font-size:12.5px">' + esc(t.title) + '</div><div class="doc-meta">' + esc(t.priority) + (t.due_date ? ' · due ' + t.due_date : '') + '</div></div></div>';
      }).join('') || '<div class="empty" style="padding:12px">No open tasks</div>';

      var reviews = (results[14].data || []).map(function (p) {
        return '<div class="doc-row" style="padding:9px 12px"><div class="doc-info"><div class="doc-name" style="font-size:12.5px">' + esc(p.title) + '</div><div class="doc-meta">Review due ' + p.review_date + '</div></div></div>';
      }).join('') || '<div class="empty" style="padding:12px">No upcoming reviews</div>';

      container.innerHTML =
        '<div class="kb-page">' +
        '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:18px;flex-wrap:wrap;gap:10px">' +
        '<div><div style="font-size:18px;font-weight:700;color:var(--text-bright)">' + esc(A.organization.name) + '</div>' +
        '<div style="font-size:12px;color:var(--text-muted)">Welcome back, ' + esc(A.user.full_name) + ' · ' + esc(A.user.email) + '</div>' +
        '<div style="font-size:11px;color:var(--primary);font-weight:600;margin-top:2px">' + esc(A.roles.join(', ') || 'No role assigned') + '</div></div>' +
        '<div style="display:flex;gap:8px;flex-wrap:wrap">' +
        '<button class="btn-primary" data-goto="chat" style="width:auto;padding:9px 16px">Open AI Assistant</button>' +
        '<button class="btn-primary" data-goto="policy" style="width:auto;padding:9px 16px;background:transparent">Policy Generator</button>' +
        '<button class="btn-primary" data-goto="risk" style="width:auto;padding:9px 16px;background:transparent">Risk Register</button>' +
        '</div>' +
        '</div>' +
        '<div class="kb-stats" style="grid-template-columns:repeat(auto-fit,minmax(150px,1fr))">' + statsHtml + '</div>' +
        '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:14px;margin-bottom:20px">' +
        '<div class="kb-stat"><div class="kb-stat-label">Compliance</div>' + ring + '</div>' +
        '<div class="kb-stat"><div class="kb-stat-label">Risk Distribution</div><div style="padding-top:8px">' + riskChart + '</div></div>' +
        '<div class="kb-stat"><div class="kb-stat-label">Evidence Status</div><div style="padding-top:8px">' + evChart + '</div></div>' +
        '</div>' +
        '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:14px">' +
        '<div class="kb-section"><h3>Recent Activity</h3>' + act + '</div>' +
        '<div class="kb-section"><h3>Notifications</h3>' + notifs + '</div>' +
        '<div class="kb-section"><h3>My Tasks</h3>' + tasks + '</div>' +
        '<div class="kb-section"><h3>Upcoming Policy Reviews</h3>' + reviews + '</div>' +
        '</div></div>';

      // Quick-nav buttons: delegate to the sidebar nav items so app.js
      // routing (mode, generator, placeholder, RBAC) stays the single source of truth
      container.querySelectorAll('[data-goto]').forEach(function (btn) {
        btn.addEventListener('click', function () {
          var target = document.querySelector('.nav-item[data-page="' + btn.dataset.goto + '"]');
          if (target) target.click();
          else if (window.ui) window.ui.toast('You do not have access to this module', 'error');
        });
      });

    } catch (err) {
      console.error('[dashboard]', err);
      container.innerHTML = '<div class="kb-page"><div class="err-bar">Dashboard failed to load: ' + esc(err.message) + '</div></div>';
    }
  }

  window.Dashboard = { render: render };
})(window);
