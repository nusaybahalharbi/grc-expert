/**
 * GRC Expert — Secure User Invitation Endpoint
 * POST /api/invite
 */
const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const APP_ORIGIN = (process.env.APP_ORIGIN || '').replace(/\/$/, '');

const rl = new Map();
function rateLimited(key, max, windowMs) {
  const now = Date.now();
  const rec = rl.get(key) || { n: 0, reset: now + windowMs };
  if (now > rec.reset) { rec.n = 0; rec.reset = now + windowMs; }
  rec.n += 1;
  rl.set(key, rec);
  return rec.n > max;
}

function safeDetail(value) {
  if (!value) return '';
  const raw = typeof value === 'string' ? value : JSON.stringify(value);
  return raw.replace(/Bearer\s+[A-Za-z0-9._-]+/gi, 'Bearer [redacted]').slice(0, 500);
}

async function sb(path, opts = {}) {
  const res = await fetch(SUPABASE_URL + path, {
    ...opts,
    headers: {
      apikey: SERVICE_KEY,
      Authorization: 'Bearer ' + SERVICE_KEY,
      'Content-Type': 'application/json',
      ...(opts.headers || {}),
    },
  });
  const text = await res.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch (_) { json = text || null; }
  return { ok: res.ok, status: res.status, json };
}

async function failStep(res, step, upstream, publicMessage, status = 500) {
  console.error('[invite]', step, upstream ? upstream.status : '', safeDetail(upstream && upstream.json));
  return res.status(status).json({
    error: publicMessage || 'We could not send the invitation. Please try again later.',
    code: step,
  });
}

async function deleteAuthUser(id) {
  if (!id) return;
  try { await sb('/auth/v1/admin/users/' + encodeURIComponent(id), { method: 'DELETE' }); } catch (_) {}
}

async function getPermissionCodes(userId) {
  const ur = await sb('/rest/v1/user_roles?user_id=eq.' + encodeURIComponent(userId) + '&select=role_id', { method: 'GET' });
  if (!ur.ok) return { ok: false, upstream: ur, codes: new Set(), roleIds: [] };
  const roleIds = (Array.isArray(ur.json) ? ur.json : []).map(x => x.role_id).filter(Boolean);
  if (!roleIds.length) return { ok: true, codes: new Set(), roleIds: [] };

  const roleFilter = 'in.(' + roleIds.join(',') + ')';
  const rp = await sb('/rest/v1/role_permissions?role_id=' + encodeURIComponent(roleFilter) + '&select=permission_id', { method: 'GET' });
  if (!rp.ok) return { ok: false, upstream: rp, codes: new Set(), roleIds };
  const permissionIds = [...new Set((Array.isArray(rp.json) ? rp.json : []).map(x => x.permission_id).filter(Boolean))];
  if (!permissionIds.length) return { ok: true, codes: new Set(), roleIds };

  const permissionFilter = 'in.(' + permissionIds.join(',') + ')';
  const p = await sb('/rest/v1/permissions?id=' + encodeURIComponent(permissionFilter) + '&select=code', { method: 'GET' });
  if (!p.ok) return { ok: false, upstream: p, codes: new Set(), roleIds };
  return { ok: true, codes: new Set((Array.isArray(p.json) ? p.json : []).map(x => x.code).filter(Boolean)), roleIds };
}

async function findAuthUserByEmail(email) {
  for (let page = 1; page <= 10; page += 1) {
    const result = await sb('/auth/v1/admin/users?page=' + page + '&per_page=100', { method: 'GET' });
    if (!result.ok) return { ok: false, upstream: result, user: null };
    const users = result.json && Array.isArray(result.json.users) ? result.json.users : [];
    const user = users.find(u => String(u.email || '').toLowerCase() === email);
    if (user) return { ok: true, user };
    if (users.length < 100) break;
  }
  return { ok: true, user: null };
}

module.exports = async function handler(req, res) {
  const origin = req.headers.origin || '';
  if (APP_ORIGIN && origin === APP_ORIGIN) res.setHeader('Access-Control-Allow-Origin', APP_ORIGIN);
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
  res.setHeader('Cache-Control', 'no-store');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed', code: 'METHOD_NOT_ALLOWED' });

  if (!SUPABASE_URL || !SERVICE_KEY) {
    return res.status(503).json({
      error: 'The invitation service is temporarily unavailable. Please contact your administrator.',
      code: 'SERVER_ENV_MISSING',
    });
  }

  try {
    const authHeader = req.headers.authorization || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
    if (!token) return res.status(401).json({ error: 'Your session has expired. Please sign in again.', code: 'TOKEN_MISSING' });

    const userRes = await fetch(SUPABASE_URL + '/auth/v1/user', {
      headers: { apikey: SERVICE_KEY, Authorization: 'Bearer ' + token },
    });
    if (!userRes.ok) return res.status(401).json({ error: 'Your session has expired. Please sign in again.', code: 'TOKEN_INVALID' });
    const caller = await userRes.json();
    const callerId = caller && caller.id;
    if (!callerId) return res.status(401).json({ error: 'Your session has expired. Please sign in again.', code: 'CALLER_MISSING' });

    if (rateLimited('invite:' + callerId, 10, 60 * 1000)) {
      return res.status(429).json({ error: 'Too many invitation attempts. Please wait one minute and try again.', code: 'RATE_LIMITED' });
    }

    const profile = await sb('/rest/v1/users?id=eq.' + encodeURIComponent(callerId) + '&select=organization_id,status', { method: 'GET' });
    if (!profile.ok) return failStep(res, 'CALLER_PROFILE_QUERY_FAILED', profile, 'We could not verify your administrator account.', 403);
    const callerProfile = Array.isArray(profile.json) ? profile.json[0] : null;
    if (!callerProfile || !callerProfile.organization_id || callerProfile.status !== 'active') {
      return res.status(403).json({ error: 'You do not have permission to add users.', code: 'CALLER_NOT_ACTIVE' });
    }
    const orgId = callerProfile.organization_id;

    const callerPermissions = await getPermissionCodes(callerId);
    if (!callerPermissions.ok) return failStep(res, 'CALLER_PERMISSION_QUERY_FAILED', callerPermissions.upstream, 'We could not verify your permissions.', 403);
    if (!callerPermissions.codes.has('users.manage')) {
      return res.status(403).json({ error: 'You do not have permission to add users.', code: 'USERS_MANAGE_REQUIRED' });
    }

    const body = req.body && typeof req.body === 'object' ? req.body : JSON.parse(req.body || '{}');
    const email = String(body.email || '').trim().toLowerCase();
    const fullName = String(body.full_name || '').trim().slice(0, 120);
    const jobTitle = body.job_title ? String(body.job_title).trim().slice(0, 120) : null;
    const phone = body.phone ? String(body.phone).trim().slice(0, 40) : null;
    const departmentId = body.department_id ? String(body.department_id) : null;
    const requestedRoleIds = Array.isArray(body.role_ids) ? [...new Set(body.role_ids.map(String))].slice(0, 20) : [];

    if (!fullName) return res.status(400).json({ error: 'Full name is required.', code: 'FULL_NAME_REQUIRED' });
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return res.status(400).json({ error: 'Please enter a valid email address.', code: 'EMAIL_INVALID' });

    if (departmentId) {
      const dept = await sb('/rest/v1/departments?id=eq.' + encodeURIComponent(departmentId) + '&organization_id=eq.' + encodeURIComponent(orgId) + '&select=id', { method: 'GET' });
      if (!dept.ok) return failStep(res, 'DEPARTMENT_QUERY_FAILED', dept, 'The selected department could not be verified.', 400);
      if (!Array.isArray(dept.json) || !dept.json[0]) return res.status(400).json({ error: 'The selected department is invalid.', code: 'DEPARTMENT_INVALID' });
    }

    const validRoleIds = [];
    for (const roleId of requestedRoleIds) {
      const role = await sb('/rest/v1/roles?id=eq.' + encodeURIComponent(roleId) + '&organization_id=eq.' + encodeURIComponent(orgId) + '&select=id,name', { method: 'GET' });
      if (!role.ok) return failStep(res, 'ROLE_QUERY_FAILED', role, 'The selected role could not be verified.', 400);
      if (!Array.isArray(role.json) || !role.json[0]) return res.status(400).json({ error: 'The selected role is invalid.', code: 'ROLE_INVALID' });

      const targetPermissions = await getPermissionCodesForRole(roleId);
      if (!targetPermissions.ok) return failStep(res, 'TARGET_ROLE_PERMISSION_QUERY_FAILED', targetPermissions.upstream, 'The selected role could not be verified.', 400);
      const missing = [...targetPermissions.codes].filter(code => !callerPermissions.codes.has(code));
      if (missing.length) return res.status(403).json({ error: 'You cannot assign a role with more permissions than your own.', code: 'ROLE_ESCALATION_BLOCKED' });
      validRoleIds.push(roleId);
    }

    const existingAuth = await findAuthUserByEmail(email);
    if (!existingAuth.ok) return failStep(res, 'AUTH_USER_LOOKUP_FAILED', existingAuth.upstream, 'We could not verify whether this email is already registered.');
    if (existingAuth.user) {
      const existingProfile = await sb('/rest/v1/users?id=eq.' + encodeURIComponent(existingAuth.user.id) + '&select=organization_id,status', { method: 'GET' });
      const row = existingProfile.ok && Array.isArray(existingProfile.json) ? existingProfile.json[0] : null;
      if (row && row.organization_id === orgId) return res.status(409).json({ error: 'This user already belongs to your organization.', code: 'USER_ALREADY_IN_ORG' });
      return res.status(409).json({ error: 'This email is already registered.', code: 'EMAIL_ALREADY_REGISTERED' });
    }

    const redirectTo = APP_ORIGIN ? '?redirect_to=' + encodeURIComponent(APP_ORIGIN + '/login.html') : '';
    const invite = await sb('/auth/v1/invite' + redirectTo, {
      method: 'POST',
      body: JSON.stringify({ email, data: { full_name: fullName, organization_id: orgId } }),
    });
    if (!invite.ok) {
      const msg = safeDetail(invite.json);
      if (/already|registered|exists/i.test(msg)) return res.status(409).json({ error: 'This email is already registered.', code: 'EMAIL_ALREADY_REGISTERED' });
      return failStep(res, 'AUTH_INVITE_FAILED', invite, 'The invitation email could not be sent. Check your Supabase email/SMTP configuration and try again.');
    }

    const newUserId = invite.json && (invite.json.id || (invite.json.user && invite.json.user.id));
    if (!newUserId) return failStep(res, 'AUTH_INVITE_NO_USER_ID', invite, 'The invitation was created but the new user ID was not returned.');

    const profileUpsert = await sb('/rest/v1/users?on_conflict=id', {
      method: 'POST',
      headers: { Prefer: 'resolution=merge-duplicates,return=representation' },
      body: JSON.stringify({
        id: newUserId,
        organization_id: orgId,
        email,
        full_name: fullName,
        job_title: jobTitle,
        phone,
        department_id: departmentId,
        status: 'invited',
      }),
    });
    if (!profileUpsert.ok) {
      await deleteAuthUser(newUserId);
      return failStep(res, 'PROFILE_UPSERT_FAILED', profileUpsert, 'The invitation could not be provisioned in the organization.');
    }

    if (validRoleIds.length) {
      const rows = validRoleIds.map(roleId => ({ user_id: newUserId, role_id: roleId, assigned_by: callerId }));
      const assign = await sb('/rest/v1/user_roles?on_conflict=user_id,role_id', {
        method: 'POST',
        headers: { Prefer: 'resolution=ignore-duplicates,return=minimal' },
        body: JSON.stringify(rows),
      });
      if (!assign.ok) {
        await deleteAuthUser(newUserId);
        return failStep(res, 'ROLE_ASSIGNMENT_FAILED', assign, 'The invitation was created, but the selected roles could not be assigned.');
      }
    }

    const audit = await sb('/rest/v1/audit_logs', {
      method: 'POST',
      headers: { Prefer: 'return=minimal' },
      body: JSON.stringify({
        organization_id: orgId,
        user_id: callerId,
        event: 'user_invited',
        entity_type: 'user',
        entity_id: newUserId,
        after_state: { email, full_name: fullName, department_id: departmentId, role_ids: validRoleIds },
      }),
    });
    if (!audit.ok) console.warn('[invite] AUDIT_WRITE_FAILED', audit.status, safeDetail(audit.json));

    return res.status(200).json({ ok: true, user_id: newUserId, message: 'Invitation sent successfully.' });
  } catch (err) {
    console.error('[invite] UNHANDLED', err && err.stack ? err.stack : err);
    return res.status(500).json({ error: 'We could not send the invitation. Please try again later.', code: 'UNHANDLED_ERROR' });
  }
};

async function getPermissionCodesForRole(roleId) {
  const rp = await sb('/rest/v1/role_permissions?role_id=eq.' + encodeURIComponent(roleId) + '&select=permission_id', { method: 'GET' });
  if (!rp.ok) return { ok: false, upstream: rp, codes: new Set() };
  const permissionIds = [...new Set((Array.isArray(rp.json) ? rp.json : []).map(x => x.permission_id).filter(Boolean))];
  if (!permissionIds.length) return { ok: true, codes: new Set() };
  const permissionFilter = 'in.(' + permissionIds.join(',') + ')';
  const p = await sb('/rest/v1/permissions?id=' + encodeURIComponent(permissionFilter) + '&select=code', { method: 'GET' });
  if (!p.ok) return { ok: false, upstream: p, codes: new Set() };
  return { ok: true, codes: new Set((Array.isArray(p.json) ? p.json : []).map(x => x.code).filter(Boolean)) };
}
