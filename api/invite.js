/**
 * GRC Expert — secure user invitation endpoint.
 * Requires Vercel env vars:
 *   SUPABASE_URL
 *   SUPABASE_ANON_KEY (or SUPABASE_PUBLISHABLE_KEY)
 *   SUPABASE_SERVICE_ROLE_KEY (legacy service_role JWT or new sb_secret_* key)
 *   APP_ORIGIN
 */
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL;
const PUBLIC_KEY = process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_PUBLISHABLE_KEY;
const ADMIN_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY;
const APP_ORIGIN = process.env.APP_ORIGIN || '';

const rateLimitStore = new Map();
function isRateLimited(key, max = 10, windowMs = 60_000) {
  const now = Date.now();
  let item = rateLimitStore.get(key);
  if (!item || now >= item.resetAt) item = { count: 0, resetAt: now + windowMs };
  item.count += 1;
  rateLimitStore.set(key, item);
  return item.count > max;
}

function jsonError(res, status, code, message) {
  return res.status(status).json({ ok: false, code, error: message });
}

module.exports = async function handler(req, res) {
  const origin = req.headers.origin || '';
  if (APP_ORIGIN && origin === APP_ORIGIN) {
    res.setHeader('Access-Control-Allow-Origin', APP_ORIGIN);
    res.setHeader('Vary', 'Origin');
  }
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
  res.setHeader('Cache-Control', 'no-store');

  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return jsonError(res, 405, 'METHOD_NOT_ALLOWED', 'Method not allowed.');

  if (!SUPABASE_URL || !PUBLIC_KEY || !ADMIN_KEY) {
    return jsonError(
      res,
      503,
      'SERVER_NOT_CONFIGURED',
      'The invitation service is not fully configured. Add SUPABASE_URL, SUPABASE_ANON_KEY (or SUPABASE_PUBLISHABLE_KEY), and SUPABASE_SERVICE_ROLE_KEY in Vercel, then redeploy.'
    );
  }

  try {
    const authHeader = String(req.headers.authorization || '');
    const accessToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
    if (!accessToken) return jsonError(res, 401, 'TOKEN_MISSING', 'Your session has expired. Please sign in again.');

    // Validate the user's JWT with a public project key. Do not use a new sb_secret_* key as a Bearer JWT.
    const authClient = createClient(SUPABASE_URL, PUBLIC_KEY, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });
    const { data: userData, error: userError } = await authClient.auth.getUser(accessToken);
    const caller = userData && userData.user;
    if (userError || !caller || !caller.id) {
      console.warn('[invite] token validation failed:', userError && userError.message);
      return jsonError(res, 401, 'TOKEN_INVALID', 'Your session has expired. Please sign in again.');
    }

    if (isRateLimited('invite:' + caller.id)) {
      return jsonError(res, 429, 'RATE_LIMITED', 'Too many invitation attempts. Please wait one minute and try again.');
    }

    // SDK handles both legacy service_role JWTs and new sb_secret_* keys correctly.
    const admin = createClient(SUPABASE_URL, ADMIN_KEY, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });

    const { data: profile, error: profileError } = await admin
      .from('users')
      .select('id, organization_id, status')
      .eq('id', caller.id)
      .maybeSingle();
    if (profileError) {
      console.error('[invite] caller profile:', profileError.message);
      return jsonError(res, 500, 'CALLER_PROFILE_FAILED', 'We could not verify your organization membership.');
    }
    if (!profile || profile.status !== 'active' || !profile.organization_id) {
      return jsonError(res, 403, 'CALLER_NOT_ACTIVE', 'You do not have permission to invite users.');
    }
    const orgId = profile.organization_id;

    const { data: roleLinks, error: roleLinksError } = await admin
      .from('user_roles')
      .select('role_id, roles(name, role_permissions(permissions(code)))')
      .eq('user_id', caller.id);
    if (roleLinksError) {
      console.error('[invite] caller permissions:', roleLinksError.message);
      return jsonError(res, 500, 'CALLER_PERMISSION_QUERY_FAILED', 'We could not verify your permissions.');
    }

    const callerPermissions = new Set();
    (roleLinks || []).forEach((link) => {
      const role = link.roles;
      (role && role.role_permissions || []).forEach((rp) => {
        if (rp.permissions && rp.permissions.code) callerPermissions.add(rp.permissions.code);
      });
    });
    if (!callerPermissions.has('users.manage')) {
      return jsonError(res, 403, 'PERMISSION_DENIED', 'You do not have permission to invite users.');
    }

    const body = req.body && typeof req.body === 'object' ? req.body : {};
    const email = String(body.email || '').trim().toLowerCase();
    const fullName = String(body.full_name || '').trim().slice(0, 120);
    const jobTitle = body.job_title ? String(body.job_title).trim().slice(0, 120) : null;
    const phone = body.phone ? String(body.phone).trim().slice(0, 40) : null;
    const departmentId = body.department_id ? String(body.department_id) : null;
    const requestedRoleIds = Array.isArray(body.role_ids) ? [...new Set(body.role_ids.map(String))].slice(0, 20) : [];

    if (!fullName) return jsonError(res, 400, 'FULL_NAME_REQUIRED', 'Full name is required.');
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return jsonError(res, 400, 'EMAIL_INVALID', 'Please enter a valid email address.');

    if (departmentId) {
      const { data: department, error: departmentError } = await admin
        .from('departments')
        .select('id')
        .eq('id', departmentId)
        .eq('organization_id', orgId)
        .maybeSingle();
      if (departmentError || !department) return jsonError(res, 400, 'DEPARTMENT_INVALID', 'The selected department is invalid.');
    }

    const validRoleIds = [];
    if (requestedRoleIds.length) {
      const { data: selectedRoles, error: selectedRolesError } = await admin
        .from('roles')
        .select('id, role_permissions(permissions(code))')
        .eq('organization_id', orgId)
        .in('id', requestedRoleIds);
      if (selectedRolesError || !selectedRoles || selectedRoles.length !== requestedRoleIds.length) {
        return jsonError(res, 400, 'ROLE_INVALID', 'One or more selected roles are invalid.');
      }
      for (const role of selectedRoles) {
        const codes = (role.role_permissions || []).map((rp) => rp.permissions && rp.permissions.code).filter(Boolean);
        if (codes.some((code) => !callerPermissions.has(code))) {
          return jsonError(res, 403, 'ROLE_ESCALATION_BLOCKED', 'You cannot assign a role with permissions above your own.');
        }
        validRoleIds.push(role.id);
      }
    }

    // Reliable duplicate lookup through paginated Auth Admin API.
    let page = 1;
    let existingAuthUser = null;
    while (page <= 20 && !existingAuthUser) {
      const { data: pageData, error: pageError } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
      if (pageError) {
        console.error('[invite] list users:', pageError.message);
        return jsonError(res, 500, 'AUTH_LOOKUP_FAILED', 'We could not verify whether this email is already registered.');
      }
      const users = pageData && pageData.users || [];
      existingAuthUser = users.find((u) => String(u.email || '').toLowerCase() === email) || null;
      if (users.length < 1000) break;
      page += 1;
    }
    if (existingAuthUser) return jsonError(res, 409, 'EMAIL_ALREADY_REGISTERED', 'This email is already registered.');

    const redirectTo = (APP_ORIGIN || origin || '').replace(/\/$/, '') + '/login.html';
    const { data: inviteData, error: inviteError } = await admin.auth.admin.inviteUserByEmail(email, {
      redirectTo,
      data: { full_name: fullName, organization_id: orgId },
    });
    if (inviteError || !inviteData || !inviteData.user) {
      console.error('[invite] auth invite:', inviteError && inviteError.message);
      const duplicate = inviteError && /already|registered|exists/i.test(inviteError.message || '');
      return jsonError(res, duplicate ? 409 : 500, duplicate ? 'EMAIL_ALREADY_REGISTERED' : 'AUTH_INVITE_FAILED', duplicate ? 'This email is already registered.' : 'We could not send the invitation email.');
    }

    const newUserId = inviteData.user.id;
    let provisioningComplete = false;
    try {
      const { error: profileUpsertError } = await admin.from('users').upsert({
        id: newUserId,
        organization_id: orgId,
        email,
        full_name: fullName,
        job_title: jobTitle,
        phone,
        department_id: departmentId,
        status: 'invited',
      }, { onConflict: 'id' });
      if (profileUpsertError) throw Object.assign(new Error(profileUpsertError.message), { code: 'PROFILE_UPSERT_FAILED' });

      if (validRoleIds.length) {
        const rows = validRoleIds.map((roleId) => ({ user_id: newUserId, role_id: roleId, assigned_by: caller.id }));
        const { error: assignmentError } = await admin.from('user_roles').upsert(rows, { onConflict: 'user_id,role_id', ignoreDuplicates: true });
        if (assignmentError) throw Object.assign(new Error(assignmentError.message), { code: 'ROLE_ASSIGNMENT_FAILED' });
      }

      await admin.from('audit_logs').insert({
        organization_id: orgId,
        user_id: caller.id,
        event: 'user_invited',
        entity_type: 'user',
        entity_id: newUserId,
        after_state: { email, full_name: fullName, department_id: departmentId, role_ids: validRoleIds },
      });
      provisioningComplete = true;
    } catch (provisionError) {
      console.error('[invite] provisioning:', provisionError.message);
      await admin.auth.admin.deleteUser(newUserId).catch(() => {});
      return jsonError(res, 500, provisionError.code || 'PROVISIONING_FAILED', 'The invitation was created but workspace provisioning failed, so it was rolled back.');
    }

    if (!provisioningComplete) return jsonError(res, 500, 'PROVISIONING_FAILED', 'We could not finish creating the user.');
    return res.status(200).json({ ok: true, user_id: newUserId, message: 'Invitation sent.' });
  } catch (error) {
    console.error('[invite] unexpected:', error);
    return jsonError(res, 500, 'UNEXPECTED_ERROR', 'We could not create the user. Please try again later.');
  }
};
