import { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { env, isDevLoginEnabled } from '../config/env';
import { authService } from '../services/auth.service';
import { slackService } from '../integrations/slack/SlackService';
import { googleAuthProvider } from '../integrations/google/GoogleAuthProvider';
import { ok } from '../utils/response';
import { AppError } from '../utils/errors';

export const authController = {
  async devLogin(req: Request, res: Response, next: NextFunction) {
    try {
      // Dev sign-in issues a valid token for any email with no credential check.
      // Disabled in production; respond 404 so the endpoint is not advertised.
      if (!isDevLoginEnabled()) {
        throw new AppError(404, 'Route not found', 'NOT_FOUND');
      }
      const session = await authService.devLogin(req.body);
      return ok(res, session);
    } catch (err) {
      return next(err);
    }
  },

  async supabaseLogin(req: Request, res: Response, next: NextFunction) {
    try {
      const session = await authService.loginWithSupabaseToken(req.body.accessToken);
      return ok(res, session);
    } catch (err) {
      return next(err);
    }
  },

  async me(req: Request, res: Response, next: NextFunction) {
    try {
      const user = await authService.me(req.user!.id);
      return ok(res, user);
    } catch (err) {
      return next(err);
    }
  },

  logout(_req: Request, res: Response) {
    // Stateless JWT: client discards the token. (Supabase sign-out happens client-side.)
    return ok(res, { loggedOut: true });
  },

  authConfig(_req: Request, res: Response) {
    return ok(res, {
      supabaseConfigured: googleAuthProvider.isSupabaseReady(),
      googleOAuthConfigured: googleAuthProvider.isDirectOAuthReady(),
      slackOAuthConfigured: slackService.isOAuthReady(),
      devLoginEnabled: isDevLoginEnabled(),
    });
  },

  // Direct Google OAuth entry point (alternative to Supabase). Interface kept ready.
  googleStart(_req: Request, res: Response, next: NextFunction) {
    try {
      if (!googleAuthProvider.isDirectOAuthReady()) {
        throw new AppError(
          501,
          'Direct Google OAuth is not configured. Sign in via Supabase Google, or use dev login.',
          'NOT_CONFIGURED',
        );
      }
      // TODO (Phase 2): redirect to Google's consent screen.
      return res.status(501).json({ success: false, error: { message: 'Not implemented' } });
    } catch (err) {
      return next(err);
    }
  },

  // ---- Slack ----
  async slackStatus(req: Request, res: Response, next: NextFunction) {
    try {
      return ok(res, await slackService.getStatus(req.user!.id));
    } catch (err) {
      return next(err);
    }
  },

  async slackConnect(req: Request, res: Response, next: NextFunction) {
    try {
      await slackService.connectWithWebhook(req.user!.id, req.body.webhookUrl, req.body.teamName);
      return ok(res, await slackService.getStatus(req.user!.id));
    } catch (err) {
      return next(err);
    }
  },

  async slackDisconnect(req: Request, res: Response, next: NextFunction) {
    try {
      await slackService.disconnect(req.user!.id);
      return ok(res, { connected: false });
    } catch (err) {
      return next(err);
    }
  },

  // Start real Slack OAuth: returns the authorize URL; user identity is carried in `state`.
  slackOAuthStart(req: Request, res: Response, next: NextFunction) {
    try {
      if (!slackService.isOAuthReady()) {
        throw new AppError(
          501,
          'Slack OAuth is not configured. Add SLACK_CLIENT_ID/SECRET, or connect via webhook.',
          'NOT_CONFIGURED',
        );
      }
      const state = jwt.sign(
        { sub: req.user!.id, purpose: 'slack_oauth' },
        env.JWT_SECRET,
        { expiresIn: '10m' },
      );
      return ok(res, { url: slackService.buildAuthorizeUrl(state) });
    } catch (err) {
      return next(err);
    }
  },

  // Slack OAuth redirect target (public: no auth header on a browser redirect).
  async slackOAuthCallback(req: Request, res: Response) {
    const base = env.APP_PUBLIC_URL || '';
    const back = (status: string) => res.redirect(`${base}/dashboard/settings?slack=${status}`);
    const { code, state, error } = req.query;
    if (error || !code || !state) return back('error');
    try {
      const payload = jwt.verify(String(state), env.JWT_SECRET) as {
        sub: string;
        purpose?: string;
      };
      if (payload.purpose !== 'slack_oauth') return back('error');
      await slackService.exchangeCodeAndStore(String(code), payload.sub);
      return back('connected');
    } catch (_e) {
      return back('error');
    }
  },
};
