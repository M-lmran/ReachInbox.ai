import jwt from 'jsonwebtoken';
import { env } from '../config/env';
import { userRepository } from '../repositories/user.repository';
import { googleAuthProvider } from '../integrations/google/GoogleAuthProvider';
import { AuthUser } from '../types';
import { Unauthorized } from '../utils/errors';

interface JwtPayload {
  sub: string;
}

function signToken(userId: string): string {
  return jwt.sign({ sub: userId } as JwtPayload, env.JWT_SECRET, { expiresIn: '7d' });
}

function toAuthUser(u: {
  id: string;
  name: string;
  email: string;
  avatarUrl: string | null;
}): AuthUser {
  return { id: u.id, name: u.name, email: u.email, avatarUrl: u.avatarUrl };
}

export const authService = {
  /** Dev sign-in fallback: usable until Google/Supabase credentials are added. */
  async devLogin(input?: { name?: string; email?: string }) {
    const email = (input?.email || 'vishnu@reachinbox.ai').toLowerCase();
    const name = input?.name || 'Vishnu Prasad';
    const user = await userRepository.upsertByEmail({
      email,
      name,
      avatarUrl: `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(name)}`,
      // Never let the dev placeholder replace a real provider picture.
      preserveAvatarOnUpdate: true,
    });
    await userRepository.ensureDefaultSender(user.id, user.name, user.email);
    return { token: signToken(user.id), user: toAuthUser(user) };
  },

  /** Exchange a Supabase (Google) access token for a local session token. */
  async loginWithSupabaseToken(supabaseToken: string) {
    const identity = await googleAuthProvider.verifySupabaseToken(supabaseToken);
    if (!identity) throw Unauthorized('Invalid Supabase token or Supabase not configured');
    const user = await userRepository.upsertByEmail({
      email: identity.email.toLowerCase(),
      name: identity.name,
      avatarUrl: identity.avatarUrl ?? null,
      googleId: identity.googleId ?? null,
    });
    await userRepository.ensureDefaultSender(user.id, user.name, user.email);
    return { token: signToken(user.id), user: toAuthUser(user) };
  },

  async me(userId: string): Promise<AuthUser> {
    const user = await userRepository.findById(userId);
    if (!user) throw Unauthorized('User no longer exists');
    return toAuthUser(user);
  },

  /** Resolve a bearer token to a user. Tries local JWT first, then Supabase. */
  async resolveToken(token: string): Promise<AuthUser | null> {
    try {
      const payload = jwt.verify(token, env.JWT_SECRET) as JwtPayload;
      const user = await userRepository.findById(payload.sub);
      return user ? toAuthUser(user) : null;
    } catch {
      // Not a local JWT; try Supabase if configured.
      if (googleAuthProvider.isSupabaseReady()) {
        const session = await this.loginWithSupabaseToken(token).catch(() => null);
        return session?.user ?? null;
      }
      return null;
    }
  },
};
