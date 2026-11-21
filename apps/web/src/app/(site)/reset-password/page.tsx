// SPDX-License-Identifier: AGPL-3.0-only
import type { Metadata } from 'next';
import { ResetPasswordScreen } from '@/components/mail-screens';

export const metadata: Metadata = {
  title: 'Set a new password',
  robots: { index: false, follow: false },
  // The address of this page can carry a key to an account. No other site learns it.
  referrer: 'no-referrer',
};

export default function Page() {
  return <ResetPasswordScreen />;
}
