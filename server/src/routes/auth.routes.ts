import { Router } from 'express';
import { authController } from '../controllers/auth.controller';
import { requireAuth } from '../middleware/auth.middleware';
import { validate } from '../middleware/validate.middleware';
import {
  devLoginSchema,
  slackConnectSchema,
  supabaseLoginSchema,
} from '../validators/auth.validator';

const router = Router();

router.get('/config', authController.authConfig);
router.post('/dev-login', validate(devLoginSchema), authController.devLogin);
router.post('/supabase', validate(supabaseLoginSchema), authController.supabaseLogin);
router.get('/google', authController.googleStart);
router.get('/me', requireAuth, authController.me);
router.post('/logout', requireAuth, authController.logout);

// Slack integration
router.get('/slack/status', requireAuth, authController.slackStatus);
router.post('/slack/connect', requireAuth, validate(slackConnectSchema), authController.slackConnect);
router.post('/slack/disconnect', requireAuth, authController.slackDisconnect);
router.get('/slack/oauth/start', requireAuth, authController.slackOAuthStart);
router.get('/slack/oauth/callback', authController.slackOAuthCallback);

export default router;
