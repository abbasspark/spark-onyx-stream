// SPDX-License-Identifier: AGPL-3.0-only
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { LiveScreen } from '@/components/live-screen';
import { getChannel, getChannels } from '@/lib/api';

interface LiveChannelPageProps {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: LiveChannelPageProps): Promise<Metadata> {
  const { slug } = await params;
  const channel = await getChannel(slug);
  return {
    title: channel ? `${channel.name}, live` : 'Not found',
    description: channel?.description ?? undefined,
    // The lineup is the page to find. This one is only for watching.
    robots: { index: false, follow: false },
  };
}

/** Plays a live channel. */
export default async function LiveChannelPage({ params }: LiveChannelPageProps) {
  const { slug } = await params;
  const [channel, channels] = await Promise.all([getChannel(slug), getChannels()]);
  if (!channel) {
    notFound();
  }
  // Keyed by channel, so switching starts a fresh player.
  return <LiveScreen key={channel.slug} channel={channel} channels={channels} />;
}
