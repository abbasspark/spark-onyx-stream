// SPDX-License-Identifier: AGPL-3.0-only
import { describe, expect, it } from 'vitest';
import {
  describeLifetime,
  escapeHtml,
  passwordChangedMail,
  passwordResetMail,
  testMail,
  verificationMail,
} from './mail.templates.js';
import { describeSmtpUrl } from './mail.transport.js';

const LINK = {
  siteName: 'Night Cinema',
  displayName: 'Anna',
  url: 'https://watch.example.com/reset-password#token=onyx_mail_abc',
  validMinutes: 60,
};

describe('describeLifetime', () => {
  it('uses the largest unit that fits', () => {
    expect(describeLifetime(1)).toBe('1 minute');
    expect(describeLifetime(45)).toBe('45 minutes');
    expect(describeLifetime(60)).toBe('1 hour');
    expect(describeLifetime(24 * 60)).toBe('24 hours');
    expect(describeLifetime(3 * 24 * 60)).toBe('3 days');
  });
});

describe('the emails', () => {
  it('carry the link in the text and in the HTML', () => {
    const mail = passwordResetMail(LINK);
    expect(mail.subject).toBe('Set a new password for Night Cinema');
    expect(mail.text).toContain(LINK.url);
    expect(mail.text).toContain('Hello Anna,');
    expect(mail.text).toContain('The link works once, for 1 hour.');
    expect(mail.html).toContain(`href="${LINK.url}"`);
    expect(mail.html).toContain('Set a new password</a>');
  });

  it('say what to do when the reader did not ask for them', () => {
    expect(passwordResetMail(LINK).text).toContain(
      'If you did not ask for this, ignore this email',
    );
    expect(verificationMail({ ...LINK, validMinutes: 4320 }).text).toContain(
      'If you did not create an account on Night Cinema, ignore this email.',
    );
    expect(passwordChangedMail(LINK).text).toContain('If this was not you');
  });

  it('do not let a name become markup or a second header line', () => {
    const mail = verificationMail({
      ...LINK,
      siteName: 'Night\r\nBcc: someone@example.com',
      displayName: '<img src=x onerror=alert(1)>',
    });
    expect(mail.subject).not.toMatch(/[\r\n]/);
    expect(mail.html).not.toContain('<img');
    expect(mail.html).toContain('&lt;img src=x onerror=alert(1)&gt;');
  });

  it('include a test email that names who sent it', () => {
    const mail = testMail({ siteName: 'Night Cinema', sentBy: 'Abbas' });
    expect(mail.subject).toBe('Test email from Night Cinema');
    expect(mail.text).toContain('sent by Abbas');
  });
});

describe('escapeHtml', () => {
  it('escapes what HTML gives a meaning', () => {
    expect(escapeHtml(`<a href="x">Tom & 'Jerry'</a>`)).toBe(
      '&lt;a href=&quot;x&quot;&gt;Tom &amp; &#39;Jerry&#39;&lt;/a&gt;',
    );
  });
});

describe('describeSmtpUrl', () => {
  it('shows host, port and user, and never the password', () => {
    const shown = describeSmtpUrl('smtps://mailer%40example.com:p%40ss@smtp.example.com');
    expect(shown).toEqual({
      host: 'smtp.example.com',
      port: 465,
      secure: true,
      user: 'mailer@example.com',
    });
    expect(describeSmtpUrl('smtp://smtp.example.com')).toEqual({
      host: 'smtp.example.com',
      port: 587,
      secure: false,
      user: null,
    });
    expect(describeSmtpUrl('smtp://localhost:1025').port).toBe(1025);
  });
});
