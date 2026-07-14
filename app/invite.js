/**
 * GRC Expert — Secure User Invitation Endpoint
 * POST /api/invite   →  place at  api/invite.js
 *
 * Architecture (browser NEVER holds service_role):
 *   Frontend → this route → validate JWT → verify caller is an Administrator
 *   → use SERVICE_ROLE (server-only) → create auth user → create public.users
 *   → assign org + department + role(s) → invite email → audit log → success.
 *
 * Env vars (Vercel → Settings → Environment Variables):
 *   SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY   (server-only)
 *   APP_ORIGIN                  (e.g. https://grc-expert.vercel.app)
 *
 * MULTI-TENANCY POLICY: one organization per user (Option B).
 *   An email already registered in ANY organization is rejected.
 */

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const APP_ORIGIN = process.env.APP_ORIGIN || '';

const rl = new Map();
function rateLimited(key, max, windowMs) {
  const now = Date.now();
  const rec = rl.get(key) || { n: 0, reset: now + windowMs };
  if (now > rec.reset) { rec.n = 0; rec.reset = now + windowMs; }
  rec.n++; rl.set(key, rec);
  return rec.n > max;
}

async function sb(path, opts) {
  const res = await fetch(SUPABASE_URL + path, {
    ...opts,
    headers: {
      apikey: SERVICE_KEY,
      Authorization: 'Bearer ' + SERVICE_KEY,
      'Content-Type': 'application/json',
      ...(opts && opts.headers ? opts.headers : {}),
    },
  });
  const text = await res.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch (e) { json = null; }
  return { ok: res.ok, status: res.status, json };
}

async function deleteAuthUser(id) {
  try { await sb('/auth/v1/admin/users/' + id, { method: 'DELETE' }); } catch (e) { }
}

module.exports = async function handler(req, res) {
  const origin = req.headers.origin || '';
  if (APP_ORIGIN && origin === APP_ORIGIN) res.setHeader('Access-Control-Allow-Origin', APP_ORIGIN);
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  if (!SUPABASE_URL || !SERVICE_KEY) {
    return res.status(500).json({ error: 'We couldn\'t create the user. Please try again later.' });
  }

  try {
    // 1. Validate JWT
    const authHeader = req.headers.authorization || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
    if (!token) return res.status(401).json({ error: 'Your session has expired. Please sign in again.' });

    const userRes = await fetch(SUPABASE_URL + '/auth/v1/user', {
      headers: { apikey: SERVICE_KEY, Authorization: 'Bearer ' + token },
    });
    if (!userRes.ok) return res.status(401).json({ error: 'Your session has expired. Please sign in again.' });
    const caller = await userRes.json();
    const callerId = caller.id;
    if (!callerId) return res.status(401).json({ error: 'Your session has expired. Please sign in again.' });

    // 2. Rate limit
    if (rateLimited('invite:' + callerId, 15, 60 * 1000)) {
      return res.status(429).json({ error: 'Too many attempts. Please wait a minute and try again.' });
    }

    // 3. Resolve caller profile (org + active)
    const profRes = await sb('/rest/v1/users?id=eq.' + callerId + '&select=organization_id,status', { method: 'GET' });
    if (!profRes.ok || !profRes.json || !profRes.json[0]) {
      return res.status(403).json({ error: 'You do not have permission to add users.' });
    }
    const orgId = profRes.json[0].organization_id;
    if (profRes.json[0].status !== 'active') {
      return res.status(403).json({ error: 'You do not have permission to add users.' });
    }

    // 4. Verify caller has users.manage; collect caller perms for escalation guard
    const roleRes = await sb('/rest/v1/user_roles?user_id=eq.' + callerId +
      '&select=roles(name,role_permissions(permissions(code)))', { method: 'GET' });
    let isAdmin = false;
    const callerPermCodes = {};
    if (roleRes.ok && Array.isArray(roleRes.json)) {
      isAdmin = JSON.stringify(roleRes.json).indexOf('users.manage') !== -1;
      roleRes.json.forEach(function (ur) {
        const r = ur.roles;
        if (r && Array.isArray(r.role_permissions)) {
          r.role_permissions.forEach(function (rp) {
            if (rp.permissions && rp.permissions.code) callerPermCodes[rp.permissions.code] = true;
          });
        }
      });
    }
    if (!isAdmin) return res.status(403).json({ error: 'You do not have permission to add users.' });

    // 5. Validate + normalize input
    const body = req.body && typeof req.body === 'object' ? req.body : JSON.parse(req.body || '{}');
    const email = String(body.email || '').trim().toLowerCase();
    const fullName = String(body.full_name || '').trim().slice(0, 120);
    const jobTitle = body.job_title ? String(body.job_title).trim().slice(0, 120) : null;
    const phone = body.phone ? String(body.phone).trim().slice(0, 40) : null;
    const departmentId = body.department_id ? String(body.department_id) : null;
    const roleIds = Array.isArray(body.role_ids) ? body.role_ids.map(String).slice(0, 20) : [];
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return res.status(400).json({ error: 'Please enter a valid email address.' });
    if (!fullName) return res.status(400).json({ error: 'Full name is required.' });

    // 6. Validate department belongs to caller's org
    if (departmentId) {
      const dRes = await sb('/rest/v1/departments?id=eq.' + departmentId + '&organization_id=eq.' + orgId + '&select=id', { method: 'GET' });
      if (!dRes.ok || !dRes.json || !dRes.json[0]) return res.status(400).json({ error: 'The selected department is invalid.' });
    }

    // 7. Validate roles belong to org AND caller isn't escalating privileges
    const validRoleIds = [];
    if (roleIds.length) {
      const orFilter = roleIds.map(function (id) { return 'id.eq.' + id; }).join(',');
      const rRes = await sb('/rest/v1/roles?or=(' + encodeURIComponent(orFilter) + ')&organization_id=eq.' + orgId +
        '&select=id,name,role_permissions(permissions(code))', { method: 'GET' });
      if (!rRes.ok || !Array.isArray(rRes.json)) return res.status(400).json({ error: 'The selected role is invalid.' });
      for (const r of rRes.json) {
        const perms = (r.role_permissions || []).map(function (rp) { return rp.permissions ? rp.permissions.code : null; }).filter(Boolean);
        const missing = perms.filter(function (c) { return !callerPermCodes[c]; });
        if (missing.length > 0) {
          return res.status(403).json({ error: 'You cannot assign a role with more permissions than your own.' });
        }
        validRoleIds.push(r.id);
      }
    }

    // 8. One-per-org duplicate detection (Option B)
    const existing = await sb('/auth/v1/admin/users?filter=' + encodeURIComponent('email.eq.' + email), { method: 'GET' });
    let existingId = null;
    if (existing.ok && existing.json) {
      const list = Array.isArray(existing.json.users) ? existing.json.users : (Array.isArray(existing.json) ? existing.json : []);
      const match = list.find(function (u) { return (u.email || '').toLowerCase() === email; });
      if (match) existingId = match.id;
    }
    if (existingId) {
      const eProf = await sb('/rest/v1/users?id=eq.' + existingId + '&select=organization_id', { method: 'GET' });
      if (eProf.ok && eProf.json && eProf.json[0]) {
        if (eProf.json[0].organization_id === orgId) {
          return res.status(409).json({ error: 'This user already belongs to your organization.' });
        }
        return res.status(409).json({ error: 'This email is already registered in another organization.' });
      }
      return res.status(409).json({ error: 'This email is already registered.' });
    }

    // 9. Create the auth user via invite (sends invitation email)
    const invite = await sb('/auth/v1/invite', {
      method: 'POST',
      body: JSON.stringify({ email: email, data: { full_name: fullName } }),
    });
    if (!invite.ok) {
      const msg = invite.json && invite.json.msg ? invite.json.msg : '';
      if (/already|registered|exists/i.test(msg)) return res.status(409).json({ error: 'This email is already registered.' });
      return res.status(500).json({ error: 'We couldn\'t create the user. Please try again later.' });
    }
    const newUserId = (invite.json && invite.json.id) ? invite.json.id : (invite.json && invite.json.user ? invite.json.user.id : null);
    if (!newUserId) return res.status(500).json({ error: 'We couldn\'t create the user. Please try again later.' });

    // 10. Create public.users profile
    const prof = await sb('/rest/v1/users', {
      method: 'POST', headers: { Prefer: 'return=minimal' },
      body: JSON.stringify({
        id: newUserId, organization_id: orgId, email: email, full_name: fullName,
        job_title: jobTitle, phone: phone, department_id: departmentId, status: 'invited',
      }),
    });
    if (!prof.ok) {
      await deleteAuthUser(newUserId);
      return res.status(500).json({ error: 'We couldn\'t create the user. Please try again later.' });
    }

    // 11. Assign roles
    if (validRoleIds.length) {
      const rows = validRoleIds.map(function (rid) { return { user_id: newUserId, role_id: rid, assigned_by: callerId }; });
      await sb('/rest/v1/user_roles', { method: 'POST', headers: { Prefer: 'return=minimal' }, body: JSON.stringify(rows) });
    }

    // 12. Audit
    await sb('/rest/v1/audit_logs', {
      method: 'POST', headers: { Prefer: 'return=minimal' },
      body: JSON.stringify({
        organization_id: orgId, user_id: callerId, event: 'user_invited',
        entity_type: 'user', entity_id: newUserId,
        after_state: { email: email, full_name: fullName, department_id: departmentId, role_ids: validRoleIds },
      }),
    });

    return res.status(200).json({ ok: true, user_id: newUserId });
  } catch (err) {
    return res.status(500).json({ error: 'We couldn\'t create the user. Please try again later.' });
  }
};
