import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { env, isGoogleConfigured, isSupabaseConfigured } from '../../config/env';

/**
 * Google auth foundation.
 *
 * Per the project plan, Google sign-in is handled through Supabase Auth
 * (the frontend calls supabase.auth.signInWithOAuth). The backend verifies the
 * resulting Supabase access token here and maps it to a local user.
 *
 * Direct Express Google OAuth routes (GET /api/auth/google[/callback]) are kept
 * as an interface for an alternative flow; enable by providing GOOGLE_CLIENT_ID/SECRET.
 */
class GoogleAuthProvider {
  private supabase: SupabaseClient | null = null;

  isSupabaseReady(): boolean {
    return isSupabaseConfigured();
  }

  isDirectOAuthReady(): boolean {
    return isGoogleConfigured();
  }

  private client(): SupabaseClient {
    if (!this.supabase) {
      this.supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
        auth: { autoRefreshToken: false, persistSession: false },
      });
    }
    return this.supabase;
  }

  /** Verify a Supabase-issued access token. Returns the identity or null. */
  async verifySupabaseToken(
    token: string,
  ): Promise<{ email: string; name: string; avatarUrl?: string; googleId?: string } | null> {
    if (!this.isSupabaseReady()) return null;
    const { data, error } = await this.client().auth.getUser(token);
    if (error || !data.user?.email) return null;
    const meta = (data.user.user_metadata || {}) as Record<string, string>;
    return {
      email: data.user.email,
      name: meta.full_name || meta.name || data.user.email.split('@')[0],
      avatarUrl: meta.avatar_url || meta.picture,
      googleId: data.user.id,
    };
  }
}

export const googleAuthProvider = new GoogleAuthProvider();
