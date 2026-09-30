import { z } from 'zod';

export const devLoginSchema = z.object({
  name: z.string().min(1).optional(),
  email: z.string().email().optional(),
});

export const supabaseLoginSchema = z.object({
  accessToken: z.string().min(1, 'accessToken is required'),
});

export const slackConnectSchema = z.object({
  webhookUrl: z.string().url('A valid Slack webhook URL is required'),
  teamName: z.string().optional(),
});
