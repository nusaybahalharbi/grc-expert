/**
 * GRC Expert — Configuration
 *
 * Get these values from: Supabase Dashboard → your project →
 * Settings (gear icon) → API:
 *   - "Project URL"        → SUPABASE_URL
 *   - "anon public" key    → SUPABASE_ANON_KEY
 *
 * NOTE: The anon key is SAFE to expose in frontend code — it is designed
 * to be public. All data protection is enforced by Row Level Security
 * in the database (Migration 001). NEVER put the service_role key here.
 */
window.GRC_CONFIG = {
  SUPABASE_URL: 'https://YOUR-PROJECT-REF.supabase.co',
  SUPABASE_ANON_KEY: 'YOUR-ANON-PUBLIC-KEY',
};
