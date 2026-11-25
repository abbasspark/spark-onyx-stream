// SPDX-License-Identifier: AGPL-3.0-only
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Film,
  Link2,
  Megaphone,
  MoreHorizontal,
  Pencil,
  Plus,
  Trash2,
  TriangleAlert,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { toast } from 'sonner';
import { adsApi } from '@/api/endpoints';
import type { AdFigures, AdReport, AdSettings, AdSettingsView, AdSource } from '@/api/types';
import { useSession } from '@/auth/session';
import { AdSourceDialog } from '@/components/ad-source-dialog';
import { useConfirm } from '@/components/confirm';
import { Button } from '@/components/ui/button';
import {
  Badge,
  Card,
  CardContent,
  CardHeader,
  EmptyState,
  ErrorNote,
  PageHeader,
  Skeleton,
  Table,
  Td,
  Th,
  Tr,
} from '@/components/ui/display';
import { Field, Input, Select, Switch, ToggleRow } from '@/components/ui/form';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Tooltip,
} from '@/components/ui/overlay';
import { ValueBars } from '@/components/value-bars';
import {
  clickRate,
  completionRate,
  describeBreaks,
  formatPercent,
  funnelOf,
  parseWhole,
  shareOf,
  skipRate,
} from '@/lib/ads';
import { cn } from '@/lib/cn';
import { formatDay } from '@/lib/format';

const PERIODS = [
  { value: '7', label: 'Last 7 days' },
  { value: '30', label: 'Last 30 days' },
  { value: '90', label: 'Last 90 days' },
];

/** Ads: when viewers see them, where they come from, and how they did. */
export function AdsPage() {
  const { can } = useSession();
  const mayWrite = can('settings:write');
  const mayReport = can('analytics:read');
  const confirm = useConfirm();
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState<AdSource | 'new' | null>(null);
  const [days, setDays] = useState('30');

  const settings = useQuery({
    queryKey: ['ads', 'settings'],
    queryFn: ({ signal }) => adsApi.settings(signal),
  });
  const sources = useQuery({
    queryKey: ['ads', 'sources'],
    queryFn: ({ signal }) => adsApi.sources(signal),
  });
  const report = useQuery({
    queryKey: ['ads', 'report', days],
    queryFn: ({ signal }) => adsApi.report(Number(days), signal),
    enabled: mayReport,
    refetchInterval: 60_000,
  });
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['ads'] });

  const switchSource = useMutation({
    mutationFn: ({ source, isActive }: { source: AdSource; isActive: boolean }) =>
      adsApi.updateSource(source.id, { isActive }),
    onSuccess: (source) =>
      toast.success(source.isActive ? `"${source.name}" is on` : `"${source.name}" is off`),
    onError: (error: Error) => toast.error(error.message),
    onSettled: refresh,
  });
  const remove = useMutation({
    mutationFn: (source: AdSource) => adsApi.removeSource(source.id),
    onSuccess: () => toast.success('Source deleted'),
    onError: (error: Error) => toast.error(error.message),
    onSettled: refresh,
  });

  const askRemove = async (source: AdSource) => {
    const confirmed = await confirm({
      title: `Delete "${source.name}"?`,
      description:
        'Breaks stop taking ads from it, and its figures leave the report. To pause it, switch it off instead.',
      confirmLabel: 'Delete',
      destructive: true,
    });
    if (confirmed) {
      remove.mutate(source);
    }
  };

  const list = sources.data;
  const view = settings.data;
  const newButton = mayWrite ? (
    <Button variant="primary" onClick={() => setEditing('new')}>
      <Plus />
      New source
    </Button>
  ) : null;

  return (
    <>
      <PageHeader
        title="Ads"
        description="Show ads before, during or after movies and episodes to viewers who have not paid to avoid them. Subscribers of a plan that removes ads, and viewers who bought or rented a title, never see them."
        actions={
          view ? (
            view.enabled ? (
              <Badge tone="success" dot="live">
                Ads are on
              </Badge>
            ) : (
              <Badge tone="neutral" dot>
                Ads are off
              </Badge>
            )
          ) : null
        }
      />
      <ErrorNote error={settings.error ?? sources.error} className="mb-4" />

      {view?.enabled && !view.hasActiveSource ? (
        <Card className="mb-4 flex items-start gap-3 border-warning/50 p-4">
          <TriangleAlert className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden="true" />
          <p className="text-sm">
            Ads are on, but no source is active, so viewers see none. Add or switch on a source
            below.
          </p>
        </Card>
      ) : null}

      {settings.isPending ? (
        <Skeleton className="mb-4 h-72 rounded-xl" />
      ) : view ? (
        <SettingsCard view={view} mayWrite={mayWrite} onSaved={refresh} />
      ) : null}

      <Card className="mb-4">
        <CardHeader
          title="Sources"
          description="Each break takes one ad from the active sources, chosen at random by weight."
          actions={newButton}
        />
        <CardContent className="p-0">
          {sources.isPending ? (
            <Skeleton className="m-5 h-24" />
          ) : list?.length === 0 ? (
            <EmptyState
              icon={Megaphone}
              title="No sources yet"
              action={newButton}
              className="border-0"
            >
              {mayWrite
                ? 'Add a VAST tag from your ad network, or one of your own videos as a house ad.'
                : 'No ad can be shown until a source is added.'}
            </EmptyState>
          ) : (
            <ul className="divide-y">
              {list?.map((source) => (
                <li key={source.id}>
                  <SourceRow
                    source={source}
                    share={shareOf(source, list)}
                    mayWrite={mayWrite}
                    busy={switchSource.isPending}
                    onSwitch={(isActive) => switchSource.mutate({ source, isActive })}
                    onEdit={() => setEditing(source)}
                    onRemove={() => void askRemove(source)}
                  />
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {mayReport ? (
        <ReportCard
          days={days}
          onDaysChange={setDays}
          report={report.data}
          pending={report.isPending}
          error={report.error}
        />
      ) : null}

      <AdSourceDialog
        open={editing !== null}
        onOpenChange={(open) => !open && setEditing(null)}
        source={editing === 'new' ? null : editing}
        onSaved={(_saved, created) => {
          setEditing(null);
          toast.success(created ? 'Source added' : 'Changes saved');
          void refresh();
        }}
      />
    </>
  );
}

function SettingsCard({
  view,
  mayWrite,
  onSaved,
}: {
  view: AdSettingsView;
  mayWrite: boolean;
  onSaved: () => void;
}) {
  const [draft, setDraft] = useState<AdSettings>(view);
  const [every, setEvery] = useState(String(view.midRollEveryMinutes));
  const [shortest, setShortest] = useState(String(view.minDurationMinutes));
  const [problem, setProblem] = useState<string | null>(null);

  useEffect(() => {
    setDraft(view);
    setEvery(String(view.midRollEveryMinutes));
    setShortest(String(view.minDurationMinutes));
  }, [view]);

  const save = useMutation({
    mutationFn: (body: AdSettings) => adsApi.saveSettings(body),
    onSuccess: () => toast.success('Ad settings saved'),
    onError: (error: Error) => setProblem(error.message),
    onSettled: onSaved,
  });

  const midRoll = parseWhole(every, 0, 120);
  const floor = parseWhole(shortest, 0, 240);
  const complete: AdSettings | null =
    typeof midRoll === 'number' && typeof floor === 'number'
      ? { ...draft, midRollEveryMinutes: midRoll, minDurationMinutes: floor }
      : null;
  const changed =
    complete !== null &&
    (Object.keys(complete) as (keyof AdSettings)[]).some((key) => complete[key] !== view[key]);

  return (
    <Card className="mb-4">
      <CardHeader title="When viewers see ads" description={describeBreaks(complete ?? draft)} />
      <CardContent className="grid gap-4">
        <ToggleRow
          label="Show ads"
          description="The master switch. Off, nobody sees an ad, whatever else is set."
          checked={draft.enabled}
          disabled={!mayWrite}
          onCheckedChange={(enabled) => setDraft({ ...draft, enabled })}
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <ToggleRow
            label="Before the video"
            description="An ad plays before the video starts."
            checked={draft.preRoll}
            disabled={!mayWrite}
            onCheckedChange={(preRoll) => setDraft({ ...draft, preRoll })}
          />
          <ToggleRow
            label="After the video"
            description="An ad plays when the video has ended."
            checked={draft.postRoll}
            disabled={!mayWrite}
            onCheckedChange={(postRoll) => setDraft({ ...draft, postRoll })}
          />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            label="An ad every (minutes)"
            hint="During the video, never in its last five minutes or over the credits. 0: no ads in the middle."
          >
            {(id) => (
              <Input
                id={id}
                className="sm:max-w-32"
                inputMode="numeric"
                disabled={!mayWrite}
                aria-invalid={midRoll === 'invalid' || midRoll === null}
                value={every}
                onChange={(event) => setEvery(event.target.value)}
              />
            )}
          </Field>
          <Field
            label="Leave videos shorter than (minutes)"
            hint="Trailers, clips and other short videos are never interrupted. 0: interrupt everything."
          >
            {(id) => (
              <Input
                id={id}
                className="sm:max-w-32"
                inputMode="numeric"
                disabled={!mayWrite}
                aria-invalid={floor === 'invalid' || floor === null}
                value={shortest}
                onChange={(event) => setShortest(event.target.value)}
              />
            )}
          </Field>
        </div>
        {problem ? (
          <p role="alert" className="text-sm text-destructive">
            {problem}
          </p>
        ) : null}
        {mayWrite ? (
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs text-muted-foreground">
              Live channels show no ads yet.{' '}
              <Link to="/plans" className="underline underline-offset-4">
                Plans
              </Link>{' '}
              decide who is spared.
            </p>
            <Button
              variant="primary"
              disabled={!changed}
              loading={save.isPending}
              onClick={() => {
                if (!complete) {
                  setProblem(
                    'Minutes are whole numbers: up to 120 between ads, up to 240 for the shortest video.',
                  );
                  return;
                }
                setProblem(null);
                save.mutate(complete);
              }}
            >
              Save
            </Button>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

function SourceRow({
  source,
  share,
  mayWrite,
  busy,
  onSwitch,
  onEdit,
  onRemove,
}: {
  source: AdSource;
  share: number | null;
  mayWrite: boolean;
  busy: boolean;
  onSwitch: (isActive: boolean) => void;
  onEdit: () => void;
  onRemove: () => void;
}) {
  const house = source.kind === 'HOUSE';
  return (
    <div
      className={cn(
        'grid grid-cols-1 items-center gap-x-6 gap-y-3 px-5 py-4 lg:grid-cols-[minmax(0,1fr)_9rem_auto]',
        !source.isActive && 'bg-muted/40',
      )}
    >
      <div className="grid min-w-0 gap-1.5">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="text-[15px] leading-tight font-semibold">{source.name}</h3>
          <Badge tone={house ? 'primary' : 'neutral'}>
            {house ? (
              <Film className="size-3" aria-hidden="true" />
            ) : (
              <Link2 className="size-3" aria-hidden="true" />
            )}
            {house ? 'Own video' : 'Ad network'}
          </Badge>
        </div>
        <p className="truncate font-mono text-[13px] text-muted-foreground">
          {house ? (source.asset?.title ?? 'Video removed') : source.vastUrl}
        </p>
        {house ? (
          <p className="text-xs text-muted-foreground">
            {source.skipAfterSeconds === null
              ? 'Cannot be skipped'
              : source.skipAfterSeconds === 0
                ? 'Can be skipped at once'
                : `Can be skipped after ${source.skipAfterSeconds} s`}
            {source.clickUrl ? ` · Opens ${new URL(source.clickUrl).host}` : ' · Cannot be clicked'}
          </p>
        ) : null}
      </div>

      <div className="grid gap-1">
        <div className="flex items-baseline justify-between text-xs text-muted-foreground">
          <span>Weight {source.weight}</span>
          <span className="font-medium text-foreground tabular-nums">
            {share === null ? 'Off' : `${share}% of ads`}
          </span>
        </div>
        <div className="h-1.5 overflow-hidden rounded-full bg-muted" aria-hidden="true">
          <div
            className="h-full rounded-full bg-(--series-1) transition-[width] duration-300"
            style={{ width: `${share ?? 0}%` }}
          />
        </div>
      </div>

      <div className="flex items-center gap-1 justify-self-start lg:justify-self-end">
        {mayWrite ? (
          <>
            <Tooltip content={source.isActive ? 'Switch off' : 'Switch on'}>
              <span className="flex items-center px-1.5">
                <Switch
                  checked={source.isActive}
                  disabled={busy}
                  onCheckedChange={onSwitch}
                  aria-label={`${source.name} is switched on`}
                />
              </span>
            </Tooltip>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon-sm" aria-label={`More for ${source.name}`}>
                  <MoreHorizontal />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onSelect={onEdit}>
                  <Pencil />
                  Change
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem destructive onSelect={onRemove}>
                  <Trash2 />
                  Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </>
        ) : null}
      </div>
    </div>
  );
}

function ReportCard({
  days,
  onDaysChange,
  report,
  pending,
  error,
}: {
  days: string;
  onDaysChange: (days: string) => void;
  report: AdReport | undefined;
  pending: boolean;
  error: unknown;
}) {
  return (
    <Card>
      <CardHeader
        title="How ads did"
        description="Counted from what players report, so a viewer who closes the tab mid-ad is not counted as finished."
        actions={
          <Select
            value={days}
            onValueChange={onDaysChange}
            options={PERIODS}
            aria-label="Period"
            className="w-40"
          />
        }
      />
      <CardContent className="grid gap-6">
        <ErrorNote error={error} />
        {pending ? <Skeleton className="h-64" /> : null}
        {report && report.totals.impressions === 0 && report.totals.errors === 0 ? (
          <EmptyState icon={Megaphone} title="No ads shown in this period" className="border-0">
            Figures appear here as soon as a viewer watches an ad.
          </EmptyState>
        ) : null}
        {report && (report.totals.impressions > 0 || report.totals.errors > 0) ? (
          <>
            <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border bg-border lg:grid-cols-5">
              <Figure label="Ads shown" value={report.totals.impressions.toLocaleString()} />
              <Figure
                label="Watched to the end"
                value={formatPercent(completionRate(report.totals))}
              />
              <Figure label="Skipped" value={formatPercent(skipRate(report.totals))} />
              <Figure label="Clicked" value={formatPercent(clickRate(report.totals))} />
              <Figure
                label="Failed to play"
                value={report.totals.errors.toLocaleString()}
                tone={report.totals.errors > 0 ? 'warning' : undefined}
              />
            </dl>

            <div>
              <h3 className="mb-3 text-sm font-medium">Ads shown per day</h3>
              <ValueBars
                label={`Ads shown per day over the last ${report.days} days.`}
                bars={report.perDay.map((entry) => ({
                  key: entry.day,
                  label: formatDay(entry.day).replace(/, \d{4}$/, ''),
                  value: entry.impressions,
                  entry,
                }))}
                format={(value) => Math.round(value).toLocaleString()}
                details={(bar) => (
                  <>
                    <p className="mb-1.5 font-medium">{formatDay(bar.entry.day)}</p>
                    <p className="flex justify-between gap-4">
                      <span className="text-muted-foreground">Shown</span>
                      <span className="tabular-nums">{bar.entry.impressions.toLocaleString()}</span>
                    </p>
                    <p className="flex justify-between gap-4">
                      <span className="text-muted-foreground">To the end</span>
                      <span className="tabular-nums">{bar.entry.completes.toLocaleString()}</span>
                    </p>
                    <p className="flex justify-between gap-4">
                      <span className="text-muted-foreground">Clicked</span>
                      <span className="tabular-nums">{bar.entry.clicks.toLocaleString()}</span>
                    </p>
                  </>
                )}
              />
            </div>

            <Funnel figures={report.totals} />

            {report.perSource.length > 0 ? (
              <div className="overflow-x-auto rounded-lg border">
                <Table>
                  <thead>
                    <tr>
                      <Th>Source</Th>
                      <Th className="text-right">Shown</Th>
                      <Th className="text-right">To the end</Th>
                      <Th className="text-right">Skipped</Th>
                      <Th className="text-right">Clicked</Th>
                      <Th className="text-right">Failed</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.perSource.map((row) => (
                      <Tr key={row.sourceId}>
                        <Td className="font-medium">{row.name}</Td>
                        <Td className="text-right tabular-nums">
                          {row.impressions.toLocaleString()}
                        </Td>
                        <Td className="text-right tabular-nums">
                          {formatPercent(completionRate(row))}
                        </Td>
                        <Td className="text-right tabular-nums">{formatPercent(skipRate(row))}</Td>
                        <Td className="text-right tabular-nums">{formatPercent(clickRate(row))}</Td>
                        <Td
                          className={cn(
                            'text-right tabular-nums',
                            row.errors > 0 && 'text-warning',
                          )}
                        >
                          {row.errors.toLocaleString()}
                        </Td>
                      </Tr>
                    ))}
                  </tbody>
                </Table>
              </div>
            ) : null}
          </>
        ) : null}
      </CardContent>
    </Card>
  );
}

function Figure({ label, value, tone }: { label: string; value: string; tone?: 'warning' }) {
  return (
    <div className="grid gap-0.5 bg-card p-4">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd
        className={cn('text-xl font-semibold tabular-nums', tone === 'warning' && 'text-warning')}
      >
        {value}
      </dd>
    </div>
  );
}

/** How far ads get before viewers leave or skip: five steps, each a share of those who started. */
function Funnel({ figures }: { figures: AdFigures }) {
  const steps = funnelOf(figures);
  const start = steps[0]?.value ?? 0;
  return (
    <div>
      <h3 className="mb-3 text-sm font-medium">How far ads are watched</h3>
      <ol className="grid gap-2">
        {steps.map((step) => {
          const share = start > 0 ? Math.min(100, (step.value / start) * 100) : 0;
          return (
            <li
              key={step.label}
              className="grid grid-cols-[7rem_minmax(0,1fr)_7rem] items-center gap-3 text-sm"
            >
              <span className="text-muted-foreground">{step.label}</span>
              <div className="h-2 overflow-hidden rounded-full bg-muted" aria-hidden="true">
                <div
                  className="h-full rounded-full bg-(--series-1) transition-[width] duration-300"
                  style={{ width: `${share}%` }}
                />
              </div>
              <span className="text-right tabular-nums">
                {step.value.toLocaleString()}{' '}
                <span className="text-muted-foreground">({formatPercent(Math.round(share))})</span>
              </span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
