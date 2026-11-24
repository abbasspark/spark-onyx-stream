// SPDX-License-Identifier: AGPL-3.0-only
import type { Metadata } from 'next';
import { Suspense } from 'react';
import { RedeemScreen } from '@/components/redeem-screen';

export const metadata: Metadata = {
  title: 'Enter a prepaid code',
  robots: { index: false, follow: false },
};

export default function Page() {
  return (
    <Suspense>
      <RedeemScreen />
    </Suspense>
  );
}
