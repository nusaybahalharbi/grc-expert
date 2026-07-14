/**
 * GRC Expert — Secure User Invitation Endpoint
 * POST /api/invite
 *
 * Security model:
 *  - Requires Authorization: Bearer <supabase access token>
 *  - Validates the JWT against Supabase (getUser)
 *  - Confirms the caller has the 'users.manage' permission
 *  - Uses the SERVICE ROLE key ONLY here on the server (never shipped to browser)
 *  - Creates the invited auth user + profile row in the caller's org
 *  - Rate limited per caller (in-memory; best-effort on serverless)
 *
 * Required environment variables (Vercel → Project → Settings → Environment Variables):
 *  - SUPABASE_URL
 *  - SUPABASE_SERVICE_ROLE_KEY   (server-only; NEVER in frontend)
 *  - APP_ORIGIN                   (e.g. https://grc-expert.vercel.app)
 */

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const APP_ORIGIN = process.env.APP_ORIGIN || '';

// crude in-memory rate limit (per warm lambda instance)
const rl = new Map();
function rateLimited(key, max, windowMs) {
  const now = Date.now();
  const rec = rl.get(key) || { n: 0, reset: now + windowMs };
  if (now > rec.reset) { rec.n = 0; rec.reset = now + windowMs; }
  rec.n++;
  rl.set(key, rec);
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

module.exports = async function handler(req, res) {
  // CORS — restrict to production origin
  const origin = req.headers.origin || '';
  if (APP_ORIGIN && origin === APP_ORIGIN) {
    res.setHeader('Access-Control-Allow-Origin', APP_ORIGIN);
  }
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  if (!SUPABASE_URL || !SERVICE_KEY) {
    return res.status(500).json({ error: 'Server not configured' });
  }

  try {
    // 1. Validate JWT
    const authHeader = req.headers.authorization || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
    if (!token) return res.status(401).json({ error: 'Missing token' });

    const userRes = await fetch(SUPABASE_URL + '/auth/v1/user', {
      headers: { apikey: SERVICE_KEY, Authorization: 'Bearer ' + token },
    });
    if (!userRes.ok) return res.status(401).json({ error: 'Invalid or expired token' });
    const caller = await userRes.json();
    const callerId = caller.id;
    if (!callerId) return res.status(401).json({ error: 'Invalid token' });

    // 2. Rate limit per caller
    if (rateLimited('invite:' + callerId, 10, 60 * 1000)) {
      return res.status(429).json({ error: 'Too many invitations. Please wait a minute.' });
    }

    // 3. Resolve caller's org + permission (server-side, do not trust body)
    const profRes = await sb('/rest/v1/users?id=eq.' + callerId + '&select=organization_id,status', { method: 'GET' });
    if (!profRes.ok || !profRes.json || !profRes.json[0]) {
      return res.status(403).json({ error: 'No profile' });
    }
    const orgId = profRes.json[0].organization_id;
    if (profRes.json[0].status !== 'active') return res.status(403).json({ error: 'Inactive account' });

    // permission check — query the caller's roles/permissions directly
    let canManage = false;
    const q = await sb('/rest/v1/user_roles?user_id=eq.' + callerId + '&select=roles(role_permissions(permissions(code)))', { method: 'GET' });
    if (q.ok && Array.isArray(q.json)) {
      canManage = JSON.stringify(q.json).indexOf('users.manage') !== -1;
    }
    if (!canManage) return res.status(403).json({ error: 'You do not have permission to invite users' });

    // 4. Validate input
    const body = req.body && typeof req.body === 'object' ? req.body : JSON.parse(req.body || '{}');
    const email = String(body.email || '').trim().toLowerCase();
    const fullName = String(body.full_name || '').trim().slice(0, 120);
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return res.status(400).json({ error: 'Invalid email' });
    if (!fullName) return res.status(400).json({ error: 'Full name required' });

    // 5. Invite via Admin API (creates auth user + sends invite email)
    const invite = await sb('/auth/v1/invite', {
      method: 'POST',
      body: JSON.stringify({ email: email, data: { full_name: fullName } }),
    });
    if (!invite.ok) {
      const msg = invite.json && invite.json.msg ? invite.json.msg : 'Invite failed';
      if (/already/i.test(msg)) return res.status(409).json({ error: 'This email is already registered.' });
      return res.status(400).json({ error: msg });
    }

    const newUserId = (invite.json && invite.json.id)
      ? invite.json.id
      : (invite.json && invite.json.user ? invite.json.user.id : null);
    if (!newUserId) return res.status(500).json({ error: 'Invite created but no user id returned' });

    // 6. Create the profile row in caller's org (service role bypasses RLS safely here)
    const prof = await sb('/rest/v1/users', {
      method: 'POST',
      headers: { Prefer: 'return=minimal' },
      body: JSON.stringify({
        id: newUserId, organization_id: orgId, email: email,
        full_name: fullName, status: 'invited',
      }),
    });
    if (!prof.ok) {
      return res.status(500).json({ error: 'User invited but profile creation failed. Contact support.' });
    }

    // 7. Audit
    await sb('/rest/v1/audit_logs', {
      method: 'POST', headers: { Prefer: 'return=minimal' },
      body: JSON.stringify({
        organization_id: orgId, user_id: callerId, event: 'user_invited',
        entity_type: 'user', entity_id: newUserId,
        after_state: { email: email, full_name: fullName },
      }),
    });

    return res.status(200).json({ ok: true, user_id: newUserId });
  } catch (err) {
    // Never leak internals
    return res.status(500).json({ error: 'Invitation failed' });
  }
};
