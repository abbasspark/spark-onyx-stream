// SPDX-License-Identifier: AGPL-3.0-only
import type { Metadata } from 'next';
import { connection } from 'next/server';
import { NotFoundMessage } from '@/components/not-found-message';

export const metadata: Metadata = { title: 'Not found' };

export default async function NotFound() {
  // Built per request, so its scripts carry the nonce of the security policy.
  await connection();
  return (
    <main>
      <NotFoundMessage />
    </main>
  );
}
