import { createClient } from "@supabase/supabase-js";

/**
 * Supabase browser client.
 *
 * Google sign-in runs through Supabase Auth: the browser is redirected to Google
 * via Supabase, and Supabase returns a session we exchange for our own API token
 * (POST /api/auth/supabase).
 *
 * `supabase` is null when the project has not been configured, so every caller
 * must fall back to dev sign-in rather than assume OAuth is available.
 */
const url = process.env.REACT_APP_SUPABASE_URL;
const anonKey = process.env.REACT_APP_SUPABASE_ANON_KEY;

export const supabase =
  url && anonKey
    ? createClient(url, anonKey, {
        auth: {
          // Parse the session Supabase appends to the URL on OAuth return.
          detectSessionInUrl: true,
          persistSession: true,
          autoRefreshToken: true,
        },
      })
    : null;

export const isSupabaseEnabled = Boolean(supabase);
