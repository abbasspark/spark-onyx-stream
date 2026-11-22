// SPDX-License-Identifier: AGPL-3.0-only
import { useQuery } from '@tanstack/react-query';
import { CircleAlert, Share2 } from 'lucide-react';
import { useMemo } from 'react';
import { p2pApi } from '@/api/endpoints';
import type { TrackerStats } from '@/api/types';
import { CodeBlock } from '@/components/code-block';
import { SharingHistory } from '@/components/sharing-history';
import {
  Badge,
  Card,
  CardContent,
  CardHeader,
  ErrorNote,
  Facts,
  PageHeader,
  Skeleton,
} from '@/components/ui/display';
import { answerRatio, formatRatio, newTrackerSecret, p2pSettings } from '@/lib/edges';
import { formatDateTime, formatRelative } from '@/lib/format';

/** The tracker counts as it goes. The page asks often enough to show it move. */
const REFRESH_MS = 5000;

/** P2P between viewers: whether it is on, and how the tracker is doing. */
export function P2pPage() {
  const status = useQuery({
    queryKey: ['p2p'],
    queryFn: ({ signal }) => p2pApi.status(signal),
    refetchInterval: REFRESH_MS,
  });
  const data = status.data;

  return (
    <>
      <PageHeader
        title="P2P"
        description="Viewers who watch the same video or channel pass parts of it to each other, which takes load off your servers. They find each other through the tracker. The video itself never passes through it, and every viewer can always get every part from a server."
        actions={
          data ? (
            data.state === 'running' ? (
              <Badge tone="success" dot="live">
                Tracker running
              </Badge>
            ) : data.state === 'unreachable' ? (
              <Badge tone="danger" dot>
                Tracker not reachable
              </Badge>
            ) : (
              <Badge tone="neutral" dot>
                Switched off
              </Badge>
            )
          ) : null
        }
      />
      <ErrorNote error={status.error} className="mb-4" />

      {status.isPending ? (
        <Skeleton className="h-72" />
      ) : data?.state === 'running' ? (
        <Running trackerUrl={data.trackerUrl} stats={data.stats} />
      ) : data?.state === 'unreachable' ? (
        <>
          <Card className="mb-4 flex items-start gap-3 border-destructive/40 p-4">
            <CircleAlert className="mt-0.5 size-4 shrink-0 text-destructive" aria-hidden="true" />
            <div className="grid gap-1">
              <p className="text-sm font-medium">{data.message}</p>
              <p className="text-sm text-muted-foreground">
                Viewers are not affected: their players get everything from the servers while the
                tracker is away. Players are told to use{' '}
                <span className="font-mono text-xs text-foreground">{data.trackerUrl}</span>.
              </p>
            </div>
          </Card>
          <SharingHistory />
          <Card>
            <CardHeader title="What to check" />
            <CardContent>
              <ul className="grid list-disc gap-2 pl-5 text-sm text-muted-foreground">
                <li>
                  Is the tracker running? With Compose:{' '}
                  <span className="font-mono text-xs text-foreground">
                    docker compose ps tracker
                  </span>
                  .
                </li>
                <li>
                  Does{' '}
                  <span className="font-mono text-xs text-foreground">
                    P2P_TRACKER_INTERNAL_URL
                  </span>{' '}
                  of the main server point at it? That is the address above.
                </li>
                <li>
                  Is <span className="font-mono text-xs text-foreground">ONYX_TRACKER_SECRET</span>{' '}
                  of the tracker the same value as{' '}
                  <span className="font-mono text-xs text-foreground">P2P_TRACKER_SECRET</span> of
                  the main server?
                </li>
              </ul>
            </CardContent>
          </Card>
        </>
      ) : (
        <Setup />
      )}
    </>
  );
}

function Running({ trackerUrl, stats }: { trackerUrl: string; stats: TrackerStats }) {
  const answered = answerRatio(stats);
  const largest = stats.largestSwarms[0] ?? 0;

  return (
    <>
      <Card className="mb-4 grid grid-cols-2 divide-x divide-y lg:grid-cols-4 lg:divide-y-0">
        <Figure
          label="Viewers connected"
          value={stats.connections.toLocaleString()}
          note="Players with a connection to the tracker now."
        />
        <Figure
          label="Swarms"
          value={stats.swarms.toLocaleString()}
          note="Groups of viewers who watch the same files."
        />
        <Figure
          label="Offers answered"
          value={formatRatio(answered)}
          note="Of the offers passed on between viewers. The rest went to someone who had left or could not connect."
        />
        <Figure
          label="Offers passed on"
          value={stats.offersRelayed.toLocaleString()}
          note={`Since the tracker started ${formatRelative(stats.startedAt)}.`}
        />
      </Card>

      <SharingHistory />

      <div className="grid grid-cols-[minmax(0,1fr)] gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader
            title="Largest swarms"
            description="How many viewers share the same video or channel. A viewer alone in a swarm has nobody to share with."
          />
          <CardContent>
            {stats.largestSwarms.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nobody is watching through P2P now.</p>
            ) : (
              <ol className="grid gap-2.5">
                {stats.largestSwarms.map((size, index) => (
                  // Swarms have no names here: the tracker knows them by a key only.
                  // eslint-disable-next-line react/no-array-index-key
                  <li
                    key={index}
                    className="grid grid-cols-[1.5rem_minmax(0,1fr)_auto] items-center gap-3"
                  >
                    <span className="text-xs text-muted-foreground tabular-nums">{index + 1}</span>
                    <div className="h-2 overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-full rounded-full bg-primary"
                        style={{ width: `${Math.max(2, (size / largest) * 100)}%` }}
                      />
                    </div>
                    <span className="text-sm tabular-nums">
                      {size.toLocaleString()} {size === 1 ? 'viewer' : 'viewers'}
                    </span>
                  </li>
                ))}
              </ol>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader title="The tracker" />
          <CardContent>
            <Facts
              items={[
                ['Address for players', <span className="font-mono text-xs">{trackerUrl}</span>],
                ['Version', stats.version],
                ['Running since', formatDateTime(stats.startedAt)],
                ['Viewers in swarms', stats.peers.toLocaleString()],
                ['Announces', stats.announces.toLocaleString()],
                ['Answers passed on', stats.answersRelayed.toLocaleString()],
                ['Connections turned away', stats.refusedConnections.toLocaleString()],
                ['Messages refused', stats.refused.toLocaleString()],
              ]}
            />
          </CardContent>
        </Card>
      </div>

      <p className="mt-4 text-xs text-muted-foreground">
        Viewers can switch sharing off in the settings of the player, and
        <span className="font-mono text-[11px] text-foreground"> P2P_VIEWER_DEFAULT=off </span>
        makes it start switched off for everyone. A viewer who shares is connected directly to
        others, who can therefore see that viewer&apos;s network address: say so in your privacy
        notice.
      </p>
    </>
  );
}

function Figure({ label, value, note }: { label: string; value: string; note: string }) {
  return (
    <div className="grid content-start gap-1 p-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-xl font-semibold tabular-nums">{value}</p>
      <p className="text-xs text-muted-foreground">{note}</p>
    </div>
  );
}

/** How to switch P2P on: the tracker, and the settings of both sides. */
function Setup() {
  // A fresh secret for this visit. It is only a suggestion until it is in both files.
  const settings = useMemo(
    () =>
      p2pSettings(
        window.location.origin,
        newTrackerSecret((bytes) => crypto.getRandomValues(bytes)),
      ),
    [],
  );

  return (
    <Card>
      <CardHeader
        title="Switch P2P on"
        description="P2P needs the tracker, a small program that runs beside the main server. Both get the same secret, so the tracker lets in only viewers the main server lets watch."
      />
      <CardContent className="grid gap-6">
        <Step number={1} title="Start the tracker">
          <CodeBlock
            label="Settings of the tracker"
            code={settings.tracker}
            note="The Compose setup starts the tracker with these by itself once the secret is in its .env. Without Docker, build services/tracker and run it with these in its environment."
          />
        </Step>
        <Step number={2} title="Tell the main server">
          <CodeBlock
            label="Settings of the main server"
            code={settings.api}
            note="Add these to the settings of the API and start it again. The first address is the one players use: the gateway passes /tracker on to the tracker."
          />
        </Step>
        <div className="flex items-start gap-3 rounded-lg border p-3 text-sm text-muted-foreground">
          <Share2 className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <p>
            The secret above was made in your browser just now and is stored nowhere. Use it, or any
            other of at least 32 characters, as long as both sides have the same one.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

function Step({
  number,
  title,
  children,
}: {
  number: number;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="grid grid-cols-[1.75rem_minmax(0,1fr)] gap-x-3 gap-y-2">
      <span className="flex size-7 items-center justify-center rounded-full border text-xs font-medium tabular-nums">
        {number}
      </span>
      <h3 className="self-center text-sm font-medium">{title}</h3>
      <div className="col-start-2 min-w-0">{children}</div>
    </section>
  );
}
