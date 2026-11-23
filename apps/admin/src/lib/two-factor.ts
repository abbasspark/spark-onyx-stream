// SPDX-License-Identifier: AGPL-3.0-only

/** The secret in groups of four, as it is easiest to type into an app. */
export function formatSecret(secret: string): string {
  return secret.replace(/(.{4})(?=.)/g, '$1 ');
}

/** What was typed, as a code is sent: without spaces around it. */
export function tidyCode(raw: string): string {
  return raw.trim();
}

/** Whether what was typed can be a code from an app: six digits, spaces allowed. */
export function isAppCode(raw: string): boolean {
  return /^\d{6}$/.test(raw.replace(/\s/g, ''));
}

/** Whether what was typed can be a recovery code: twelve letters and digits, however grouped. */
export function isRecoveryCode(raw: string): boolean {
  return /^[A-Za-z0-9]{12}$/.test(raw.replace(/[\s-]/g, ''));
}

/** Whether there is enough to send as a second step. */
export function isCompleteCode(raw: string, kind: 'app' | 'recovery'): boolean {
  return kind === 'app' ? isAppCode(raw) : isRecoveryCode(raw);
}

/**
 * The recovery codes as a text file to keep: what they are, whose, from when,
 * and one code per line.
 */
export function recoveryCodesFile(
  codes: readonly string[],
  account: { site: string; email: string },
  now: Date = new Date(),
): string {
  return [
    `${account.site}: recovery codes for ${account.email}`,
    `Made on ${now.toISOString().slice(0, 10)}`,
    '',
    'Each code signs you in once, in place of the code from your authenticator app.',
    'Keep them where you keep things that must not be lost, and not on the phone itself.',
    '',
    ...codes,
    '',
  ].join('\n');
}

/** A word on how many recovery codes are left, when it is time to act. Null: enough. */
export function recoveryCodesWarning(left: number): string | null {
  if (left === 0) {
    return 'You have no recovery codes left. Without your phone you could not sign in. Make new ones now.';
  }
  if (left <= 3) {
    return `You have ${left} recovery ${left === 1 ? 'code' : 'codes'} left. Make new ones before they run out.`;
  }
  return null;
}
