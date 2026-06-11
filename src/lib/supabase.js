import { createClient } from '@supabase/supabase-js';

// Read build-time env (Vite bakes these into the bundle).
const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

// The app runs in two modes:
//   - localStorage mode  (no env vars)  → works offline, no login
//   - Supabase mode       (env present) → real persistence + auth
export const isSupabaseConfigured = Boolean(url && anonKey);

export const supabase = isSupabaseConfigured
  ? createClient(url, anonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: false,
      },
    })
  : null;
