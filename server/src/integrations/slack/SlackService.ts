import { prisma } from '../../config/prisma';
import { logger } from '../../config/logger';
import { isSlackOAuthConfigured, env } from '../../config/env';

export interface RateLimitNotification {
  senderId: string;
  senderEmail?: string;
  limit: number;
  nextWindowStart: Date;
}

/**
 * Slack integration abstraction. Kept isolated from email business logic.
 * Phase 1: supports a manual Incoming Webhook connection (works without a Slack app).
 * Phase 3 (TODO): full Slack OAuth (connect/disconnect via SLACK_CLIENT_ID/SECRET/REDIRECT).
 */
export class SlackService {
  isOAuthReady(): boolean {
    return isSlackOAuthConfigured();
  }

  async getStatus(userId: string) {
    const integration = await prisma.slackIntegration.findUnique({ where: { userId } });
    return {
      connected: Boolean(integration),
      teamName: integration?.teamName ?? null,
      oauthConfigured: this.isOAuthReady(),
    };
  }

  async connectWithWebhook(userId: string, webhookUrl: string, teamName?: string) {
    return prisma.slackIntegration.upsert({
      where: { userId },
      create: { userId, webhookUrl, teamName: teamName ?? 'Slack Workspace' },
      update: { webhookUrl, teamName: teamName ?? 'Slack Workspace' },
    });
  }

  redirectUri(): string {
    if (env.SLACK_REDIRECT_URI) return env.SLACK_REDIRECT_URI;
    return `${env.APP_PUBLIC_URL}/api/auth/slack/oauth/callback`;
  }

  /** Build the Slack OAuth v2 authorize URL. `state` carries the signed user identity. */
  buildAuthorizeUrl(state: string): string {
    const scope = 'incoming-webhook';
    const params = new URLSearchParams({
      client_id: env.SLACK_CLIENT_ID,
      scope,
      redirect_uri: this.redirectUri(),
      state,
    });
    return `https://slack.com/oauth/v2/authorize?${params.toString()}`;
  }

  /** Exchange the OAuth code for a token + incoming webhook, and persist per user. */
  async exchangeCodeAndStore(code: string, userId: string) {
    const params = new URLSearchParams({
      code,
      client_id: env.SLACK_CLIENT_ID,
      client_secret: env.SLACK_CLIENT_SECRET,
      redirect_uri: this.redirectUri(),
    });
    const res = await fetch('https://slack.com/api/oauth.v2.access', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString(),
    });
    const data = (await res.json()) as {
      ok: boolean;
      error?: string;
      access_token?: string;
      team?: { name?: string };
      incoming_webhook?: { url?: string; channel?: string };
    };
    if (!data.ok) {
      throw new Error(`Slack OAuth failed: ${data.error || 'unknown_error'}`);
    }
    const webhookUrl = data.incoming_webhook?.url ?? null;
    const teamName = data.team?.name ?? 'Slack Workspace';
    const accessToken = data.access_token ?? null;
    await prisma.slackIntegration.upsert({
      where: { userId },
      create: { userId, webhookUrl, teamName, accessToken },
      update: { webhookUrl, teamName, accessToken },
    });
    logger.info({ userId, teamName }, 'Slack connected via OAuth');
    return { teamName };
  }

  async disconnect(userId: string) {
    await prisma.slackIntegration.deleteMany({ where: { userId } });
    return { connected: false };
  }

  async sendRateLimitNotification(userId: string, payload: RateLimitNotification): Promise<void> {
    const integration = await prisma.slackIntegration.findUnique({ where: { userId } });
    if (!integration?.webhookUrl) {
      logger.debug({ userId }, 'Slack not connected; skipping rate-limit notification');
      return;
    }

    const text = `:hourglass_flowing_sand: *ReachInbox rate limit reached*\nSender \`${
      payload.senderEmail || payload.senderId
    }\` hit the hourly cap of *${payload.limit}* emails. Remaining emails were rescheduled to *${payload.nextWindowStart.toISOString()}*.`;

    try {
      const res = await fetch(integration.webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      });
      if (!res.ok) {
        logger.warn({ status: res.status }, 'Slack webhook responded with non-OK status');
      } else {
        logger.info({ userId }, 'Slack rate-limit notification sent');
      }
    } catch (err) {
      logger.warn({ err: String(err) }, 'Failed to send Slack notification (non-fatal)');
    }
  }
}

export const slackService = new SlackService();
