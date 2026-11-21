// SPDX-License-Identifier: AGPL-3.0-only
import type { Metadata } from 'next';
import { AccountScreen } from '@/components/account-screen';

export const metadata: Metadata = {
  title: 'Account',
  robots: { index: false, follow: false },
};

export default function AccountPage() {
  return <AccountScreen />;
}
