// SPDX-License-Identifier: AGPL-3.0-only
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, ScanSearch, X } from 'lucide-react';
import { useState } from 'react';
import { markersApi } from '@/api/endpoints';
import type { Season } from '@/api/types';
import { describeDetection, type MarkerDetection } from '@/lib/markers';
import { Button } from './ui/button';
import { ErrorNote, Progress, Skeleton } from './ui/display';
import { ToggleRow } from './ui/form';
import { Dialog, DialogBody, DialogContent, DialogFooter } from './ui/overlay';

const isRunning = (detection: MarkerDetection | null | undefined): boolean =>
  detection?.status === 'QUEUED' || detection?.status === 'RUNNING';

/**
 * Finds the intros and credits of a season by the sound its episodes share,
 * and shows how that goes and what it found.
 */
export function SeasonMarkersDialog({ season, onClose }: { season: Season; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [overwrite, setOverwrite] = useState(false);
  const withVideo = season.episodes.filter((episode) => episode.asset?.status === 'READY').length;

  const detection = useQuery({
    queryKey: ['season-markers', season.id],
    queryFn: ({ signal }) => markersApi.detection(season.id, signal),
    refetchInterval: (query) => (isRunning(query.state.data) ? 1500 : false),
  });
  const start = useMutation({
    mutationFn: () => markersApi.detect(season.id, overwrite),
    onSuccess: (started) => {
      queryClient.setQueryData(['season-markers', season.id], started);
      void queryClient.invalidateQueries({ queryKey: ['asset-markers'] });
    },
  });
  const current = detection.data ?? null;
  const running = isRunning(current);
  const result = current?.status === 'COMPLETED' ? current.result : null;

  return (
    <Dialog open onOpenChange={(next) => (next ? undefined : onClose())}>
      <DialogContent
        title={`Intros and credits of season ${season.number}`}
        description="The opening of a series is the same recording in every episode. The episodes are compared by their sound: what they share at the start is marked as the intro, what they share at the end as the credits."
      >
        <DialogBody>
          {detection.isPending ? <Skeleton className="h-24 rounded-lg" /> : null}

          {running && current ? (
            <div className="rounded-lg border p-4">
              <p className="mb-3 flex items-center gap-2 text-sm font-medium">
                <ScanSearch className="size-4 text-primary" aria-hidden="true" />
                {current.status === 'QUEUED' ? 'Waiting for a worker' : 'Listening to the episodes'}
              </p>
              <Progress value={current.progress} label="Search for intros and credits" />
              <p className="mt-3 text-xs text-muted-foreground">
                You can close this. The search goes on, and what it finds shows here and on each
                video.
              </p>
            </div>
          ) : null}

          {result ? (
            <div className="rounded-lg border p-4">
              <p className="text-sm font-medium">{describeDetection(result)}</p>
              {result.keptManual > 0 && (result.intros > 0 || result.credits > 0) ? (
                <p className="mt-1 text-xs text-muted-foreground">
                  {result.keptManual === 1
                    ? 'One marker set by hand was left as it is.'
                    : `${result.keptManual} markers set by hand were left as they are.`}
                </p>
              ) : null}
              <table className="mt-4 w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-muted-foreground">
                    <th className="pb-1.5 font-medium">Episode</th>
                    <th className="pb-1.5 font-medium">Intro</th>
                    <th className="pb-1.5 font-medium">Credits</th>
                  </tr>
                </thead>
                <tbody>
                  {result.perEpisode.map((row) => {
                    const episode = season.episodes.find((item) => item.number === row.episode);
                    return (
                      <tr key={row.episode} className="border-t">
                        <td className="py-1.5 pr-3">
                          <span className="text-muted-foreground tabular-nums">{row.episode}.</span>{' '}
                          {episode?.name ?? ''}
                        </td>
                        {[row.intro, row.credits].map((found, index) => (
                          <td key={index} className="py-1.5">
                            {found ? (
                              <span className="inline-flex items-center gap-1 text-success">
                                <Check className="size-4" aria-hidden="true" />
                                Found
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 text-muted-foreground">
                                <X className="size-4" aria-hidden="true" />
                                Not found
                              </span>
                            )}
                          </td>
                        ))}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {result.notes?.map((note) => (
                <p key={note} className="mt-3 text-xs text-warning">
                  {note}
                </p>
              ))}
              <p className="mt-4 text-xs text-muted-foreground">
                What was found is marked "Detected" on each video until somebody checks it. Open an
                episode's video and its Markers to play to the edges.
              </p>
            </div>
          ) : null}

          {current?.status === 'FAILED' || current?.status === 'CANCELLED' ? (
            <p className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
              {current.status === 'CANCELLED'
                ? 'The last search was stopped.'
                : `The last search failed: ${current.error ?? 'no reason was given'}`}
            </p>
          ) : null}

          {!running ? (
            <>
              <ToggleRow
                label="Also replace markers set by hand"
                description="Off, an intro or credits somebody set or corrected stay as they are."
                checked={overwrite}
                onCheckedChange={setOverwrite}
              />
              <ul className="grid gap-1 text-xs text-muted-foreground">
                <li>
                  {withVideo} of {season.episodes.length} episodes have a video that is ready.
                  {withVideo < 2 ? ' Two are needed: there is nothing to compare one with.' : ''}
                </li>
                <li>
                  A recap cannot be found this way: it is different in every episode. Neither can an
                  intro that only one episode has.
                </li>
              </ul>
            </>
          ) : null}
          <ErrorNote error={start.error} />
        </DialogBody>
        <DialogFooter>
          <Button onClick={onClose}>Close</Button>
          {!running ? (
            <Button
              variant="primary"
              loading={start.isPending}
              disabled={withVideo < 2}
              onClick={() => start.mutate()}
            >
              <ScanSearch />
              {current ? 'Search again' : 'Search the season'}
            </Button>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
