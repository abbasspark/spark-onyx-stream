// SPDX-License-Identifier: AGPL-3.0-only
import type { MailMessage } from './mail.transport.js';

type Content = Omit<MailMessage, 'to'>;

const ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

/** Makes text safe to place in HTML. Names of sites and people are written by people. */
export function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (character) => ESCAPES[character] as string);
}

/** Names go into a subject line, which must stay one line. */
function oneLine(text: string): string {
  return text.replace(/[\r\n]+/g, ' ').trim();
}

interface Layout {
  siteName: string;
  heading: string;
  /** Paragraphs before the button. */
  intro: string[];
  action?: { label: string; url: string };
  /** Paragraphs after the button, in smaller type. */
  notes: string[];
}

/**
 * One layout for every email: plain, readable without pictures, and the same
 * in the text version. Styles are inline because mail programs drop the rest.
 */
function layout({ siteName, heading, intro, action, notes }: Layout): {
  text: string;
  html: string;
} {
  const text = [
    heading,
    '',
    ...intro.flatMap((paragraph) => [paragraph, '']),
    ...(action ? [`${action.label}:`, action.url, ''] : []),
    ...notes.flatMap((paragraph) => [paragraph, '']),
    `— ${siteName}`,
    '',
  ].join('\n');

  const paragraph = (content: string, style: string) =>
    `<p style="margin:0 0 16px;${style}">${escapeHtml(content)}</p>`;
  const html = `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${escapeHtml(heading)}</title></head>
<body style="margin:0;padding:0;background:#f3f1ec;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f3f1ec;">
<tr><td align="center" style="padding:32px 16px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border-radius:6px;">
<tr><td style="padding:28px 32px 0;font-family:-apple-system,'Segoe UI',Helvetica,Arial,sans-serif;font-size:14px;font-weight:600;color:#6b6861;">${escapeHtml(siteName)}</td></tr>
<tr><td style="padding:12px 32px 28px;font-family:-apple-system,'Segoe UI',Helvetica,Arial,sans-serif;color:#141414;">
<h1 style="margin:0 0 20px;font-size:22px;line-height:1.3;font-weight:700;">${escapeHtml(heading)}</h1>
${intro.map((content) => paragraph(content, 'font-size:16px;line-height:1.55;')).join('\n')}
${
  action
    ? `<p style="margin:24px 0;"><a href="${escapeHtml(action.url)}" style="display:inline-block;background:#141414;color:#ffffff;text-decoration:none;font-size:16px;font-weight:600;padding:12px 22px;border-radius:4px;">${escapeHtml(action.label)}</a></p>
<p style="margin:0 0 16px;font-size:13px;line-height:1.5;color:#6b6861;">If the button does not work, copy this address into your browser:<br><a href="${escapeHtml(action.url)}" style="color:#6b6861;word-break:break-all;">${escapeHtml(action.url)}</a></p>`
    : ''
}
${notes.map((content) => paragraph(content, 'font-size:13px;line-height:1.5;color:#6b6861;')).join('\n')}
</td></tr>
</table>
</td></tr>
</table>
</body>
</html>
`;
  return { text, html };
}

/** "1 hour", "3 days": how long a link works, in words. */
export function describeLifetime(minutes: number): string {
  const [amount, unit] =
    minutes >= 2880
      ? [Math.round(minutes / 1440), 'day']
      : minutes >= 60
        ? [Math.round(minutes / 60), 'hour']
        : [minutes, 'minute'];
  return `${amount} ${unit}${amount === 1 ? '' : 's'}`;
}

export interface LinkMail {
  siteName: string;
  displayName: string;
  url: string;
  validMinutes: number;
}

export function passwordResetMail({ siteName, displayName, url, validMinutes }: LinkMail): Content {
  return {
    subject: oneLine(`Set a new password for ${siteName}`),
    ...layout({
      siteName,
      heading: 'Set a new password',
      intro: [
        `Hello ${displayName},`,
        `someone asked to set a new password for your account on ${siteName}. If that was you, choose one here.`,
      ],
      action: { label: 'Set a new password', url },
      notes: [
        `The link works once, for ${describeLifetime(validMinutes)}.`,
        'If you did not ask for this, ignore this email. Your password stays as it is.',
      ],
    }),
  };
}

export function verificationMail({ siteName, displayName, url, validMinutes }: LinkMail): Content {
  return {
    subject: oneLine(`Confirm your email address for ${siteName}`),
    ...layout({
      siteName,
      heading: 'Confirm your email address',
      intro: [
        `Hello ${displayName},`,
        `confirm that this address belongs to your account on ${siteName}.`,
      ],
      action: { label: 'Confirm my email address', url },
      notes: [
        `The link works once, for ${describeLifetime(validMinutes)}.`,
        `If you did not create an account on ${siteName}, ignore this email.`,
      ],
    }),
  };
}

/** Sent to the new address a viewer wants to use. Nothing changes until the link is opened. */
export function emailChangeMail({ siteName, displayName, url, validMinutes }: LinkMail): Content {
  return {
    subject: oneLine(`Confirm your new email address for ${siteName}`),
    ...layout({
      siteName,
      heading: 'Confirm your new email address',
      intro: [
        `Hello ${displayName},`,
        `you asked to use this address for your account on ${siteName}. Confirm that it is yours, and it replaces the old one.`,
      ],
      action: { label: 'Use this email address', url },
      notes: [
        `The link works once, for ${describeLifetime(validMinutes)}. Until you open it, the old address stays.`,
        'If you did not ask for this, ignore this email.',
      ],
    }),
  };
}

/** Sent to the address an account had, once it was replaced. */
export function emailChangedMail(options: {
  siteName: string;
  displayName: string;
  newEmail: string;
}): Content {
  const { siteName, displayName, newEmail } = options;
  return {
    subject: oneLine(`The email address of your ${siteName} account was changed`),
    ...layout({
      siteName,
      heading: 'Your email address was changed',
      intro: [
        `Hello ${displayName},`,
        `the email address of your account on ${siteName} was changed to ${newEmail}. From now on you sign in with the new address, and mail goes there.`,
      ],
      notes: [
        'If this was not you, the account may be in someone else’s hands. Contact the people who run the site right away.',
      ],
    }),
  };
}

/** Sent when the payment for a subscription failed and Stripe is trying again. */
export function paymentFailedMail(options: {
  siteName: string;
  displayName: string;
  /** Where the viewer puts the payment method right. Empty when the site has no address. */
  accountUrl: string;
}): Content {
  const { siteName, displayName, accountUrl } = options;
  return {
    subject: oneLine(`Your payment to ${siteName} did not go through`),
    ...layout({
      siteName,
      heading: 'Your payment did not go through',
      intro: [
        `Hello ${displayName},`,
        `the last payment for your subscription to ${siteName} failed. Your access stays open while the payment is tried again, but it ends if it keeps failing.`,
        'The usual cause is a card that ran out or has no funds left. Please check the payment method.',
      ],
      ...(accountUrl ? { action: { label: 'Open your account', url: accountUrl } } : {}),
      notes: ['If you have already put it right, you can ignore this message.'],
    }),
  };
}

export function passwordChangedMail(options: { siteName: string; displayName: string }): Content {
  const { siteName, displayName } = options;
  return {
    subject: oneLine(`Your password for ${siteName} was changed`),
    ...layout({
      siteName,
      heading: 'Your password was changed',
      intro: [
        `Hello ${displayName},`,
        `the password of your account on ${siteName} was just changed with a link from an email. You are signed out on all devices and can sign in with the new password.`,
      ],
      notes: [
        'If this was not you, set a new password right away with "Forgot your password?" on the sign-in page.',
      ],
    }),
  };
}

export function testMail(options: { siteName: string; sentBy: string }): Content {
  const { siteName, sentBy } = options;
  return {
    subject: oneLine(`Test email from ${siteName}`),
    ...layout({
      siteName,
      heading: 'Email works',
      intro: [
        `This is a test from the admin panel of ${siteName}, sent by ${sentBy}.`,
        'Viewers can now confirm their email address and set a new password by email.',
      ],
      notes: [],
    }),
  };
}

/**
 * Tells the owners that something is wrong with the installation, or that
 * something that was wrong is solved.
 */
export function diagnosticsMail(options: {
  siteName: string;
  /** What is wrong, in the words of the diagnostics page. */
  problems: { title: string; summary: string; hint?: string }[];
  /** Titles of problems that were written about before and are gone. */
  solved: string[];
  /** Address of the diagnostics page. Empty when the address of the site is not known. */
  panelUrl: string;
}): Content {
  const { siteName, problems, solved, panelUrl } = options;
  const count = problems.length;
  const heading =
    count === 0
      ? 'Solved'
      : count === 1
        ? (problems[0] as { title: string }).title
        : `${count} things need your attention`;
  const subject =
    count === 0
      ? `Solved on ${siteName}: ${solved.join(', ')}`
      : count === 1
        ? `Problem on ${siteName}: ${(problems[0] as { title: string }).title}`
        : `${count} problems on ${siteName}`;
  return {
    subject: oneLine(subject),
    ...layout({
      siteName,
      heading,
      intro: [
        ...problems.flatMap((problem) => [
          count === 1 ? problem.summary : `${problem.title}: ${problem.summary}`,
          ...(problem.hint ? [problem.hint] : []),
        ]),
        ...(solved.length > 0
          ? [`${count === 0 ? 'No longer a problem' : 'Solved meanwhile'}: ${solved.join(', ')}.`]
          : []),
      ],
      action: panelUrl ? { label: 'Open diagnostics', url: panelUrl } : undefined,
      notes: [
        'You get this because you are an owner of the installation. A problem is written about once, when it appears, and once more when it is gone.',
        'Alerts are switched off on the diagnostics page of the admin panel.',
      ],
    }),
  };
}
