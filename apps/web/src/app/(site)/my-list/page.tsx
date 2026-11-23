// SPDX-License-Identifier: AGPL-3.0-only
import type { Metadata } from 'next';
import { MyListScreen } from '@/components/my-list';

export const metadata: Metadata = {
  title: 'My list',
  robots: { index: false, follow: false },
};

export default function MyListPage() {
  return <MyListScreen />;
}
