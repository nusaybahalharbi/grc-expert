/**
 * GRC Expert — Auth Module
 * Loads BEFORE app.js. Guards the page, loads user context, exposes window.Auth.
 *
 * window.Auth = {
 *   ready: Promise      — resolves when context is loaded
 *   client              — supabase client
 *   user, organization  — profile & org rows
 *   roles: []           — role names
 *   permissions: Set    — permission codes
 *   can(code)           — permission check
 *   logout()
 * }
 */
(function (window) {
  'use strict';

  if (!window.supabase || !window.GRC_CONFIG) {
    console.error('[auth] Supabase SDK or config missing');
    return;
  }

  var client = window.supabase.createClient(
    window.GRC_CONFIG.SUPABASE_URL,
    window.GRC_CONFIG.SUPABASE_ANON_KEY,
    { auth: { persistSession: true, autoRefreshToken: true } }
  );

  var Auth = {
    client: client,
    user: null,
    organization: null,
    roles: [],
    permissions: new Set(),
    can: function (code) { return Auth.permissions.has(code); },
    logout: async function () {
      try {
        await client.from('activity_logs').insert({
          organization_id: Auth.organization ? Auth.organization.id : null,
          user_id: Auth.user ? Auth.user.id : null,
          action: 'logout', module: 'auth'
        });
      } catch (e) { }
      await client.auth.signOut();
      window.location.replace('/login.html');
    },
  };

  Auth.ready = (async function init() {
    // 1. Session check → redirect to login if absent
    var sess = await client.auth.getSession();
    if (!sess.data.session) {
      window.location.replace('/login.html');
      return new Promise(function () { }); // halt forever; redirect is happening
    }

    // 2. Complete a pending organization registration (signup with email verification)
    var pending = localStorage.getItem('grc_pending_org');
    if (pending) {
      try {
        var p = JSON.parse(pending);
        var reg = await client.rpc('register_organization', { org_name: p.org, user_full_name: p.name });
        if (!reg.error || (reg.error && reg.error.message.indexOf('already belongs') >= 0)) {
          localStorage.removeItem('grc_pending_org');
        } else {
          console.error('[auth] Pending registration failed:', reg.error.message);
        }
      } catch (e) { console.error('[auth] Pending registration error:', e); }
    }

    // 3. Load full context in one RPC
    var ctx = await client.rpc('get_my_context');
    if (ctx.error || !ctx.data || !ctx.data.user) {
      console.error('[auth] Context load failed:', ctx.error);
      // Authenticated but no profile and no pending org → cannot proceed
      await client.auth.signOut();
      window.location.replace('/login.html');
      return new Promise(function () { });
    }

    Auth.user = ctx.data.user;
    Auth.organization = ctx.data.organization;
    Auth.roles = ctx.data.roles || [];
    Auth.permissions = new Set(ctx.data.permissions || []);

    console.log('[auth] Signed in:', Auth.user.email, '| Org:', Auth.organization.name, '| Roles:', Auth.roles.join(', '));

    // 4. Log login activity (fire and forget)
    client.from('activity_logs').insert({
      organization_id: Auth.organization.id,
      user_id: Auth.user.id,
      action: 'login', module: 'auth'
    }).then(function () { });

    // 5. Auto-logout across tabs
    client.auth.onAuthStateChange(function (event) {
      if (event === 'SIGNED_OUT') window.location.replace('/login.html');
    });

    return Auth;
  })();

  window.Auth = Auth;
})(window);
