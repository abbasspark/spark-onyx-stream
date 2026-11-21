// SPDX-License-Identifier: AGPL-3.0-only
import type { Metadata } from 'next';
import { ForgotPasswordScreen } from '@/components/mail-screens';

export const metadata: Metadata = {
  title: 'Forgot your password',
  robots: { index: false, follow: false },
  // The address of this page can carry a key to an account. No other site learns it.
  referrer: 'no-referrer',
};

export default function Page() {
  return <ForgotPasswordScreen />;
}
