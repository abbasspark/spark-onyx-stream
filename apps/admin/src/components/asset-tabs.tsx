// SPDX-License-Identifier: AGPL-3.0-only
import { isMakingTracks } from '@/lib/audio-tracks';
import { useQuery } from '@tanstack/react-query';
import { Download, History, ImageOff, Layers } from 'lucide-react';
import { apiUrl } from '@/api/client';
import { adminsApi, assetsApi, auditApi } from '@/api/endpoints';
import type { Asset } from '@/api/types';
import { useSession } from '@/auth/session';
import { describeAction } from '@/lib/audit';
import { formatBitrate, formatBytes, formatDateTime, formatRelative } from '@/lib/format';
import { Button } from './ui/button';
import {
  Card,
  CardContent,
  CardHeader,
  EmptyState,
  ErrorNote,
  Skeleton,
  Table,
  Td,
  Th,
  Tr,
} from './ui/display';
import { Tooltip } from './ui/overlay';

/** Reads the generated outputs of an asset. Asked again whenever the asset was processed anew. */
export function useAssetMedia(asset: Asset) {
  return useQuery({
    queryKey: ['asset-media', asset.id, asset.readyAt],
    queryFn: ({ signal }) => assetsApi.media(asset.id, signal),
    staleTime: 60_000,
    // A sound track that is being made is done within seconds or minutes.
    refetchInterval: (query) => (isMakingTracks(query.state.data?.audio) ? 4000 : false),
  });
}

type MediaQuery = ReturnType<typeof useAssetMedia>;

/** The qualities players can choose from, with their real bitrates and sizes. */
export function QualitiesTab({ media }: { media: MediaQuery }) {
  if (media.isPending) {
    return <Skeleton className="h-40 rounded-xl" />;
  }
  if (media.isError) {
    return <ErrorNote error={media.error} />;
  }
  if (media.data.renditions.length === 0) {
    return (
      <EmptyState icon={Layers} title="No qualities yet">
        They appear when the video has been processed.
      </EmptyState>
    );
  }

  const total = Number(media.data.outputBytes);
  return (
    <Card className="overflow-hidden">
      <Table>
        <thead>
          <tr>
            <Th>Quality</Th>
            <Th>Picture</Th>
            <Th>Average bitrate</Th>
            <Th>Codecs</Th>
            <Th className="min-w-56">Size</Th>
          </tr>
        </thead>
        <tbody>
          {media.data.renditions.map((rendition) => {
            const share = total > 0 ? (Number(rendition.sizeBytes) / total) * 100 : 0;
            return (
              <Tr key={rendition.name}>
                <Td className="font-medium">{rendition.name}</Td>
                <Td className="whitespace-nowrap tabular-nums">
                  {rendition.width}×{rendition.height}
                  {rendition.frameRate ? (
                    <span className="text-muted-foreground">
                      {' '}
                      · {Number(rendition.frameRate.toFixed(2))} fps
                    </span>
                  ) : null}
                </Td>
                <Td className="tabular-nums">{formatBitrate(rendition.bitrate)}</Td>
                <Td>
                  <code className="font-mono text-xs text-muted-foreground">{rendition.codec}</code>
                </Td>
                <Td>
                  <div className="flex items-center gap-3">
                    <div
                      className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted"
                      aria-hidden="true"
                    >
                      <div
                        className="h-full rounded-full bg-primary/70"
                        style={{ width: `${share}%` }}
                      />
                    </div>
                    <span className="w-20 text-right tabular-nums">
                      {formatBytes(rendition.sizeBytes)}
                    </span>
                  </div>
                </Td>
              </Tr>
            );
          })}
        </tbody>
      </Table>
      <p className="border-t px-4 py-3 text-sm text-muted-foreground">
        {media.data.renditions.length}{' '}
        {media.data.renditions.length === 1 ? 'quality' : 'qualities'},{' '}
        {formatBytes(media.data.outputBytes)} in total
      </p>
    </Card>
  );
}

/** The poster and the sheet of small pictures players show while seeking. */
export function ThumbnailsTab({ media }: { media: MediaQuery }) {
  if (media.isPending) {
    return <Skeleton className="h-64 rounded-xl" />;
  }
  if (media.isError) {
    return <ErrorNote error={media.error} />;
  }
  const { posterUrl, spriteUrl, spriteTrackUrl } = media.data.thumbnails;
  if (!posterUrl && !spriteUrl) {
    return (
      <EmptyState icon={ImageOff} title="No pictures yet">
        The poster and the seek-bar previews are made right after processing.
      </EmptyState>
    );
  }

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
      {posterUrl ? (
        <Card className="overflow-hidden">
          <CardHeader
            title="Poster"
            description="Shown before playback starts and in the library."
            className="pb-4"
          />
          <img
            src={apiUrl(posterUrl)}
            alt="Poster of this video"
            className="w-full border-t bg-black"
            loading="lazy"
          />
        </Card>
      ) : null}
      {spriteUrl ? (
        <Card className="overflow-hidden">
          <CardHeader
            title="Seek-bar previews"
            description="One picture file with many small frames. Players show the frame under the pointer."
            className="pb-4"
            actions={
              spriteTrackUrl ? (
                <Button size="sm" asChild>
                  <a href={apiUrl(spriteTrackUrl)} download="previews.vtt">
                    <Download />
                    Index (WebVTT)
                  </a>
                </Button>
              ) : null
            }
          />
          <CardContent className="border-t bg-muted/40 p-3">
            <img
              src={apiUrl(spriteUrl)}
              alt="Sheet of preview frames of this video"
              className="mx-auto max-h-[28rem] rounded-md"
              loading="lazy"
            />
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}

/** What admins did with this video, newest first. */
export function ActivityTab({ assetId }: { assetId: string }) {
  const { can } = useSession();
  const entries = useQuery({
    queryKey: ['audit', { entityId: assetId }],
    queryFn: ({ signal }) => auditApi.list({ page: 1, pageSize: 50, entityId: assetId }, signal),
  });
  // Names for the entries. Without the permission, "An admin" is shown.
  const admins = useQuery({
    queryKey: ['admins', 'names'],
    queryFn: ({ signal }) => adminsApi.list({ page: 1, pageSize: 100 }, signal),
    enabled: can('admins:read'),
    staleTime: 60_000,
  });
  const names = new Map(admins.data?.items.map((admin) => [admin.id, admin.displayName]));

  if (entries.isPending) {
    return <Skeleton className="h-40 rounded-xl" />;
  }
  if (entries.isError) {
    return <ErrorNote error={entries.error} />;
  }
  if (entries.data.items.length === 0) {
    return <EmptyState icon={History} title="No activity recorded" />;
  }

  return (
    <Card>
      <CardContent>
        <ol className="relative grid gap-5 border-l pl-6">
          {entries.data.items.map((entry) => (
            <li key={entry.id} className="relative">
              <span
                className="absolute top-1.5 -left-[29px] size-2.5 rounded-full border-2 border-card bg-primary"
                aria-hidden="true"
              />
              <p className="text-sm">
                <span className="font-medium">
                  {entry.adminId ? (names.get(entry.adminId) ?? 'An admin') : 'The system'}
                </span>{' '}
                <span className="lowercase">{describeAction(entry.action)}</span>
              </p>
              <p className="text-xs text-muted-foreground">
                <Tooltip content={formatDateTime(entry.createdAt)}>
                  <span>{formatRelative(entry.createdAt)}</span>
                </Tooltip>
                {entry.ipAddress ? ` · from ${entry.ipAddress}` : ''}
              </p>
            </li>
          ))}
        </ol>
      </CardContent>
    </Card>
  );
}
