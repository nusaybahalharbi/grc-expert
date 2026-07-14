/**
 * GRC Expert — Configuration Diagnostic
 * GET /api/health   →  place at  api/health.js
 *
 * Reports WHICH required environment variables are present on the server,
 * WITHOUT ever exposing their values. Use this to confirm your Vercel
 * environment is configured before testing Invite User.
 *
 * Expected healthy response:
 *   { "ok": true, "env": { "SUPABASE_URL": true,
 *     "SUPABASE_SERVICE_ROLE_KEY": true, "APP_ORIGIN": true } }
 *
 * If any value is false, add it in:
 *   Vercel → Project → Settings → Environment Variables → (Production)
 * then REDEPLOY (env changes require a new deployment to take effect).
 */
module.exports = function handler(req, res) {
  var env = {
    SUPABASE_URL: !!process.env.SUPABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
    APP_ORIGIN: !!process.env.APP_ORIGIN,
    // GEMINI_API_KEY is used by the AI chat endpoint; included for completeness
    GEMINI_API_KEY: !!process.env.GEMINI_API_KEY,
  };
  var allRequired = env.SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY;
  res.status(200).json({
    ok: allRequired,
    env: env,
    note: allRequired
      ? 'Required env vars present. Invite User should work.'
      : 'MISSING required env vars. Add them in Vercel → Settings → Environment Variables, then redeploy.',
  });
};
