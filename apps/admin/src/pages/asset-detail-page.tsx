// SPDX-License-Identifier: AGPL-3.0-only
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { type FormEvent, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { ApiError } from '../api/client';
import { assetsApi, jobsApi } from '../api/endpoints';
import type { Asset, EncryptionMode, ProcessingMode } from '../api/types';
import { useSession } from '../auth/session';
import { JobTable } from '../components/job-table';
import { Player } from '../components/player';
import { EmptyState, ErrorNote, PageHeader, Spinner, StatusBadge } from '../components/ui';
import {
  formatBytes,
  formatDateTime,
  formatDuration,
  formatResolution,
  humanize,
} from '../lib/format';

const REFRESH_MS = 2000;
const isBusy = (asset: Asset | undefined) =>
  asset !== undefined && ['UPLOADING', 'UPLOADED', 'PROCESSING'].includes(asset.status);

/** One asset: preview, details, its jobs and the actions on it. */
export function AssetDetailPage() {
  const { id = '' } = useParams();
  const { can } = useSession();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

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
  };
  const remove = useMutation({
    mutationFn: () => assetsApi.remove(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['assets'] });
      void navigate('/assets');
    },
  });

  if (asset.isPending) {
    return <Spinner label="Loading the asset" />;
  }
  if (asset.isError) {
    return (
      <>
        <ErrorNote error={asset.error} />
        <Link to="/assets">Back to the library</Link>
      </>
    );
  }

  const data = asset.data;
  const failedJob = jobs.data?.items.find((job) => job.status === 'FAILED');

  return (
    <>
      <p className="crumbs">
        <Link to="/assets">Library</Link> / {data.title}
      </p>
      <PageHeader title={data.title}>
        <StatusBadge status={data.status} />
      </PageHeader>

      <div className="detail-grid">
        <section className="card">
          <h2>Preview</h2>
          {data.status === 'READY' && data.processingMode === 'PASSTHROUGH' ? (
            <EmptyState title="No stream">
              This asset was stored without processing, so there is nothing to play here.
            </EmptyState>
          ) : null}
          {data.status === 'READY' && playback.data ? (
            <Player playback={playback.data} title={data.title} />
          ) : null}
          {data.status === 'READY' &&
          playback.isPending &&
          data.processingMode !== 'PASSTHROUGH' ? (
            <Spinner label="Preparing playback" />
          ) : null}
          <ErrorNote error={playback.error} />
          {busy ? (
            <Spinner label={`${humanize(data.status)}. The preview appears when it is ready`} />
          ) : null}
          {data.status === 'FAILED' ? (
            <p className="note note-error" role="alert">
              Processing failed{failedJob?.error ? `: ${failedJob.error}` : '.'}
            </p>
          ) : null}
        </section>

        <section className="card">
          <h2>Details</h2>
          <dl className="facts">
            <dt>Length</dt>
            <dd>{formatDuration(data.media.durationMs)}</dd>
            <dt>Picture</dt>
            <dd>{formatResolution(data.media.width, data.media.height, data.media.frameRate)}</dd>
            <dt>Codecs</dt>
            <dd>
              {[data.media.videoCodec, data.media.audioCodec].filter(Boolean).join(', ') || '–'}
            </dd>
            <dt>Processing</dt>
            <dd>{humanize(data.processingMode)}</dd>
            <dt>Encryption</dt>
            <dd>{data.encryption === 'AES_128' ? 'AES-128' : 'None'}</dd>
            <dt>Source file</dt>
            <dd>
              {data.source.filename ?? '–'}
              {data.source.bytes ? ` (${formatBytes(data.source.bytes)})` : ''}
            </dd>
            <dt>Added</dt>
            <dd>{formatDateTime(data.createdAt)}</dd>
            <dt>Ready since</dt>
            <dd>{formatDateTime(data.readyAt)}</dd>
            <dt>Asset ID</dt>
            <dd>
              <code>{data.id}</code>
            </dd>
          </dl>
        </section>
      </div>

      {can('assets:write') ? (
        <section className="card">
          <h2>Actions</h2>
          <RenameForm asset={data} onDone={refresh} />
          <ReprocessForm asset={data} disabled={busy} onDone={refresh} />
          <div className="action-row">
            <div>
              <strong>Delete</strong>
              <p className="muted">
                Removes the asset from the library. Viewers can no longer play it.
              </p>
            </div>
            <button
              type="button"
              className="button button-danger"
              disabled={remove.isPending}
              onClick={() => {
                if (window.confirm(`Delete "${data.title}"? This cannot be undone here.`)) {
                  remove.mutate();
                }
              }}
            >
              Delete asset
            </button>
          </div>
          <ErrorNote error={remove.error} />
        </section>
      ) : null}

      {can('jobs:read') ? (
        <section className="card">
          <h2>Jobs</h2>
          <ErrorNote error={jobs.error} />
          {jobs.isPending ? <Spinner label="Loading jobs" /> : null}
          {jobs.data && jobs.data.items.length === 0 ? (
            <p className="muted">No jobs yet. They start when the upload is complete.</p>
          ) : null}
          {jobs.data && jobs.data.items.length > 0 ? (
            <JobTable jobs={jobs.data.items} showAsset={false} />
          ) : null}
        </section>
      ) : null}
    </>
  );
}

function RenameForm({ asset, onDone }: { asset: Asset; onDone: (updated: Asset) => void }) {
  const [title, setTitle] = useState(asset.title);
  const rename = useMutation({
    mutationFn: () => assetsApi.rename(asset.id, title.trim()),
    onSuccess: onDone,
  });

  const submit = (event: FormEvent) => {
    event.preventDefault();
    rename.mutate();
  };

  return (
    <form className="action-row" onSubmit={submit}>
      <label className="field grow">
        Title
        <input
          type="text"
          required
          maxLength={200}
          value={title}
          onChange={(event) => setTitle(event.target.value)}
        />
      </label>
      <button
        type="submit"
        className="button"
        disabled={rename.isPending || !title.trim() || title.trim() === asset.title}
      >
        Save title
      </button>
      <ErrorNote error={rename.error} />
    </form>
  );
}

function ReprocessForm({
  asset,
  disabled,
  onDone,
}: {
  asset: Asset;
  disabled: boolean;
  onDone: (updated: Asset) => void;
}) {
  const [mode, setMode] = useState<ProcessingMode | ''>('');
  const [encryption, setEncryption] = useState<EncryptionMode>(asset.encryption);
  const reprocess = useMutation({
    mutationFn: () =>
      assetsApi.reprocess(asset.id, { processingMode: mode || undefined, encryption }),
    onSuccess: onDone,
  });
  const hasSource = asset.source.filename !== null;

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (window.confirm('Process this asset again? Its current outputs are replaced.')) {
      reprocess.mutate();
    }
  };

  return (
    <form className="action-row" onSubmit={submit}>
      <div className="grow">
        <strong>Process again</strong>
        <p className="muted">
          Builds the stream again from the source file, for example after a failure or to change
          encryption.
        </p>
        <div className="field-row">
          <label className="field">
            Processing
            <select
              value={mode}
              onChange={(event) => setMode(event.target.value as ProcessingMode | '')}
            >
              <option value="">Automatic</option>
              <option value="COPY">Copy without re-encoding</option>
              <option value="TRANSCODE">Transcode into all qualities</option>
            </select>
          </label>
          <label className="field">
            Encryption
            <select
              value={encryption}
              onChange={(event) => setEncryption(event.target.value as EncryptionMode)}
            >
              <option value="NONE">None</option>
              <option value="AES_128">AES-128</option>
            </select>
          </label>
        </div>
        <ErrorNote error={reprocess.error} />
      </div>
      <button
        type="submit"
        className="button"
        disabled={disabled || !hasSource || reprocess.isPending}
      >
        Process again
      </button>
    </form>
  );
}
