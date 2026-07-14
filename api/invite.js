/**
 * GRC Expert — secure user invitation endpoint
 * POST /api/invite
 */
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
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

function sendError(res, status, code, message) {
  return res.status(status).json({ ok: false, code, error: message });
}

function makeClient(key, options = {}) {
  return createClient(SUPABASE_URL, key, {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
    ...options,
  });
}

async function findAuthUserByEmail(admin, email) {
  for (let page = 1; page <= 10; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 100 });
    if (error) throw error;
    const users = data && Array.isArray(data.users) ? data.users : [];
    const found = users.find((u) => String(u.email || '').toLowerCase() === email);
    if (found) return found;
    if (users.length < 100) break;
  }
  return null;
}

module.exports = async function handler(req, res) {
  const origin = req.headers.origin || '';
  if (APP_ORIGIN && origin === APP_ORIGIN) res.setHeader('Access-Control-Allow-Origin', APP_ORIGIN);
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');

  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return sendError(res, 405, 'METHOD_NOT_ALLOWED', 'Method not allowed.');

  if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !SERVICE_KEY) {
    return sendError(res, 503, 'SERVER_NOT_CONFIGURED', 'The invitation service is temporarily unavailable.');
  }

  try {
    const authHeader = String(req.headers.authorization || '');
    const accessToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
    if (!accessToken) return sendError(res, 401, 'TOKEN_MISSING', 'Your session has expired. Please sign in again.');

    const userClient = makeClient(SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: `Bearer ${accessToken}` } },
    });
    const admin = makeClient(SERVICE_KEY);

    const { data: authData, error: authError } = await userClient.auth.getUser(accessToken);
    const caller = authData && authData.user;
    if (authError || !caller) {
      console.error('[invite] token validation failed:', authError && authError.message);
      return sendError(res, 401, 'TOKEN_INVALID', 'Your session has expired. Please sign in again.');
    }

    if (isRateLimited(`invite:${caller.id}`)) {
      return sendError(res, 429, 'RATE_LIMITED', 'Too many invitation attempts. Please wait a minute and try again.');
    }

    const { data: callerProfile, error: profileError } = await admin
      .from('users')
      .select('id, organization_id, status, email, full_name')
      .eq('id', caller.id)
      .maybeSingle();

    if (profileError) {
      console.error('[invite] caller profile query failed:', profileError);
      return sendError(res, 500, 'CALLER_PROFILE_QUERY_FAILED', 'We could not verify your organization membership.');
    }
    if (!callerProfile) return sendError(res, 403, 'CALLER_PROFILE_NOT_FOUND', 'Your account does not have an application profile.');
    if (!callerProfile.organization_id) return sendError(res, 403, 'CALLER_ORGANIZATION_MISSING', 'Your account is not linked to an organization.');
    if (callerProfile.status !== 'active') return sendError(res, 403, 'CALLER_INACTIVE', 'Your account is not active.');

    const orgId = callerProfile.organization_id;

    const { data: callerRoleRows, error: callerRolesError } = await admin
      .from('user_roles')
      .select('role_id')
      .eq('user_id', caller.id);
    if (callerRolesError) {
      console.error('[invite] caller roles query failed:', callerRolesError);
      return sendError(res, 500, 'CALLER_ROLES_QUERY_FAILED', 'We could not verify your permissions.');
    }

    const callerRoleIds = (callerRoleRows || []).map((r) => r.role_id);
    if (!callerRoleIds.length) return sendError(res, 403, 'PERMISSION_DENIED', 'You do not have permission to add users.');

    const { data: callerPermissionRows, error: callerPermError } = await admin
      .from('role_permissions')
      .select('permission_id, permissions(code)')
      .in('role_id', callerRoleIds);
    if (callerPermError) {
      console.error('[invite] caller permissions query failed:', callerPermError);
      return sendError(res, 500, 'CALLER_PERMISSION_QUERY_FAILED', 'We could not verify your permissions.');
    }

    const callerPermCodes = new Set(
      (callerPermissionRows || []).map((r) => r.permissions && r.permissions.code).filter(Boolean)
    );
    if (!callerPermCodes.has('users.manage')) {
      return sendError(res, 403, 'PERMISSION_DENIED', 'You do not have permission to add users.');
    }

    const body = req.body && typeof req.body === 'object' ? req.body : {};
    const email = String(body.email || '').trim().toLowerCase();
    const fullName = String(body.full_name || '').trim().slice(0, 120);
    const jobTitle = body.job_title ? String(body.job_title).trim().slice(0, 120) : null;
    const phone = body.phone ? String(body.phone).trim().slice(0, 40) : null;
    const departmentId = body.department_id ? String(body.department_id) : null;
    const roleIds = Array.isArray(body.role_ids) ? [...new Set(body.role_ids.map(String))].slice(0, 20) : [];

    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return sendError(res, 400, 'INVALID_EMAIL', 'Please enter a valid email address.');
    if (!fullName) return sendError(res, 400, 'NAME_REQUIRED', 'Full name is required.');

    if (departmentId) {
      const { data: dept, error: deptError } = await admin
        .from('departments').select('id').eq('id', departmentId).eq('organization_id', orgId).maybeSingle();
      if (deptError) {
        console.error('[invite] department query failed:', deptError);
        return sendError(res, 500, 'DEPARTMENT_QUERY_FAILED', 'We could not validate the selected department.');
      }
      if (!dept) return sendError(res, 400, 'INVALID_DEPARTMENT', 'The selected department is invalid.');
    }

    let validRoles = [];
    if (roleIds.length) {
      const { data: roles, error: rolesError } = await admin
        .from('roles').select('id,name').in('id', roleIds).eq('organization_id', orgId);
      if (rolesError) {
        console.error('[invite] roles query failed:', rolesError);
        return sendError(res, 500, 'ROLE_QUERY_FAILED', 'We could not validate the selected roles.');
      }
      if ((roles || []).length !== roleIds.length) return sendError(res, 400, 'INVALID_ROLE', 'One or more selected roles are invalid.');
      validRoles = roles || [];

      const { data: selectedPermRows, error: selectedPermError } = await admin
        .from('role_permissions').select('role_id, permissions(code)').in('role_id', roleIds);
      if (selectedPermError) {
        console.error('[invite] selected role permissions failed:', selectedPermError);
        return sendError(res, 500, 'ROLE_PERMISSION_QUERY_FAILED', 'We could not validate the selected roles.');
      }
      const missing = (selectedPermRows || [])
        .map((r) => r.permissions && r.permissions.code)
        .filter((code) => code && !callerPermCodes.has(code));
      if (missing.length) return sendError(res, 403, 'ESCALATION_BLOCKED', 'You cannot assign a role with more permissions than your own.');
    }

    const existingAuthUser = await findAuthUserByEmail(admin, email);
    if (existingAuthUser) {
      const { data: existingProfile } = await admin
        .from('users').select('organization_id').eq('id', existingAuthUser.id).maybeSingle();
      if (existingProfile && existingProfile.organization_id === orgId) {
        return sendError(res, 409, 'USER_ALREADY_IN_ORG', 'This user already belongs to your organization.');
      }
      if (existingProfile) return sendError(res, 409, 'EMAIL_IN_ANOTHER_ORG', 'This email is already registered in another organization.');
      return sendError(res, 409, 'EMAIL_ALREADY_REGISTERED', 'This email is already registered.');
    }

    const redirectTo = `${APP_ORIGIN || origin}/login.html`;
    const { data: inviteData, error: inviteError } = await admin.auth.admin.inviteUserByEmail(email, {
      redirectTo,
      data: { full_name: fullName, organization_id: orgId },
    });
    if (inviteError || !inviteData || !inviteData.user) {
      console.error('[invite] auth invite failed:', inviteError);
      const msg = String(inviteError && inviteError.message || '');
      if (/already|registered|exists/i.test(msg)) return sendError(res, 409, 'EMAIL_ALREADY_REGISTERED', 'This email is already registered.');
      return sendError(res, 500, 'AUTH_INVITE_FAILED', 'We could not send the invitation. Please try again later.');
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
      if (profileUpsertError) throw Object.assign(new Error(profileUpsertError.message), { code: 'PROFILE_UPSERT_FAILED', detail: profileUpsertError });

      if (validRoles.length) {
        const roleRows = validRoles.map((role) => ({ user_id: newUserId, role_id: role.id, assigned_by: caller.id }));
        const { error: roleAssignError } = await admin.from('user_roles').upsert(roleRows, { onConflict: 'user_id,role_id', ignoreDuplicates: true });
        if (roleAssignError) throw Object.assign(new Error(roleAssignError.message), { code: 'ROLE_ASSIGNMENT_FAILED', detail: roleAssignError });
      }

      const { error: auditError } = await admin.from('audit_logs').insert({
        organization_id: orgId,
        user_id: caller.id,
        event: 'user_invited',
        entity_type: 'user',
        entity_id: newUserId,
        after_state: { email, full_name: fullName, department_id: departmentId, role_ids: validRoles.map((r) => r.id) },
      });
      if (auditError) console.error('[invite] audit insert failed:', auditError);
      provisioningComplete = true;
    } catch (provisionError) {
      console.error('[invite] provisioning failed:', provisioningError.detail || provisioningError);
      await admin.auth.admin.deleteUser(newUserId).catch(() => {});
      return sendError(res, 500, provisioningError.code || 'PROVISIONING_FAILED', 'The invitation could not be completed. No user was added.');
    }

    if (!provisioningComplete) return sendError(res, 500, 'PROVISIONING_FAILED', 'The invitation could not be completed.');
    return res.status(200).json({ ok: true, user_id: newUserId });
  } catch (error) {
    console.error('[invite] unhandled error:', error);
    return sendError(res, 500, 'INTERNAL_ERROR', 'We could not create the user. Please try again later.');
  }
};
