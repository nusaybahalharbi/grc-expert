/**
 * GRC Expert — secure user invitation endpoint
 * File: api/invite.js
 *
 * Required Vercel environment variables:
 *   SUPABASE_URL
 *   SUPABASE_ANON_KEY
 *   SUPABASE_SERVICE_ROLE_KEY
 *   APP_ORIGIN
 */

const SUPABASE_URL = String(process.env.SUPABASE_URL || '').replace(/\/$/, '');
const ANON_KEY = String(process.env.SUPABASE_ANON_KEY || '');
const SERVICE_KEY = String(process.env.SUPABASE_SERVICE_ROLE_KEY || '');
const APP_ORIGIN = String(process.env.APP_ORIGIN || '').replace(/\/$/, '');

const RATE_LIMIT = new Map();

function json(res, status, code, message, extra) {
  return res.status(status).json({
    ok: status >= 200 && status < 300,
    code,
    message,
    ...(extra || {}),
  });
}

function isRateLimited(key, max = 10, windowMs = 60_000) {
  const now = Date.now();
  let entry = RATE_LIMIT.get(key);
  if (!entry || now >= entry.resetAt) {
    entry = { count: 0, resetAt: now + windowMs };
  }
  entry.count += 1;
  RATE_LIMIT.set(key, entry);
  return entry.count > max;
}

function parseBody(req) {
  if (!req.body) return {};
  if (typeof req.body === 'object') return req.body;
  try {
    return JSON.parse(req.body);
  } catch {
    return null;
  }
}

function isLegacyJwt(key) {
  return key.startsWith('eyJ');
}

function adminHeaders(extra) {
  const headers = {
    apikey: SERVICE_KEY,
    'Content-Type': 'application/json',
    ...(extra || {}),
  };

  // Legacy service_role keys are JWTs and may be sent as Bearer tokens.
  // New sb_secret_* keys must not be used as Bearer JWTs.
  if (isLegacyJwt(SERVICE_KEY)) {
    headers.Authorization = `Bearer ${SERVICE_KEY}`;
  }

  return headers;
}

async function request(url, options) {
  const response = await fetch(url, options);
  const raw = await response.text();
  let data = null;

  if (raw) {
    try {
      data = JSON.parse(raw);
    } catch {
      data = raw;
    }
  }

  return {
    ok: response.ok,
    status: response.status,
    data,
  };
}

async function adminRest(path, options = {}) {
  return request(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...options,
    headers: adminHeaders(options.headers),
  });
}

async function adminAuth(path, options = {}) {
  return request(`${SUPABASE_URL}/auth/v1/${path}`, {
    ...options,
    headers: adminHeaders(options.headers),
  });
}

async function validateAccessToken(accessToken) {
  return request(`${SUPABASE_URL}/auth/v1/user`, {
    method: 'GET',
    headers: {
      apikey: ANON_KEY,
      Authorization: `Bearer ${accessToken}`,
    },
  });
}

function encodeIn(values) {
  return values.map((value) => `"${String(value).replace(/"/g, '')}"`).join(',');
}

async function deleteAuthUser(userId) {
  try {
    await adminAuth(`admin/users/${encodeURIComponent(userId)}`, { method: 'DELETE' });
  } catch (error) {
    console.error('[invite] cleanup auth user failed', error);
  }
}

async function deletePublicUser(userId) {
  try {
    await adminRest(`users?id=eq.${encodeURIComponent(userId)}`, { method: 'DELETE' });
  } catch (error) {
    console.error('[invite] cleanup public user failed', error);
  }
}

async function callerCanManageUsers(callerId, organizationId) {
  const userRoles = await adminRest(
    `user_roles?user_id=eq.${encodeURIComponent(callerId)}&select=role_id`,
    { method: 'GET' },
  );

  if (!userRoles.ok) {
    console.error('[invite] user_roles query failed', userRoles.status, userRoles.data);
    return { ok: false, code: 'CALLER_ROLES_QUERY_FAILED' };
  }

  const roleIds = Array.isArray(userRoles.data)
    ? userRoles.data.map((row) => row.role_id).filter(Boolean)
    : [];

  if (!roleIds.length) return { ok: true, allowed: false, roleIds: [] };

  const roles = await adminRest(
    `roles?id=in.(${encodeIn(roleIds)})&organization_id=eq.${encodeURIComponent(organizationId)}&select=id,name`,
    { method: 'GET' },
  );

  if (!roles.ok) {
    console.error('[invite] roles query failed', roles.status, roles.data);
    return { ok: false, code: 'CALLER_ROLES_QUERY_FAILED' };
  }

  const organizationRoleIds = Array.isArray(roles.data)
    ? roles.data.map((row) => row.id).filter(Boolean)
    : [];

  const isAdministrator = Array.isArray(roles.data)
    && roles.data.some((row) => String(row.name || '').toLowerCase() === 'administrator');

  if (isAdministrator) {
    return { ok: true, allowed: true, roleIds: organizationRoleIds };
  }

  if (!organizationRoleIds.length) return { ok: true, allowed: false, roleIds: [] };

  const rolePermissions = await adminRest(
    `role_permissions?role_id=in.(${encodeIn(organizationRoleIds)})&select=permission_id`,
    { method: 'GET' },
  );

  if (!rolePermissions.ok) {
    console.error('[invite] role_permissions query failed', rolePermissions.status, rolePermissions.data);
    return { ok: false, code: 'CALLER_PERMISSIONS_QUERY_FAILED' };
  }

  const permissionIds = Array.isArray(rolePermissions.data)
    ? [...new Set(rolePermissions.data.map((row) => row.permission_id).filter(Boolean))]
    : [];

  if (!permissionIds.length) return { ok: true, allowed: false, roleIds: organizationRoleIds };

  const permissions = await adminRest(
    `permissions?id=in.(${encodeIn(permissionIds)})&code=eq.users.manage&select=id,code`,
    { method: 'GET' },
  );

  if (!permissions.ok) {
    console.error('[invite] permissions query failed', permissions.status, permissions.data);
    return { ok: false, code: 'CALLER_PERMISSIONS_QUERY_FAILED' };
  }

  return {
    ok: true,
    allowed: Array.isArray(permissions.data) && permissions.data.length > 0,
    roleIds: organizationRoleIds,
  };
}

async function findAuthUserByEmail(email) {
  // Auth Admin listUsers is paginated. Check several pages rather than using
  // the unsupported `filter=email.eq...` pattern.
  for (let page = 1; page <= 10; page += 1) {
    const result = await adminAuth(`admin/users?page=${page}&per_page=100`, { method: 'GET' });

    if (!result.ok) {
      console.error('[invite] auth users lookup failed', result.status, result.data);
      return { ok: false, code: 'AUTH_LOOKUP_FAILED' };
    }

    const users = Array.isArray(result.data?.users)
      ? result.data.users
      : Array.isArray(result.data)
        ? result.data
        : [];

    const match = users.find((user) => String(user.email || '').toLowerCase() === email);
    if (match) return { ok: true, user: match };
    if (users.length < 100) break;
  }

  return { ok: true, user: null };
}

module.exports = async function handler(req, res) {
  const requestOrigin = String(req.headers.origin || '').replace(/\/$/, '');

  if (APP_ORIGIN && requestOrigin === APP_ORIGIN) {
    res.setHeader('Access-Control-Allow-Origin', APP_ORIGIN);
  }
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
  res.setHeader('Cache-Control', 'no-store');

  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') {
    return json(res, 405, 'METHOD_NOT_ALLOWED', 'Method not allowed.');
  }

  if (!SUPABASE_URL || !ANON_KEY || !SERVICE_KEY || !APP_ORIGIN) {
    return json(
      res,
      503,
      'SERVER_NOT_CONFIGURED',
      'The invitation service is temporarily unavailable. Please contact your administrator.',
    );
  }

  if (requestOrigin && APP_ORIGIN && requestOrigin !== APP_ORIGIN) {
    return json(res, 403, 'ORIGIN_NOT_ALLOWED', 'This request origin is not allowed.');
  }

  try {
    const authHeader = String(req.headers.authorization || '');
    const accessToken = authHeader.startsWith('Bearer ')
      ? authHeader.slice(7).trim()
      : '';

    if (!accessToken) {
      return json(res, 401, 'TOKEN_MISSING', 'Your session has expired. Please sign in again.');
    }

    const authResult = await validateAccessToken(accessToken);
    if (!authResult.ok || !authResult.data?.id) {
      console.error('[invite] token validation failed', authResult.status, authResult.data);
      return json(res, 401, 'TOKEN_INVALID', 'Your session has expired. Please sign in again.');
    }

    const caller = authResult.data;

    if (isRateLimited(`invite:${caller.id}`, 10, 60_000)) {
      return json(res, 429, 'RATE_LIMITED', 'Too many invitation attempts. Please wait and try again.');
    }

    // This query intentionally uses the server-only admin credentials and only
    // selects columns confirmed to exist in the current schema.
    const profileResult = await adminRest(
      `users?id=eq.${encodeURIComponent(caller.id)}&select=id,email,organization_id,status`,
      { method: 'GET' },
    );

    if (!profileResult.ok) {
      console.error('[invite] caller profile query failed', profileResult.status, profileResult.data);
      return json(
        res,
        500,
        'CALLER_PROFILE_QUERY_FAILED',
        'We could not verify your organization membership.',
      );
    }

    const callerProfile = Array.isArray(profileResult.data) ? profileResult.data[0] : null;

    if (!callerProfile) {
      return json(
        res,
        403,
        'CALLER_PROFILE_NOT_FOUND',
        'Your account does not have an application profile.',
      );
    }

    if (!callerProfile.organization_id) {
      return json(
        res,
        403,
        'CALLER_ORGANIZATION_MISSING',
        'Your account is not linked to an organization.',
      );
    }

    if (String(callerProfile.status || '').toLowerCase() !== 'active') {
      return json(res, 403, 'CALLER_INACTIVE', 'Your account is not active.');
    }

    const permissionCheck = await callerCanManageUsers(caller.id, callerProfile.organization_id);
    if (!permissionCheck.ok) {
      return json(
        res,
        500,
        permissionCheck.code,
        'We could not verify your user-management permission.',
      );
    }

    if (!permissionCheck.allowed) {
      return json(res, 403, 'PERMISSION_DENIED', 'You do not have permission to invite users.');
    }

    const body = parseBody(req);
    if (body === null) {
      return json(res, 400, 'INVALID_JSON', 'The request body is invalid.');
    }

    const email = String(body.email || '').trim().toLowerCase();
    const fullName = String(body.full_name || '').trim().slice(0, 120);
    const departmentId = body.department_id ? String(body.department_id).trim() : null;
    const roleIds = Array.isArray(body.role_ids)
      ? [...new Set(body.role_ids.map((value) => String(value).trim()).filter(Boolean))].slice(0, 20)
      : [];

    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      return json(res, 400, 'INVALID_EMAIL', 'Please enter a valid email address.');
    }

    if (!fullName) {
      return json(res, 400, 'FULL_NAME_REQUIRED', 'Full name is required.');
    }

    if (!roleIds.length) {
      return json(res, 400, 'ROLE_REQUIRED', 'Please select at least one role.');
    }

    if (departmentId) {
      const departmentResult = await adminRest(
        `departments?id=eq.${encodeURIComponent(departmentId)}&organization_id=eq.${encodeURIComponent(callerProfile.organization_id)}&select=id`,
        { method: 'GET' },
      );

      if (!departmentResult.ok) {
        console.error('[invite] department query failed', departmentResult.status, departmentResult.data);
        return json(res, 500, 'DEPARTMENT_QUERY_FAILED', 'We could not verify the selected department.');
      }

      if (!Array.isArray(departmentResult.data) || !departmentResult.data[0]) {
        return json(res, 400, 'INVALID_DEPARTMENT', 'The selected department is invalid.');
      }
    }

    const selectedRoles = await adminRest(
      `roles?id=in.(${encodeIn(roleIds)})&organization_id=eq.${encodeURIComponent(callerProfile.organization_id)}&select=id,name`,
      { method: 'GET' },
    );

    if (!selectedRoles.ok) {
      console.error('[invite] selected roles query failed', selectedRoles.status, selectedRoles.data);
      return json(res, 500, 'ROLE_QUERY_FAILED', 'We could not verify the selected role.');
    }

    const validRoleIds = Array.isArray(selectedRoles.data)
      ? selectedRoles.data.map((role) => role.id).filter(Boolean)
      : [];

    if (validRoleIds.length !== roleIds.length) {
      return json(res, 400, 'INVALID_ROLE', 'One or more selected roles are invalid.');
    }

    const existingAuthResult = await findAuthUserByEmail(email);
    if (!existingAuthResult.ok) {
      return json(res, 500, existingAuthResult.code, 'We could not verify whether this email is already registered.');
    }

    if (existingAuthResult.user) {
      return json(res, 409, 'EMAIL_ALREADY_REGISTERED', 'This email is already registered.');
    }

    const redirectTo = `${APP_ORIGIN}/login.html`;
    const inviteResult = await adminAuth(
      `invite?redirect_to=${encodeURIComponent(redirectTo)}`,
      {
        method: 'POST',
        body: JSON.stringify({
          email,
          data: {
            full_name: fullName,
            organization_id: callerProfile.organization_id,
          },
        }),
      },
    );

    if (!inviteResult.ok) {
      console.error('[invite] auth invitation failed', inviteResult.status, inviteResult.data);
      const message = String(inviteResult.data?.msg || inviteResult.data?.message || inviteResult.data?.error || '');
      if (/already|registered|exists/i.test(message)) {
        return json(res, 409, 'EMAIL_ALREADY_REGISTERED', 'This email is already registered.');
      }
      return json(res, 500, 'AUTH_INVITE_FAILED', 'We could not send the invitation email.');
    }

    const newUserId = inviteResult.data?.id || inviteResult.data?.user?.id;
    if (!newUserId) {
      console.error('[invite] invitation response missing user id', inviteResult.data);
      return json(res, 500, 'AUTH_INVITE_INVALID_RESPONSE', 'The invitation service returned an invalid response.');
    }

    // Upsert is used because an auth trigger may already have created the profile.
    const profileUpsert = await adminRest(
      'users?on_conflict=id',
      {
        method: 'POST',
        headers: {
          Prefer: 'resolution=merge-duplicates,return=minimal',
        },
        body: JSON.stringify({
          id: newUserId,
          organization_id: callerProfile.organization_id,
          email,
          full_name: fullName,
          department_id: departmentId,
          status: 'invited',
        }),
      },
    );

    if (!profileUpsert.ok) {
      console.error('[invite] profile upsert failed', profileUpsert.status, profileUpsert.data);
      await deleteAuthUser(newUserId);
      return json(res, 500, 'PROFILE_UPSERT_FAILED', 'We could not create the invited user profile.');
    }

    const assignmentRows = validRoleIds.map((roleId) => ({
      user_id: newUserId,
      role_id: roleId,
    }));

    const roleAssignment = await adminRest(
      'user_roles?on_conflict=user_id,role_id',
      {
        method: 'POST',
        headers: {
          Prefer: 'resolution=ignore-duplicates,return=minimal',
        },
        body: JSON.stringify(assignmentRows),
      },
    );

    if (!roleAssignment.ok) {
      console.error('[invite] role assignment failed', roleAssignment.status, roleAssignment.data);
      await deletePublicUser(newUserId);
      await deleteAuthUser(newUserId);
      return json(res, 500, 'ROLE_ASSIGNMENT_FAILED', 'We could not assign the selected role.');
    }

    // Audit logging is best-effort because older deployments may have a
    // different audit_logs column layout. An audit failure must not undo a
    // successfully sent invitation.
    const auditResult = await adminRest('audit_logs', {
      method: 'POST',
      headers: { Prefer: 'return=minimal' },
      body: JSON.stringify({
        organization_id: callerProfile.organization_id,
        user_id: caller.id,
        event: 'user_invited',
        entity_type: 'user',
        entity_id: newUserId,
        after_state: {
          email,
          full_name: fullName,
          department_id: departmentId,
          role_ids: validRoleIds,
        },
      }),
    });

    if (!auditResult.ok) {
      console.error('[invite] audit log insert failed', auditResult.status, auditResult.data);
    }

    return json(res, 200, 'INVITATION_SENT', 'Invitation sent successfully.', {
      user_id: newUserId,
    });
  } catch (error) {
    console.error('[invite] unexpected error', error);
    return json(res, 500, 'UNEXPECTED_ERROR', 'We could not create the user. Please try again later.');
  }
};
