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
  const method = (opts && opts.method) || 'GET';
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
  // DEBUG: log every request and its raw response body (this is where Postgres
  // returns { code, message, details, hint } on error).
  console.log('[sb] ' + method + ' ' + path + ' -> HTTP ' + res.status);
  if (!res.ok) {
    console.log('[sb] RAW ERROR BODY:', text);
  }
  // rawText/rawError preserved so callers can return the exact Postgres error.
  return { ok: res.ok, status: res.status, json, rawText: text, rawError: (!res.ok ? (json || text) : null) };
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
    // Distinct, actionable message: this ONLY fires when Vercel env vars are missing.
    // (Not a secret — it just tells the admin the server needs configuring.)
    return res.status(503).json({ error: 'The invitation service is not configured yet. An administrator must set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in the deployment environment.' });
  }

  try {
    // 1. Validate JWT
    const authHeader = req.headers.authorization || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
    if (!token) return res.status(401).json({ error: 'Your session has expired. Please sign in again.' });

    const userRes = await fetch(SUPABASE_URL + '/auth/v1/user', {
      headers: { apikey: SERVICE_KEY, Authorization: 'Bearer ' + token },
    });
    if (!userRes.ok) {
      const uErr = await userRes.text();
      console.log('STEP 1 token validation FAILED', userRes.status, uErr);
      return res.status(500).json({ step: 'jwt validation', http: userRes.status, details: uErr });
    }
    const caller = await userRes.json();
    const callerId = caller.id;
    console.log('STEP 1 token validated. callerId =', callerId);
    if (!callerId) return res.status(401).json({ error: 'Your session has expired. Please sign in again.' });

    // 2. Rate limit
    if (rateLimited('invite:' + callerId, 15, 60 * 1000)) {
      return res.status(429).json({ error: 'Too many attempts. Please wait a minute and try again.' });
    }
    console.log('STEP 2 rate limit ok');

    // 3. Resolve caller profile (org + active)
    const profRes = await sb('/rest/v1/users?id=eq.' + callerId + '&select=organization_id,status', { method: 'GET' });
    console.log('STEP 3 caller profile query. error =', profRes.rawError, '| data =', profRes.json);
    if (!profRes.ok) {
      return res.status(500).json({ step: 'caller profile query', http: profRes.status, details: profRes.rawError, data: profRes.json });
    }
    if (!profRes.json || !profRes.json[0]) {
      return res.status(500).json({ step: 'caller profile query', note: 'no profile row returned for callerId', callerId: callerId, data: profRes.json });
    }
    const orgId = profRes.json[0].organization_id;
    console.log('STEP 4 organization =', orgId, '| status =', profRes.json[0].status);
    if (profRes.json[0].status !== 'active') {
      return res.status(403).json({ step: 'caller status', note: 'caller is not active', status: profRes.json[0].status });
    }

    // 4. Verify caller has users.manage; collect caller perms for escalation guard
    const roleRes = await sb('/rest/v1/user_roles?user_id=eq.' + callerId +
      '&select=roles(name,role_permissions(permissions(code)))', { method: 'GET' });
    console.log('STEP 5 permissions query. error =', roleRes.rawError, '| data =', JSON.stringify(roleRes.json));
    if (!roleRes.ok) {
      return res.status(500).json({ step: 'permissions query', http: roleRes.status, details: roleRes.rawError, data: roleRes.json });
    }
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
    console.log('STEP 5 isAdmin =', isAdmin, '| callerPermCodes =', Object.keys(callerPermCodes));
    if (!isAdmin) {
      return res.status(403).json({ step: 'permission check', note: 'caller lacks users.manage', permissions: Object.keys(callerPermCodes), rawRoles: roleRes.json });
    }

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
    console.log('STEP 6 input validated. email =', email, '| departmentId =', departmentId, '| roleIds =', roleIds);

    // 6. Validate department belongs to caller's org
    if (departmentId) {
      const dRes = await sb('/rest/v1/departments?id=eq.' + departmentId + '&organization_id=eq.' + orgId + '&select=id', { method: 'GET' });
      console.log('STEP 6b department query. error =', dRes.rawError, '| data =', dRes.json);
      if (!dRes.ok) {
        return res.status(500).json({ step: 'department query', http: dRes.status, details: dRes.rawError, data: dRes.json });
      }
      if (!dRes.json || !dRes.json[0]) return res.status(400).json({ error: 'The selected department is invalid.' });
    }

    // 7. Validate roles belong to org AND caller isn't escalating privileges
    const validRoleIds = [];
    if (roleIds.length) {
      const orFilter = roleIds.map(function (id) { return 'id.eq.' + id; }).join(',');
      const rRes = await sb('/rest/v1/roles?or=(' + encodeURIComponent(orFilter) + ')&organization_id=eq.' + orgId +
        '&select=id,name,role_permissions(permissions(code))', { method: 'GET' });
      console.log('STEP 7 role validation query. error =', rRes.rawError, '| data =', JSON.stringify(rRes.json));
      if (!rRes.ok) {
        return res.status(500).json({ step: 'role validation query', http: rRes.status, details: rRes.rawError, data: rRes.json });
      }
      if (!Array.isArray(rRes.json)) return res.status(400).json({ error: 'The selected role is invalid.' });
      for (const r of rRes.json) {
        const perms = (r.role_permissions || []).map(function (rp) { return rp.permissions ? rp.permissions.code : null; }).filter(Boolean);
        const missing = perms.filter(function (c) { return !callerPermCodes[c]; });
        if (missing.length > 0) {
          return res.status(403).json({ error: 'You cannot assign a role with more permissions than your own.' });
        }
        validRoleIds.push(r.id);
      }
    }
    console.log('STEP 7 validRoleIds =', validRoleIds);

    // 8. One-per-org duplicate detection (Option B)
    const existing = await sb('/auth/v1/admin/users?filter=' + encodeURIComponent('email.eq.' + email), { method: 'GET' });
    console.log('STEP 8 duplicate check. http =', existing.status, '| error =', existing.rawError);
    let existingId = null;
    if (existing.ok && existing.json) {
      const list = Array.isArray(existing.json.users) ? existing.json.users : (Array.isArray(existing.json) ? existing.json : []);
      const match = list.find(function (u) { return (u.email || '').toLowerCase() === email; });
      if (match) existingId = match.id;
    }
    console.log('STEP 8 existingId =', existingId);
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
    console.log('STEP 9 creating auth user via /auth/v1/invite');
    const invite = await sb('/auth/v1/invite', {
      method: 'POST',
      body: JSON.stringify({ email: email, data: { full_name: fullName } }),
    });
    console.log('STEP 9 invite result. http =', invite.status, '| error =', invite.rawError, '| json =', JSON.stringify(invite.json));
    if (!invite.ok) {
      const msg = invite.json && invite.json.msg ? invite.json.msg : '';
      if (/already|registered|exists/i.test(msg)) return res.status(409).json({ error: 'This email is already registered.' });
      return res.status(500).json({ step: 'create auth user (invite)', http: invite.status, details: invite.rawError, data: invite.json });
    }
    const newUserId = (invite.json && invite.json.id) ? invite.json.id : (invite.json && invite.json.user ? invite.json.user.id : null);
    console.log('STEP 9 newUserId =', newUserId);
    if (!newUserId) return res.status(500).json({ step: 'create auth user (invite)', note: 'no user id in invite response', data: invite.json });

    // 10. Create public.users profile
    console.log('STEP 10 inserting public.users');
    const prof = await sb('/rest/v1/users', {
      method: 'POST', headers: { Prefer: 'return=minimal' },
      body: JSON.stringify({
        id: newUserId, organization_id: orgId, email: email, full_name: fullName,
        job_title: jobTitle, phone: phone, department_id: departmentId, status: 'invited',
      }),
    });
    console.log('STEP 10 profile insert. http =', prof.status, '| error =', prof.rawError);
    if (!prof.ok) {
      await deleteAuthUser(newUserId);
      return res.status(500).json({ step: 'insert public.users', http: prof.status, details: prof.rawError, data: prof.json });
    }

    // 11. Assign roles
    if (validRoleIds.length) {
      const rows = validRoleIds.map(function (rid) { return { user_id: newUserId, role_id: rid, assigned_by: callerId }; });
      const rAssign = await sb('/rest/v1/user_roles', { method: 'POST', headers: { Prefer: 'return=minimal' }, body: JSON.stringify(rows) });
      console.log('STEP 11 assigning roles. http =', rAssign.status, '| error =', rAssign.rawError);
      if (!rAssign.ok) {
        // Profile exists; surface the exact role-assignment failure instead of hiding it
        return res.status(500).json({ step: 'assign roles (user_roles insert)', http: rAssign.status, details: rAssign.rawError, data: rAssign.json, user_id: newUserId });
      }
    } else {
      console.log('STEP 11 no roles to assign');
    }

    // 12. Audit
    const aAudit = await sb('/rest/v1/audit_logs', {
      method: 'POST', headers: { Prefer: 'return=minimal' },
      body: JSON.stringify({
        organization_id: orgId, user_id: callerId, event: 'user_invited',
        entity_type: 'user', entity_id: newUserId,
        after_state: { email: email, full_name: fullName, department_id: departmentId, role_ids: validRoleIds },
      }),
    });
    console.log('STEP 12 audit log. http =', aAudit.status, '| error =', aAudit.rawError);
    // audit failure should not fail the whole invite, but we log it loudly
    if (!aAudit.ok) console.log('STEP 12 AUDIT INSERT FAILED (non-fatal):', aAudit.rawError);

    console.log('STEP 13 success. user_id =', newUserId);
    return res.status(200).json({ ok: true, user_id: newUserId });
  } catch (err) {
    // Expose the raw exception during debugging instead of a generic message
    console.log('UNCAUGHT EXCEPTION', err && err.message, err && err.stack);
    return res.status(500).json({ step: 'uncaught exception', error: String(err && err.message), stack: String(err && err.stack) });
  }
};
