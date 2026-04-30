import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { render } from '@react-email/render';
import { VerifyEmail, PasswordResetEmail } from '@aiagg/email-templates';
import { Resend } from 'resend';
import * as nodemailer from 'nodemailer';
import type { MailConfig } from '../../config/configuration';

interface SendArgs {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private readonly mail: MailConfig;
  private readonly resend: Resend | null;

  constructor(private readonly config: ConfigService) {
    this.mail = this.config.get<MailConfig>('mail') ?? {
      resendFrom: 'onboarding@example.com',
      smtpHost: 'localhost',
      smtpPort: 1025,
      smtpFrom: 'onboarding@localhost',
    };
    this.resend = this.mail.resendApiKey ? new Resend(this.mail.resendApiKey) : null;
  }

  /**
   * TODO: move to BullMQ in Чанк 4 — for now we send synchronously so the
   * verify-email flow works without the worker app being online.
   */
  async sendVerificationEmail(to: string, name: string, verifyUrl: string): Promise<void> {
    const html = await render(VerifyEmail({ name, verifyUrl }));
    const text = `Hi ${name}, please verify your email: ${verifyUrl}`;
    await this.send({
      to,
      subject: 'Verify your email — Aigenway',
      html,
      text,
    });
  }

  async sendPasswordResetEmail(
    to: string,
    name: string,
    resetUrl: string,
    ttlHours = 1,
  ): Promise<void> {
    const html = await render(PasswordResetEmail({ name, resetUrl, ttlHours }));
    const text = `Hi ${name}, reset your password: ${resetUrl} (link expires in ${ttlHours}h)`;
    await this.send({
      to,
      subject: 'Reset your password — Aigenway',
      html,
      text,
    });
  }

  async send(args: SendArgs): Promise<void> {
    if (this.resend) {
      const { error } = await this.resend.emails.send({
        from: this.mail.resendFrom,
        to: args.to,
        subject: args.subject,
        html: args.html,
        text: args.text,
      });
      if (error) {
        this.logger.error(`Resend send failed: ${error.message}`);
        throw new Error(`Email send failed: ${error.message}`);
      }
      this.logger.log(`Sent email via Resend to ${args.to}`);
      return;
    }

    const transporter = nodemailer.createTransport({
      host: this.mail.smtpHost,
      port: this.mail.smtpPort,
      secure: false,
      ignoreTLS: true,
    });
    await transporter.sendMail({
      from: this.mail.smtpFrom,
      to: args.to,
      subject: args.subject,
      html: args.html,
      text: args.text,
    });
    this.logger.log(`Sent email via SMTP to ${args.to} (${this.mail.smtpHost}:${this.mail.smtpPort})`);
  }
}
