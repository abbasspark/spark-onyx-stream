// SPDX-License-Identifier: AGPL-3.0-only
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { type FormEvent, useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { assetsApi } from '../api/endpoints';
import { ASSET_STATUSES, type AssetStatus } from '../api/types';
import { useSession } from '../auth/session';
import {
  EmptyState,
  ErrorNote,
  PageHeader,
  Pagination,
  ProgressBar,
  Spinner,
  StatusBadge,
} from '../components/ui';
import {
  formatBytes,
  formatDateTime,
  formatDuration,
  formatResolution,
  humanize,
  titleFromFileName,
} from '../lib/format';
import { useUploads } from '../uploads/uploads';

const PAGE_SIZE = 25;
/** How often the list is read again while something on it is still changing. */
const REFRESH_MS = 2500;
const SEARCH_DELAY_MS = 300;

/** The library: every asset, with search, a status filter and the upload form. */
export function AssetsPage() {
  const { can } = useSession();
  const [params, setParams] = useSearchParams();
  const [showUpload, setShowUpload] = useState(false);

  const page = Math.max(1, Number(params.get('page')) || 1);
  const status = (params.get('status') ?? '') as AssetStatus | '';
  const q = params.get('q') ?? '';

  // The search box is local while typing and reaches the address a moment later.
  const [search, setSearch] = useState(q);
  useEffect(() => {
    if (search === q) {
      return;
    }
    const timer = window.setTimeout(() => change({ q: search, page: null }), SEARCH_DELAY_MS);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  function change(values: Record<string, string | null>) {
    setParams(
      (current) => {
        const next = new URLSearchParams(current);
        for (const [key, value] of Object.entries(values)) {
          if (value) {
            next.set(key, value);
          } else {
            next.delete(key);
          }
        }
        return next;
      },
      { replace: true },
    );
  }

  const assets = useQuery({
    queryKey: ['assets', { page, status, q }],
    queryFn: ({ signal }) =>
      assetsApi.list(
        { page, pageSize: PAGE_SIZE, status: status || undefined, q: q || undefined },
        signal,
      ),
    placeholderData: keepPreviousData,
    refetchInterval: (query) =>
      query.state.data?.items.some((asset) =>
        ['UPLOADING', 'UPLOADED', 'PROCESSING'].includes(asset.status),
      )
        ? REFRESH_MS
        : false,
  });

  return (
    <>
      <PageHeader title="Library">
        {can('assets:write') ? (
          <button
            type="button"
            className="button button-primary"
            onClick={() => setShowUpload((open) => !open)}
            aria-expanded={showUpload}
          >
            {showUpload ? 'Close upload' : 'Upload video'}
          </button>
        ) : null}
      </PageHeader>

      {showUpload ? <UploadForm /> : null}
      <UploadList />

      <div className="toolbar">
        <input
          type="search"
          placeholder="Search by title"
          aria-label="Search by title"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
        <select
          aria-label="Filter by status"
          value={status}
          onChange={(event) => change({ status: event.target.value, page: null })}
        >
          <option value="">All statuses</option>
          {ASSET_STATUSES.map((value) => (
            <option key={value} value={value}>
              {humanize(value)}
            </option>
          ))}
        </select>
        {assets.isFetching && !assets.isPending ? (
          <span className="spinner" aria-hidden="true" />
        ) : null}
      </div>

      <ErrorNote error={assets.error} />
      {assets.isPending ? <Spinner label="Loading the library" /> : null}

      {assets.data && assets.data.items.length === 0 ? (
        <EmptyState title={q || status ? 'Nothing matches' : 'The library is empty'}>
          {q || status
            ? 'Change the search or the filter to see more.'
            : 'Upload a video to get started.'}
        </EmptyState>
      ) : null}

      {assets.data && assets.data.items.length > 0 ? (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Title</th>
                <th>Status</th>
                <th>Length</th>
                <th>Picture</th>
                <th>Source</th>
                <th>Added</th>
              </tr>
            </thead>
            <tbody>
              {assets.data.items.map((asset) => (
                <tr key={asset.id}>
                  <td>
                    <Link to={`/assets/${asset.id}`} className="title-link">
                      {asset.title}
                    </Link>
                    {asset.encryption === 'AES_128' ? <span className="tag">Encrypted</span> : null}
                  </td>
                  <td>
                    <StatusBadge status={asset.status} />
                  </td>
                  <td>{formatDuration(asset.media.durationMs)}</td>
                  <td>{formatResolution(asset.media.width, asset.media.height)}</td>
                  <td>{formatBytes(asset.source.bytes)}</td>
                  <td>{formatDateTime(asset.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      {assets.data ? (
        <Pagination
          page={assets.data.page}
          pageSize={assets.data.pageSize}
          total={assets.data.total}
          onChange={(next) => change({ page: next > 1 ? String(next) : null })}
        />
      ) : null}
    </>
  );
}

function UploadForm() {
  const { start } = useUploads();
  const fileInput = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [title, setTitle] = useState('');
  const [encrypt, setEncrypt] = useState(false);
  const [mode, setMode] = useState<'' | 'COPY' | 'TRANSCODE'>('');

  const submit = (event: FormEvent) => {
    event.preventDefault();
    for (const file of files) {
      start(file, {
        // A typed title only makes sense for a single file.
        title: (files.length === 1 && title.trim()) || titleFromFileName(file.name),
        encryption: encrypt ? 'AES_128' : 'NONE',
        processingMode: mode || undefined,
      });
    }
    setFiles([]);
    setTitle('');
    if (fileInput.current) {
      fileInput.current.value = '';
    }
  };

  return (
    <form className="card upload-form" onSubmit={submit}>
      <h2>Upload video</h2>
      <label className="field">
        Files
        <input
          ref={fileInput}
          type="file"
          accept="video/*,.mkv,.mov,.ts,.m2ts,.webm"
          multiple
          required
          onChange={(event) => setFiles([...(event.target.files ?? [])])}
        />
        <span className="hint">You can choose several files. Each becomes its own asset.</span>
      </label>
      {files.length <= 1 ? (
        <label className="field">
          Title
          <input
            type="text"
            maxLength={200}
            placeholder="Taken from the file name when empty"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
          />
        </label>
      ) : null}
      <div className="field-row">
        <label className="field">
          Processing
          <select value={mode} onChange={(event) => setMode(event.target.value as typeof mode)}>
            <option value="">Automatic (recommended)</option>
            <option value="COPY">Copy without re-encoding</option>
            <option value="TRANSCODE">Transcode into all qualities</option>
          </select>
        </label>
        <label className="check">
          <input
            type="checkbox"
            checked={encrypt}
            onChange={(event) => setEncrypt(event.target.checked)}
          />
          Encrypt segments (AES-128)
        </label>
      </div>
      <div>
        <button type="submit" className="button button-primary" disabled={files.length === 0}>
          {files.length > 1 ? `Upload ${files.length} files` : 'Upload'}
        </button>
      </div>
    </form>
  );
}

function UploadList() {
  const { uploads, cancel, clearFinished } = useUploads();
  if (uploads.length === 0) {
    return null;
  }
  const hasFinished = uploads.some(
    (item) => item.status !== 'starting' && item.status !== 'uploading',
  );

  return (
    <section className="card" aria-label="Uploads">
      <div className="card-head">
        <h2>Uploads</h2>
        {hasFinished ? (
          <button type="button" className="button button-quiet" onClick={clearFinished}>
            Clear finished
          </button>
        ) : null}
      </div>
      <ul className="upload-list">
        {uploads.map((item) => (
          <li key={item.id}>
            <div className="upload-name">
              {item.assetId && item.status === 'done' ? (
                <Link to={`/assets/${item.assetId}`}>{item.title}</Link>
              ) : (
                <strong>{item.title}</strong>
              )}
              <span className="muted">
                {item.status === 'uploading' || item.status === 'starting'
                  ? `${formatBytes(item.sentBytes)} of ${formatBytes(item.totalBytes)}`
                  : item.status === 'done'
                    ? `Uploaded, ${formatBytes(item.totalBytes)}. Processing has started.`
                    : item.status === 'cancelled'
                      ? 'Cancelled'
                      : `Failed: ${item.error ?? 'unknown error'}`}
              </span>
            </div>
            {item.status === 'uploading' || item.status === 'starting' ? (
              <>
                <ProgressBar
                  percent={item.totalBytes > 0 ? (item.sentBytes / item.totalBytes) * 100 : 0}
                  label={`Upload of ${item.title}`}
                />
                <button
                  type="button"
                  className="button button-quiet"
                  onClick={() => cancel(item.id)}
                >
                  Cancel
                </button>
              </>
            ) : null}
          </li>
        ))}
      </ul>
    </section>
  );
}
