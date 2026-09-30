import nodemailer, { Transporter } from 'nodemailer';
import { env } from '../../config/env';
import { logger } from '../../config/logger';
import { EmailProvider, SendEmailInput, SendEmailResult } from '../../types';

/**
 * Ethereal-based email provider (development / demo only).
 * Uses a configured Ethereal account, or auto-creates a test account when none is provided.
 * No real production email is ever delivered.
 */
export class EtherealEmailProvider implements EmailProvider {
  private transporter: Transporter | null = null;
  private initPromise: Promise<void> | null = null;
  private account: { user: string; host: string } | null = null;

  private async init(): Promise<void> {
    if (this.transporter) return;
    if (!this.initPromise) {
      this.initPromise = this.createTransporter();
    }
    await this.initPromise;
  }

  private async createTransporter(): Promise<void> {
    let user = env.ETHEREAL_USER;
    let pass = env.ETHEREAL_PASSWORD;
    let host = env.ETHEREAL_HOST;
    let port = env.ETHEREAL_PORT;

    if (!user || !pass) {
      const testAccount = await nodemailer.createTestAccount();
      user = testAccount.user;
      pass = testAccount.pass;
      host = testAccount.smtp.host;
      port = testAccount.smtp.port;
      logger.info({ user, host }, 'Auto-created Ethereal test account for email delivery');
    }

    this.transporter = nodemailer.createTransport({
      host,
      port,
      secure: port === 465,
      auth: { user, pass },
    });
    this.account = { user, host };
    logger.info({ host, user }, 'Ethereal email transporter ready');
  }

  getAccount() {
    return this.account;
  }

  async sendEmail(input: SendEmailInput): Promise<SendEmailResult> {
    await this.init();
    if (!this.transporter) throw new Error('Email transporter not initialized');

    const info = await this.transporter.sendMail({
      from: input.from || 'ReachInbox <no-reply@reachinbox.ai>',
      to: input.to,
      subject: input.subject,
      text: input.text || undefined,
      html: input.html || undefined,
      attachments: input.attachments?.length
        ? input.attachments.map((a) => ({
            filename: a.filename,
            path: a.path,
            contentType: a.contentType,
          }))
        : undefined,
    });

    const previewUrl = nodemailer.getTestMessageUrl(info) || undefined;
    return {
      messageId: info.messageId,
      previewUrl,
      accepted: info.accepted as (string | { address: string })[],
    };
  }
}

export const emailProvider: EmailProvider & { getAccount?: () => unknown } =
  new EtherealEmailProvider();
