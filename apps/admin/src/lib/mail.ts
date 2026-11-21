// SPDX-License-Identifier: AGPL-3.0-only
import type { MailStatus } from '@/api/types';

/** "smtp.example.com, port 465, encrypted from the start". */
export function describeMailServer(server: NonNullable<MailStatus['server']>): string {
  return `${server.host}, port ${server.port}, ${
    server.secure ? 'encrypted from the start' : 'encryption starts after connecting'
  }`;
}

/** The lines that turn email on, as shown to an admin who has yet to set it up. */
export const ENV_EXAMPLE = `SMTP_URL=smtps://user:password@smtp.example.com:465
MAIL_FROM=Onyx Stream <no-reply@example.com>
SITE_URL=https://watch.example.com
SITE_NAME=Onyx Stream`;
