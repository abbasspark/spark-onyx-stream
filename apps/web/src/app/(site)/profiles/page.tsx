// SPDX-License-Identifier: AGPL-3.0-only
import type { Metadata } from 'next';
import { Suspense } from 'react';
import { ProfilesScreen } from '@/components/profiles-screen';

export const metadata: Metadata = {
  title: 'Who is watching?',
  robots: { index: false, follow: false },
};

export default function Page() {
  return (
    <Suspense>
      <ProfilesScreen />
    </Suspense>
  );
}
