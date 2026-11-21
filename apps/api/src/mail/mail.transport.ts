// SPDX-License-Identifier: AGPL-3.0-only
import { createTransport, type Transporter } from 'nodemailer';

export interface MailMessage {
  to: string;
  subject: string;
  /** For mail programs that show no HTML, and for people who prefer it. */
  text: string;
  html: string;
}

/** The way out for an email. One implementation talks SMTP, tests keep a list. */
export interface MailTransport {
  /** @throws Error with the mail server's reason when it does not take the message. */
  send(from: string, message: MailMessage): Promise<void>;
}

export const MAIL_TRANSPORT = Symbol('MAIL_TRANSPORT');

/** How long to wait for a mail server before giving up on one attempt. */
const TIMEOUT_MS = 15_000;

/** Sends through the mail server named in SMTP_URL. */
export class SmtpTransport implements MailTransport {
  private readonly transporter: Transporter;

  constructor(smtpUrl: string) {
    this.transporter = createTransport(smtpUrl, {
      connectionTimeout: TIMEOUT_MS,
      greetingTimeout: TIMEOUT_MS,
      socketTimeout: TIMEOUT_MS,
    });
  }

  async send(from: string, message: MailMessage): Promise<void> {
    await this.transporter.sendMail({ from, ...message });
  }
}

/** Used when email is off. Nothing should reach it: senders ask first. */
export class NoTransport implements MailTransport {
  send(): Promise<void> {
    return Promise.reject(new Error('Email is not set up'));
  }
}

/** Keeps messages in a list. For tests. */
export class MemoryTransport implements MailTransport {
  readonly outbox: (MailMessage & { from: string })[] = [];
  /** Set to make the next sends fail, as a mail server that is down would. */
  failWith: string | null = null;

  send(from: string, message: MailMessage): Promise<void> {
    if (this.failWith) {
      return Promise.reject(new Error(this.failWith));
    }
    this.outbox.push({ from, ...message });
    return Promise.resolve();
  }

  clear(): void {
    this.outbox.length = 0;
    this.failWith = null;
  }
}

/**
 * What can be shown of the mail server without giving away the password:
 * host, port and whether the connection is encrypted from the start.
 */
export function describeSmtpUrl(smtpUrl: string): {
  host: string;
  port: number;
  secure: boolean;
  user: string | null;
} {
  const url = new URL(smtpUrl);
  const secure = url.protocol === 'smtps:';
  return {
    host: url.hostname,
    port: url.port ? Number(url.port) : secure ? 465 : 587,
    secure,
    user: url.username ? decodeURIComponent(url.username) : null,
  };
}
