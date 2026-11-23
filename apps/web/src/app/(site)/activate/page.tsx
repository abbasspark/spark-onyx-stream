// SPDX-License-Identifier: AGPL-3.0-only
import type { Metadata } from 'next';
import { Suspense } from 'react';
import { ActivateScreen } from '@/components/activate-screen';

export const metadata: Metadata = {
  title: 'Sign in a device',
  robots: { index: false, follow: false },
};

export default function Page() {
  return (
    <Suspense>
      <ActivateScreen />
    </Suspense>
  );
}
