// SPDX-License-Identifier: AGPL-3.0-only
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Activity,
  ArrowLeft,
  Check,
  Copy,
  FileQuestion,
  Info,
  Lock,
  Pencil,
  RefreshCw,
  Settings2,
  Trash2,
} from 'lucide-react';
import { type FormEvent, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { toast } from 'sonner';
import { ApiError } from '@/api/client';
import { assetsApi, jobsApi } from '@/api/endpoints';
import type { Asset, EncryptionMode } from '@/api/types';
import { useSession } from '@/auth/session';
import { useConfirm } from '@/components/confirm';
import { JobTable } from '@/components/job-table';
import { Player } from '@/components/player';
import { Button } from '@/components/ui/button';
import {
  Badge,
  Card,
  CardContent,
  CardHeader,
  EmptyState,
  ErrorNote,
  Facts,
  Skeleton,
  Spinner,
  StatusBadge,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui/display';
import { Field, Input, Select } from '@/components/ui/form';
import { Dialog, DialogBody, DialogContent, DialogFooter, Tooltip } from '@/components/ui/overlay';
import {
  formatBytes,
  formatDateTime,
  formatDuration,
  formatResolution,
  humanize,
} from '@/lib/format';

const REFRESH_MS = 2000;
const isBusy = (asset: Asset | undefined) =>
  asset !== undefined && ['UPLOADING', 'UPLOADED', 'PROCESSING'].includes(asset.status);

/** A value with a button that copies it. */
function Copyable({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error('Copying is blocked by the browser');
    }
  };
  return (
    <span className="inline-flex max-w-full items-center gap-1.5">
      <code className="truncate font-mono text-[13px] text-muted-foreground">{value}</code>
      <Tooltip content={copied ? 'Copied' : 'Copy'}>
        <button
          type="button"
          onClick={() => void copy()}
          className="rounded p-0.5 text-muted-foreground hover:text-foreground"
          aria-label="Copy"
        >
          {copied ? <Check className="size-3.5 text-success" /> : <Copy className="size-3.5" />}
        </button>
      </Tooltip>
    </span>
  );
}

/** One video: preview, details, its jobs and the actions on it. */
export function AssetDetailPage() {
  const { id = '' } = useParams();
  const { can } = useSession();
  const mayWrite = can('assets:write');
  const confirm = useConfirm();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [renameOpen, setRenameOpen] = useState(false);
  const [reprocessOpen, setReprocessOpen] = useState(false);

  const asset = useQuery({
    queryKey: ['asset', id],
    queryFn: ({ signal }) => assetsApi.get(id, signal),
    refetchInterval: (query) => (isBusy(query.state.data) ? REFRESH_MS : false),
    retry: (count, error) => !(error instanceof ApiError && error.status === 404) && count < 2,
  });
  const busy = isBusy(asset.data);

  const jobs = useQuery({
    queryKey: ['jobs', { assetId: id }],
    queryFn: ({ signal }) => jobsApi.list({ assetId: id, page: 1, pageSize: 50 }, signal),
    enabled: can('jobs:read') && asset.isSuccess,
    // Thumbnails are still made for a moment after the asset is ready.
    refetchInterval: (query) =>
      busy || query.state.data?.items.some((job) => ['QUEUED', 'RUNNING'].includes(job.status))
        ? REFRESH_MS
        : false,
  });

  // Signed URLs are asked for again whenever the asset was processed anew.
  const playback = useQuery({
    queryKey: ['playback', id, asset.data?.readyAt],
    queryFn: () => assetsApi.playback(id),
    enabled: asset.data?.status === 'READY' && asset.data.processingMode !== 'PASSTHROUGH',
    staleTime: 30 * 60 * 1000,
    refetchOnWindowFocus: false,
  });

  const refresh = (updated?: Asset) => {
    if (updated) {
      // Show the new state at once, so nothing asks for playback of an asset in processing.
      queryClient.setQueryData(['asset', id], updated);
    }
    void queryClient.invalidateQueries({ queryKey: ['asset', id] });
    void queryClient.invalidateQueries({ queryKey: ['jobs'] });
    void queryClient.invalidateQueries({ queryKey: ['assets'] });
    void queryClient.invalidateQueries({ queryKey: ['stats'] });
  };

  const remove = useMutation({
    mutationFn: () => assetsApi.remove(id),
    onSuccess: () => {
      toast.success('Video deleted');
      void queryClient.invalidateQueries({ queryKey: ['assets'] });
      void queryClient.invalidateQueries({ queryKey: ['stats'] });
      void navigate('/assets');
    },
    onError: (error: Error) => toast.error(error.message),
  });

  if (asset.isPending) {
    return (
      <div className="grid gap-4">
        <Skeleton className="h-9 w-72" />
        <div className="grid gap-4 xl:grid-cols-[minmax(0,5fr)_minmax(0,3fr)]">
          <Skeleton className="aspect-video rounded-xl" />
          <Skeleton className="h-80 rounded-xl" />
        </div>
      </div>
    );
  }
  if (asset.isError) {
    const missing = asset.error instanceof ApiError && asset.error.status === 404;
    return (
      <EmptyState
        icon={FileQuestion}
        title={missing ? 'This video does not exist' : 'The video could not be loaded'}
        action={
          <Button asChild>
            <Link to="/assets">
              <ArrowLeft />
              Back to the library
            </Link>
          </Button>
        }
      >
        {missing ? 'It may have been deleted.' : asset.error.message}
      </EmptyState>
    );
  }

  const data = asset.data;
  const jobItems = jobs.data?.items ?? [];
  const failedJob = jobItems.find((job) => job.status === 'FAILED');
  const runningJob = jobItems.find((job) => job.status === 'RUNNING');

  const askDelete = async () => {
    const confirmed = await confirm({
      title: `Delete "${data.title}"?`,
      description:
        'The source file and all streams are removed. Viewers can no longer play it. This cannot be undone.',
      confirmLabel: 'Delete',
      destructive: true,
    });
    if (confirmed) {
      remove.mutate();
    }
  };

  return (
    <>
      <header className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <Link
            to="/assets"
            className="mb-2 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="size-3.5" aria-hidden="true" />
            Library
          </Link>
          <h1 className="flex flex-wrap items-center gap-3 text-2xl font-semibold tracking-tight break-words">
            {data.title}
            <StatusBadge status={data.status} />
            {data.encryption === 'AES_128' ? (
              <Badge tone="primary">
                <Lock className="size-3" aria-hidden="true" />
                Encrypted
              </Badge>
            ) : null}
          </h1>
        </div>
        {mayWrite ? (
          <div className="flex flex-wrap items-center gap-2">
            <Button onClick={() => setRenameOpen(true)}>
              <Pencil />
              Rename
            </Button>
            <Button disabled={busy || !data.source.filename} onClick={() => setReprocessOpen(true)}>
              <RefreshCw />
              Process again
            </Button>
            <Button
              variant="destructive-outline"
              loading={remove.isPending}
              onClick={() => void askDelete()}
            >
              <Trash2 />
              Delete
            </Button>
          </div>
        ) : null}
      </header>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,5fr)_minmax(0,3fr)]">
        <Card className="overflow-hidden">
          {data.status === 'READY' && playback.data ? (
            <Player playback={playback.data} title={data.title} />
          ) : (
            <div className="flex aspect-video flex-col items-center justify-center gap-3 bg-muted/40 p-6 text-center">
              {data.status === 'READY' && data.processingMode === 'PASSTHROUGH' ? (
                <p className="max-w-sm text-sm text-muted-foreground">
                  This video was stored without processing, so there is no stream to play here.
                </p>
              ) : null}
              {data.status === 'READY' &&
              playback.isPending &&
              data.processingMode !== 'PASSTHROUGH' ? (
                <Spinner label="Preparing playback" />
              ) : null}
              <ErrorNote error={playback.error} />
              {busy ? (
                <>
                  <Spinner label={humanize(data.status)} />
                  {runningJob ? (
                    <p className="text-sm text-muted-foreground">
                      {humanize(runningJob.type)}: {Math.round(runningJob.progress)}%
                    </p>
                  ) : null}
                  <p className="text-sm text-muted-foreground">
                    The preview appears when it is ready.
                  </p>
                </>
              ) : null}
              {data.status === 'FAILED' ? (
                <ErrorNote
                  error={`Processing failed${failedJob?.error ? `: ${failedJob.error}` : '.'}`}
                  className="max-w-md text-left"
                />
              ) : null}
            </div>
          )}
        </Card>

        <Card>
          <CardHeader title="Details" />
          <CardContent>
            <Facts
              items={[
                ['Length', formatDuration(data.media.durationMs)],
                [
                  'Picture',
                  formatResolution(data.media.width, data.media.height, data.media.frameRate),
                ],
                [
                  'Codecs',
                  [data.media.videoCodec, data.media.audioCodec].filter(Boolean).join(', ') || '–',
                ],
                ['Processing', humanize(data.processingMode)],
                ['Encryption', data.encryption === 'AES_128' ? 'AES-128' : 'None'],
                ['Source file', data.source.filename ?? '–'],
                ['Source size', formatBytes(data.source.bytes)],
                ['Added', formatDateTime(data.createdAt)],
                ['Ready since', formatDateTime(data.readyAt)],
                ['ID', <Copyable key="id" value={data.id} />],
              ]}
            />
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="jobs" className="mt-6">
        <TabsList>
          {can('jobs:read') ? (
            <TabsTrigger value="jobs">
              <Activity />
              Jobs
              {jobItems.length > 0 ? <Badge>{jobItems.length}</Badge> : null}
            </TabsTrigger>
          ) : null}
          <TabsTrigger value="source">
            <Info />
            Source
          </TabsTrigger>
        </TabsList>
        {can('jobs:read') ? (
          <TabsContent value="jobs">
            <ErrorNote error={jobs.error} />
            {jobs.isPending ? <Skeleton className="h-40 rounded-xl" /> : null}
            {jobs.data && jobItems.length === 0 ? (
              <EmptyState icon={Activity} title="No jobs yet">
                Processing starts when the upload is complete.
              </EmptyState>
            ) : null}
            {jobItems.length > 0 ? (
              <Card className="overflow-hidden">
                <JobTable jobs={jobItems} showAsset={false} />
              </Card>
            ) : null}
          </TabsContent>
        ) : null}
        <TabsContent value="source">
          <Card>
            <CardContent>
              <Facts
                items={[
                  ['File name', data.source.filename ?? '–'],
                  ['Size', formatBytes(data.source.bytes)],
                  [
                    'SHA-256',
                    data.source.checksum ? (
                      <Copyable key="sum" value={data.source.checksum} />
                    ) : (
                      '–'
                    ),
                  ],
                  ['Storage pool', <Copyable key="pool" value={data.storagePoolId} />],
                ]}
              />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <RenameDialog
        asset={data}
        open={renameOpen}
        onOpenChange={setRenameOpen}
        onDone={(updated) => refresh(updated)}
      />
      <ReprocessDialog
        asset={data}
        open={reprocessOpen}
        onOpenChange={setReprocessOpen}
        onDone={(updated) => refresh(updated)}
      />
    </>
  );
}

interface AssetDialogProps {
  asset: Asset;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDone: (updated: Asset) => void;
}

function RenameDialog({ asset, open, onOpenChange, onDone }: AssetDialogProps) {
  const [title, setTitle] = useState(asset.title);
  const rename = useMutation({
    mutationFn: () => assetsApi.rename(asset.id, title.trim()),
    onSuccess: (updated) => {
      toast.success('Title saved');
      onDone(updated);
      onOpenChange(false);
    },
  });

  const submit = (event: FormEvent) => {
    event.preventDefault();
    rename.mutate();
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (next) {
          setTitle(asset.title);
          rename.reset();
        }
        onOpenChange(next);
      }}
    >
      <DialogContent title="Rename video" size="sm">
        <form onSubmit={submit} className="contents">
          <DialogBody>
            <Field label="Title">
              {(id) => (
                <Input
                  id={id}
                  required
                  autoFocus
                  maxLength={200}
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                />
              )}
            </Field>
            <ErrorNote error={rename.error} />
          </DialogBody>
          <DialogFooter>
            <Button onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button
              type="submit"
              variant="primary"
              loading={rename.isPending}
              disabled={!title.trim() || title.trim() === asset.title}
            >
              Save
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function ReprocessDialog({ asset, open, onOpenChange, onDone }: AssetDialogProps) {
  const [mode, setMode] = useState('AUTO');
  const [encryption, setEncryption] = useState<EncryptionMode>(asset.encryption);
  const reprocess = useMutation({
    mutationFn: () =>
      assetsApi.reprocess(asset.id, {
        processingMode: mode === 'AUTO' ? undefined : (mode as 'COPY' | 'TRANSCODE'),
        encryption,
      }),
    onSuccess: (updated) => {
      toast.success('Processing started again');
      onDone(updated);
      onOpenChange(false);
    },
  });

  const submit = (event: FormEvent) => {
    event.preventDefault();
    reprocess.mutate();
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (next) {
          setMode('AUTO');
          setEncryption(asset.encryption);
          reprocess.reset();
        }
        onOpenChange(next);
      }}
    >
      <DialogContent
        title="Process again"
        description="Builds the streams again from the source file. The current streams are replaced, and the video cannot be played until it is ready again."
      >
        <form onSubmit={submit} className="contents">
          <DialogBody>
            <Field label="Processing">
              {(id) => (
                <Select
                  id={id}
                  value={mode}
                  onValueChange={setMode}
                  options={[
                    {
                      value: 'AUTO',
                      label: 'Automatic',
                      description: 'Copy when the file allows it, otherwise transcode.',
                    },
                    { value: 'COPY', label: 'Copy without re-encoding' },
                    { value: 'TRANSCODE', label: 'Transcode into all qualities' },
                  ]}
                />
              )}
            </Field>
            <Field label="Encryption">
              {(id) => (
                <Select
                  id={id}
                  value={encryption}
                  onValueChange={(value) => setEncryption(value as EncryptionMode)}
                  options={[
                    { value: 'NONE', label: 'None' },
                    {
                      value: 'AES_128',
                      label: 'AES-128',
                      description: 'A new key is made for this run.',
                    },
                  ]}
                />
              )}
            </Field>
            <ErrorNote error={reprocess.error} />
          </DialogBody>
          <DialogFooter>
            <Button onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" variant="primary" loading={reprocess.isPending}>
              <Settings2 />
              Process again
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
