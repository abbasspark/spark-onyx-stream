// SPDX-License-Identifier: AGPL-3.0-only
import type { Metadata } from 'next';
import { Suspense } from 'react';
import { AuthScreen } from '@/components/auth-screen';

export const metadata: Metadata = {
  title: 'Create an account',
  robots: { index: false, follow: false },
};

export default function Page() {
  return (
    <Suspense>
      <AuthScreen mode="sign-up" />
    </Suspense>
  );
}
