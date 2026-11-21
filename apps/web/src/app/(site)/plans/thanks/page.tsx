// SPDX-License-Identifier: AGPL-3.0-only
import type { Metadata } from 'next';
import { Suspense } from 'react';
import { CheckoutReturnScreen } from '@/components/checkout-return-screen';

export const metadata: Metadata = {
  title: 'Your subscription',
  robots: { index: false, follow: false },
  // The address of this page names a payment. No other site learns it.
  referrer: 'no-referrer',
};

export default function Page() {
  return (
    <Suspense>
      <CheckoutReturnScreen />
    </Suspense>
  );
}
