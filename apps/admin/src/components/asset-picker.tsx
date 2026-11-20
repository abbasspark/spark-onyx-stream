// SPDX-License-Identifier: AGPL-3.0-only
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Film, Search } from 'lucide-react';
import { useEffect, useState } from 'react';
import { apiUrl } from '@/api/client';
import { assetsApi } from '@/api/endpoints';
import type { Asset } from '@/api/types';
import { cn } from '@/lib/cn';
import { formatDuration, formatRelative } from '@/lib/format';
import { Button } from './ui/button';
import { EmptyState, ErrorNote, Skeleton, StatusBadge } from './ui/display';
import { Input } from './ui/form';
import { Dialog, DialogBody, DialogContent, DialogFooter } from './ui/overlay';

interface AssetPickerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  /** The video chosen at the moment, shown as selected. */
  currentId?: string | null;
  onPick: (asset: Asset) => void;
}

/** A dialog for choosing one video from the library, with search. */
export function AssetPicker({ open, onOpenChange, title, currentId, onPick }: AssetPickerProps) {
  const [search, setSearch] = useState('');
  const [term, setTerm] = useState('');
  const [selected, setSelected] = useState<Asset | null>(null);

  useEffect(() => {
    if (open) {
      setSearch('');
      setTerm('');
      setSelected(null);
    }
  }, [open]);

  // The list follows the search box a moment after typing stops.
  useEffect(() => {
    const timer = window.setTimeout(() => setTerm(search.trim()), 250);
    return () => window.clearTimeout(timer);
  }, [search]);

  const assets = useQuery({
    queryKey: ['assets', 'picker', term],
    queryFn: ({ signal }) =>
      assetsApi.list({ page: 1, pageSize: 30, q: term || undefined }, signal),
    enabled: open,
    placeholderData: keepPreviousData,
  });

  const chosenId = selected?.id ?? currentId ?? null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        title={title}
        description="Videos come from the library. A title can only be published with a video that is ready."
        size="lg"
      >
        <DialogBody className="content-start">
          <div className="relative">
            <Search
              className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden="true"
            />
            <Input
              type="search"
              placeholder="Search the library"
              aria-label="Search the library"
              className="pl-9"
              autoFocus
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </div>

          <ErrorNote error={assets.error} />
          {assets.isPending ? <Skeleton className="h-64 rounded-lg" /> : null}
          {assets.data?.items.length === 0 ? (
            <EmptyState icon={Film} title={term ? 'Nothing matches' : 'The library is empty'}>
              {term ? 'Try another search.' : 'Upload a video in the library first.'}
            </EmptyState>
          ) : null}

          {assets.data && assets.data.items.length > 0 ? (
            <ul
              className="grid max-h-[26rem] gap-1 overflow-y-auto"
              role="listbox"
              aria-label="Videos"
            >
              {assets.data.items.map((asset) => (
                <li key={asset.id}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={chosenId === asset.id}
                    onClick={() => setSelected(asset)}
                    onDoubleClick={() => {
                      onPick(asset);
                      onOpenChange(false);
                    }}
                    className={cn(
                      'flex w-full items-center gap-3 rounded-lg border border-transparent p-2 text-left transition-colors hover:bg-accent',
                      chosenId === asset.id && 'border-primary bg-primary/5',
                    )}
                  >
                    <div className="aspect-video w-24 shrink-0 overflow-hidden rounded-md bg-muted">
                      {asset.posterUrl ? (
                        <img
                          src={apiUrl(asset.posterUrl)}
                          alt=""
                          loading="lazy"
                          className="size-full object-cover"
                        />
                      ) : (
                        <div className="flex size-full items-center justify-center text-muted-foreground/50">
                          <Film className="size-5" aria-hidden="true" />
                        </div>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{asset.title}</p>
                      <p className="text-xs text-muted-foreground">
                        {formatDuration(asset.media.durationMs)}
                        {asset.media.height ? ` · ${asset.media.height}p` : ''} · added{' '}
                        {formatRelative(asset.createdAt)}
                      </p>
                    </div>
                    <StatusBadge status={asset.status} />
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
        </DialogBody>
        <DialogFooter>
          <Button onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button
            variant="primary"
            disabled={!selected}
            onClick={() => {
              if (selected) {
                onPick(selected);
                onOpenChange(false);
              }
            }}
          >
            Use this video
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
