// SPDX-License-Identifier: AGPL-3.0-only
import type { Metadata } from 'next';
import { NotFoundMessage } from '@/components/not-found-message';

export const metadata: Metadata = { title: 'Not found' };

export default function NotFound() {
  return (
    <main>
      <NotFoundMessage />
    </main>
  );
}
