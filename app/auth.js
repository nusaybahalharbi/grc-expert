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
      console.log('[auth] Logout clicked');
      // 1. Best-effort activity log (max 1s, never blocks logout)
      try {
        if (Auth.organization && Auth.user) {
          await Promise.race([
            client.from('activity_logs').insert({
              organization_id: Auth.organization.id,
              user_id: Auth.user.id,
              action: 'logout', module: 'auth'
            }),
            new Promise(function (r) { setTimeout(r, 1000); })
          ]);
        }
      } catch (e) { }
      // 2. Sign out with a 2.5s cap — signOut can hang on flaky networks
      try {
        await Promise.race([
          client.auth.signOut({ scope: 'local' }),
          new Promise(function (r) { setTimeout(r, 2500); })
        ]);
      } catch (e) { console.warn('[auth] signOut error (continuing):', e && e.message); }
      // 3. Belt-and-braces: remove any Supabase auth tokens from storage
      try {
        Object.keys(localStorage).forEach(function (k) {
          if (k.indexOf('sb-') === 0 && k.indexOf('auth-token') !== -1) localStorage.removeItem(k);
        });
      } catch (e) { }
      // 4. Always redirect
      window.location.href = '/login.html';
    },
  };

  // Wire logout via event delegation — attached immediately at script load,
  // works even if the button is rendered later and independent of Auth.ready.
  document.addEventListener('click', function (e) {
    var btn = e.target && e.target.closest ? e.target.closest('#logoutBtn') : null;
    if (btn) { e.preventDefault(); Auth.logout(); }
  });

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

    // 3. Load full context in one RPC. Do not automatically sign out if this fails;
    // keep the session and surface the error so the user is not kicked out during
    // temporary RPC/RLS/network failures.
    var ctx = await client.rpc('get_my_context');
    if (ctx.error || !ctx.data || !ctx.data.user) {
      var msg = ctx.error ? ctx.error.message : 'No user context returned from get_my_context.';
      console.error('[auth] Context load failed:', ctx.error || msg);
      Auth.loadError = msg;
      throw new Error('Context load failed: ' + msg);
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
