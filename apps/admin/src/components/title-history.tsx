// SPDX-License-Identifier: AGPL-3.0-only
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowRight, History, Minus, Plus, RotateCcw } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { purchasesApi, titleHistoryApi } from '@/api/endpoints';
import {
  CHANGE_GROUPS,
  type ChangeGroup,
  type TitleChange,
  type TitleDetail,
  type TitleRevision,
} from '@/api/types';
import { Button } from '@/components/ui/button';
import { Card, EmptyState, ErrorNote, Skeleton } from '@/components/ui/display';
import { Select } from '@/components/ui/form';
import { Dialog, DialogBody, DialogContent, DialogFooter, Tooltip } from '@/components/ui/overlay';
import { cn } from '@/lib/cn';
import { formatDateTime, formatRelative } from '@/lib/format';
import {
  actionLabel,
  changeLabel,
  changesCount,
  dayHeading,
  formatValue,
  GROUP_LABELS,
  groupByDay,
  listItems,
  wordDiff,
} from '@/lib/history';

const PAGE_SIZE = 20;
/** Changes shown of a revision before "Show all". */
const CHANGES_SHOWN = 5;

const initialsOf = (name: string) =>
  name
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join('');

interface TitleHistoryProps {
  title: TitleDetail;
  /** Without the right to change the catalog, versions can be read and not brought back. */
  disabled: boolean;
  /** Called after a version was brought back, to load the title anew. */
  onRestored: () => void;
}

/** Everything that happened to a title, the newest first, with the way back. */
export function TitleHistory({ title, disabled, onRestored }: TitleHistoryProps) {
  const queryClient = useQueryClient();
  const [group, setGroup] = useState<ChangeGroup | 'all'>('all');
  const [restoring, setRestoring] = useState<TitleRevision | null>(null);

  const currency =
    useQuery({
      queryKey: ['billing', 'currency'],
      queryFn: ({ signal }) => purchasesApi.currency(signal),
      staleTime: 300_000,
    }).data ?? 'EUR';

  const history = useInfiniteQuery({
    queryKey: ['titles', 'history', title.id, group],
    queryFn: ({ pageParam, signal }) =>
      titleHistoryApi.list(
        title.id,
        { page: pageParam, pageSize: PAGE_SIZE, group: group === 'all' ? undefined : group },
        signal,
      ),
    initialPageParam: 1,
    getNextPageParam: (last) =>
      last.page * last.pageSize < last.total ? last.page + 1 : undefined,
  });
  const revisions = history.data?.pages.flatMap((page) => page.items) ?? [];
  const total = history.data?.pages[0]?.total ?? 0;
  const days = groupByDay(revisions);

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          {history.data
            ? total === 0
              ? 'Nothing recorded'
              : `${total} ${total === 1 ? 'entry' : 'entries'}, the newest first`
            : ' '}
        </p>
        <Select
          aria-label="Show changes of"
          className="w-56"
          value={group}
          onValueChange={(value) => setGroup(value as ChangeGroup | 'all')}
          options={[
            { value: 'all', label: 'All changes' },
            ...CHANGE_GROUPS.map((key) => ({ value: key, label: GROUP_LABELS[key] })),
          ]}
        />
      </div>

      <ErrorNote error={history.error} />
      {history.isPending ? (
        <div className="grid gap-3">
          {[0, 1, 2].map((line) => (
            <Skeleton key={line} className="h-24 rounded-xl" />
          ))}
        </div>
      ) : null}

      {history.data && revisions.length === 0 ? (
        <EmptyState
          icon={History}
          title={group === 'all' ? 'No history yet' : 'Nothing of this kind'}
        >
          {group === 'all'
            ? 'Nothing was recorded for this title yet. Its history starts with the next change to it.'
            : `No recorded change touched ${GROUP_LABELS[group].toLowerCase()}. Choose "All changes" to see the rest.`}
        </EmptyState>
      ) : null}

      {days.map((day) => (
        <section key={day.day} aria-label={dayHeading(day.day)}>
          <h3 className="mb-2 text-xs font-medium text-muted-foreground">{dayHeading(day.day)}</h3>
          <ol className="relative grid gap-3 before:absolute before:top-4 before:bottom-4 before:left-[1.0625rem] before:w-px before:bg-border">
            {day.revisions.map((revision) => (
              <RevisionEntry
                key={revision.id}
                revision={revision}
                currency={currency}
                newest={revision.id === revisions[0]?.id && group === 'all'}
                mayRestore={!disabled}
                onRestore={() => setRestoring(revision)}
              />
            ))}
          </ol>
        </section>
      ))}

      {history.hasNextPage ? (
        <div className="flex justify-center">
          <Button loading={history.isFetchingNextPage} onClick={() => void history.fetchNextPage()}>
            Show earlier entries
          </Button>
        </div>
      ) : null}

      <RestoreDialog
        title={title}
        revision={restoring}
        currency={currency}
        onClose={() => setRestoring(null)}
        onDone={(result) => {
          setRestoring(null);
          if (result.left.length > 0) {
            toast.warning(`Brought back ${changesCount(result.restored)}, not all of it`, {
              description: `${result.left.map(changeLabel).join(', ')}: something of that version no longer exists.`,
            });
          } else {
            toast.success(`Brought back ${changesCount(result.restored)}`);
          }
          void queryClient.invalidateQueries({ queryKey: ['titles', 'history', title.id] });
          onRestored();
        }}
      />
    </div>
  );
}

function RevisionEntry({
  revision,
  currency,
  newest,
  mayRestore,
  onRestore,
}: {
  revision: TitleRevision;
  currency: string;
  /** The title is as this revision left it: there is nothing to bring back. */
  newest: boolean;
  mayRestore: boolean;
  onRestore: () => void;
}) {
  const [all, setAll] = useState(false);
  const shown = all ? revision.changes : revision.changes.slice(0, CHANGES_SHOWN);
  const hidden = revision.changeCount - shown.length;
  const who = revision.admin?.displayName ?? 'The system';

  return (
    <li className="relative grid grid-cols-[2.125rem_minmax(0,1fr)] gap-3">
      <span
        className={cn(
          'z-[1] flex size-[2.125rem] items-center justify-center rounded-full border bg-card text-[0.6875rem] font-semibold',
          revision.admin ? 'text-primary' : 'text-muted-foreground',
        )}
        aria-hidden="true"
      >
        {revision.admin ? initialsOf(revision.admin.displayName) : <History className="size-3.5" />}
      </span>
      <Card className="min-w-0 px-4 py-3">
        <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
          <div className="grid min-w-0 gap-0.5">
            <p className="text-sm">
              <span className="font-medium">{who}</span>{' '}
              <span className="text-muted-foreground">
                {actionLabel(revision.action).charAt(0).toLowerCase() +
                  actionLabel(revision.action).slice(1)}
              </span>
            </p>
            <p className="text-xs text-muted-foreground">
              <Tooltip content={formatDateTime(revision.createdAt)}>
                <span>{formatRelative(revision.createdAt)}</span>
              </Tooltip>
              {revision.changeCount > 0 ? ` / ${changesCount(revision.changeCount)}` : ''}
            </p>
          </div>
          {mayRestore && !newest ? (
            <Button size="sm" onClick={onRestore}>
              <RotateCcw />
              Bring back
            </Button>
          ) : newest ? (
            <span className="rounded-full border px-2 py-0.5 text-xs text-muted-foreground">
              Current
            </span>
          ) : null}
        </div>

        {revision.first && revision.changes.length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">
            History starts here. What the title looked like at this point is kept, and can be
            brought back.
          </p>
        ) : null}

        {shown.length > 0 ? (
          <ul className="mt-3 grid gap-2.5 border-t pt-3">
            {shown.map((change) => (
              <ChangeLine key={change.field} change={change} currency={currency} />
            ))}
          </ul>
        ) : null}
        {hidden > 0 ? (
          revision.changes.length > shown.length ? (
            <button
              type="button"
              onClick={() => setAll(true)}
              className="mt-2.5 text-sm text-primary hover:underline"
            >
              Show all {revision.changes.length} changes
            </button>
          ) : (
            <p className="mt-2.5 text-xs text-muted-foreground">
              And {hidden} more that were not written out.
            </p>
          )
        ) : null}
      </Card>
    </li>
  );
}

/** One change: a short value as before and after, a text word by word, a list as what came and went. */
export function ChangeLine({ change, currency }: { change: TitleChange; currency: string }) {
  const label = changeLabel(change);

  if (change.kind === 'list') {
    const added = listItems(change, change.added);
    const removed = listItems(change, change.removed);
    return (
      <li className="grid gap-1.5 sm:grid-cols-[11rem_minmax(0,1fr)] sm:gap-4">
        <span className="text-xs font-medium text-muted-foreground sm:pt-0.5">{label}</span>
        <span className="flex flex-wrap gap-1.5">
          {added.map((item) => (
            <span
              key={`+${item}`}
              className="inline-flex max-w-full items-center gap-1 rounded-md border border-success/25 bg-success/10 px-1.5 py-0.5 text-xs text-success"
            >
              <Plus className="size-3 shrink-0" aria-label="Added" />
              <span className="truncate">{item}</span>
            </span>
          ))}
          {removed.map((item) => (
            <span
              key={`-${item}`}
              className="inline-flex max-w-full items-center gap-1 rounded-md border border-destructive/25 bg-destructive/10 px-1.5 py-0.5 text-xs text-destructive"
            >
              <Minus className="size-3 shrink-0" aria-label="Removed" />
              <span className="truncate line-through decoration-destructive/50">{item}</span>
            </span>
          ))}
          {change.reordered ? (
            <span className="text-xs text-muted-foreground">The order changed</span>
          ) : null}
        </span>
      </li>
    );
  }

  const before = formatValue(change, change.before, currency);
  const after = formatValue(change, change.after, currency);

  if (change.kind === 'text' && before && after) {
    return (
      <li className="grid gap-1.5 sm:grid-cols-[11rem_minmax(0,1fr)] sm:gap-4">
        <span className="text-xs font-medium text-muted-foreground sm:pt-0.5">{label}</span>
        <p className="text-sm leading-relaxed whitespace-pre-line">
          {wordDiff(before, after).map((part, index) =>
            part.kind === 'same' ? (
              // The parts of one text never change places, so their position is their key.
              <span key={index}>{part.text}</span>
            ) : part.kind === 'added' ? (
              <ins key={index} className="rounded-xs bg-success/15 text-success no-underline">
                {part.text}
              </ins>
            ) : (
              <del key={index} className="rounded-xs bg-destructive/10 text-destructive/90">
                {part.text}
              </del>
            ),
          )}
        </p>
      </li>
    );
  }

  return (
    <li className="grid gap-1.5 sm:grid-cols-[11rem_minmax(0,1fr)] sm:gap-4">
      <span className="text-xs font-medium text-muted-foreground sm:pt-0.5">{label}</span>
      <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-sm">
        <span
          className={cn(
            'min-w-0 break-words',
            before ? 'text-muted-foreground line-through' : 'text-muted-foreground italic',
          )}
        >
          {before ?? 'Empty'}
        </span>
        <ArrowRight className="size-3.5 shrink-0 text-muted-foreground" aria-label="became" />
        <span className={cn('min-w-0 break-words', !after && 'text-muted-foreground italic')}>
          {after ?? 'Empty'}
        </span>
      </span>
    </li>
  );
}

function RestoreDialog({
  title,
  revision,
  currency,
  onClose,
  onDone,
}: {
  title: TitleDetail;
  revision: TitleRevision | null;
  currency: string;
  onClose: () => void;
  onDone: (result: { restored: number; left: TitleChange[] }) => void;
}) {
  const detail = useQuery({
    queryKey: ['titles', 'history', title.id, 'revision', revision?.id],
    queryFn: ({ signal }) => titleHistoryApi.get(title.id, revision?.id as string, signal),
    enabled: revision !== null,
    // What a restore would change depends on the title as it is now.
    gcTime: 0,
  });
  const restore = useMutation({
    mutationFn: () => titleHistoryApi.restore(title.id, revision?.id as string),
    onSuccess: onDone,
  });
  const plan = detail.data?.restore ?? [];

  return (
    <Dialog
      open={revision !== null}
      onOpenChange={(open) => {
        if (!open) {
          restore.reset();
          onClose();
        }
      }}
    >
      <DialogContent
        size="lg"
        title="Bring this version back?"
        description={
          revision
            ? `${title.name} as it was ${formatRelative(revision.createdAt)}, on ${formatDateTime(revision.createdAt)}.`
            : undefined
        }
      >
        <DialogBody>
          <ErrorNote error={detail.error} />
          {detail.isPending && revision ? <Skeleton className="h-40 rounded-lg" /> : null}

          {detail.data && plan.length === 0 ? (
            <p className="rounded-lg bg-muted px-4 py-6 text-center text-sm text-muted-foreground">
              Nothing to bring back: in everything a restore reaches, the title is as it was then.
            </p>
          ) : null}

          {plan.length > 0 ? (
            <>
              <p className="text-sm font-medium">
                {changesCount(plan.length)} to the title as it is now
              </p>
              <ul className="grid gap-2.5 rounded-lg border p-4">
                {plan.map((change) => (
                  <ChangeLine key={change.field} change={change} currency={currency} />
                ))}
              </ul>
            </>
          ) : null}

          <p className="text-xs text-muted-foreground">
            Brought back: texts, facts, access and prices, artwork, genres, categories and keywords,
            cast and crew, and translations. Left as they are: whether it is published, its address,
            its videos, and its seasons and episodes. Bringing a version back is itself an entry in
            the history, so it can be undone the same way.
          </p>
          <ErrorNote error={restore.error} />
        </DialogBody>
        <DialogFooter>
          <Button onClick={onClose}>Cancel</Button>
          <Button
            variant="primary"
            loading={restore.isPending}
            disabled={plan.length === 0}
            onClick={() => restore.mutate()}
          >
            <RotateCcw />
            Bring back
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
