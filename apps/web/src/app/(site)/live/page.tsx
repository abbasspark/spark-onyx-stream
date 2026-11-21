// SPDX-License-Identifier: AGPL-3.0-only
import type { Metadata } from 'next';
import { ChannelLineup } from '@/components/channel-lineup';
import { getChannels } from '@/lib/api';

export const metadata: Metadata = {
  title: 'Live',
  description: 'Channels that are on air right now.',
};

/** Every live channel of the site, with what is on air right now. */
export default async function LivePage() {
  const channels = await getChannels();
  const onAir = channels.filter((channel) => channel.onAir).length;

  return (
    <div className="gutter pt-28 pb-20">
      <header className="mb-10 grid gap-3">
        <h1 className="display text-5xl sm:text-7xl">Live</h1>
        <p className="max-w-[60ch] text-smoke">
          {channels.length === 0
            ? 'This site has no live channels yet.'
            : onAir === 0
              ? 'No channel is on air at the moment. Channels start playing as soon as they are.'
              : `${onAir} of ${channels.length} ${channels.length === 1 ? 'channel' : 'channels'} ${onAir === 1 ? 'is' : 'are'} on air right now.`}
        </p>
      </header>
      {channels.length > 0 ? <ChannelLineup channels={channels} /> : null}
    </div>
  );
}
