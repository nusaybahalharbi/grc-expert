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
  SUPABASE_URL: 'https://rimyhaexegiagvunqmuh.supabase.co',
  SUPABASE_ANON_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJpbXloYWV4ZWdpYWd2dW5xbXVoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODMyNjI1OTAsImV4cCI6MjA5ODgzODU5MH0.Z6MeKJURCeKTVUcDLzJyGDBJAQIKVRkp_viE0wbN6oI',
};
