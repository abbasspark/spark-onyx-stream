// SPDX-License-Identifier: AGPL-3.0-only
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Suspense } from 'react';
import { PlansScreen } from '@/components/plans-screen';
import { getPlans } from '@/lib/api';

export const metadata: Metadata = {
  title: 'Plans',
  description: 'What a subscription costs and what it opens.',
};

export default async function Page() {
  const offer = await getPlans();
  // A site that sells nothing has no page of plans.
  if (offer.plans.length === 0) {
    notFound();
  }
  return (
    <Suspense>
      <PlansScreen offer={offer} />
    </Suspense>
  );
}
