// SPDX-License-Identifier: AGPL-3.0-only
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { type FormEvent, useState } from 'react';
import { storageApi } from '../api/endpoints';
import type {
  CreateStoragePoolInput,
  StoragePool,
  StoragePoolTestResult,
  UpdateStoragePoolInput,
} from '../api/types';
import { useSession } from '../auth/session';
import { EmptyState, ErrorNote, PageHeader, ProgressBar, Spinner } from '../components/ui';
import { bytesToGigabytes, formatBytes, gigabytesToBytes, usagePercent } from '../lib/format';

/** Storage pools: the places where sources and streams are kept. */
export function StoragePage() {
  const { can } = useSession();
  const queryClient = useQueryClient();
  const mayWrite = can('storage:write');
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [tests, setTests] = useState<Record<string, StoragePoolTestResult | 'running'>>({});

  const pools = useQuery({
    queryKey: ['storage-pools'],
    queryFn: ({ signal }) => storageApi.list(signal),
  });
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['storage-pools'] });

  const update = useMutation({
    mutationFn: ({ id, body }: { id: string; body: UpdateStoragePoolInput }) =>
      storageApi.update(id, body),
    onSuccess: () => {
      setEditing(null);
      void refresh();
    },
  });

  const runTest = async (id: string) => {
    setTests((current) => ({ ...current, [id]: 'running' }));
    try {
      const result = await storageApi.test(id);
      setTests((current) => ({ ...current, [id]: result }));
    } catch (error) {
      setTests((current) => ({
        ...current,
        [id]: { ok: false, latencyMs: 0, error: error instanceof Error ? error.message : 'Failed' },
      }));
    }
  };

  return (
    <>
      <PageHeader title="Storage">
        {mayWrite && !creating ? (
          <button type="button" className="button button-primary" onClick={() => setCreating(true)}>
            New pool
          </button>
        ) : null}
      </PageHeader>
      <p className="muted lead">
        A pool is a folder on this server or an S3-compatible bucket. New uploads go to the default
        pool.
      </p>

      {creating ? (
        <CreatePoolForm
          onClose={() => setCreating(false)}
          onSaved={() => {
            setCreating(false);
            void refresh();
          }}
        />
      ) : null}

      <ErrorNote error={pools.error ?? (editing ? null : update.error)} />
      {pools.isPending ? <Spinner label="Loading pools" /> : null}
      {pools.data?.length === 0 ? (
        <EmptyState title="No pools yet">The first upload creates a local pool.</EmptyState>
      ) : null}

      {pools.data?.map((pool) => {
        const percent = usagePercent(pool.usedBytes, pool.quotaBytes);
        const test = tests[pool.id];
        return (
          <section className="card" key={pool.id}>
            <div className="card-head">
              <h2>
                {pool.name}
                {pool.isDefault ? <span className="tag">Default</span> : null}
                {!pool.isActive ? <span className="tag tag-bad">Inactive</span> : null}
              </h2>
              {mayWrite ? (
                <div className="button-row">
                  <button
                    type="button"
                    className="button button-quiet"
                    disabled={test === 'running'}
                    onClick={() => void runTest(pool.id)}
                  >
                    {test === 'running' ? 'Testing…' : 'Test connection'}
                  </button>
                  {!pool.isDefault && pool.isActive ? (
                    <button
                      type="button"
                      className="button button-quiet"
                      disabled={update.isPending}
                      onClick={() => update.mutate({ id: pool.id, body: { isDefault: true } })}
                    >
                      Make default
                    </button>
                  ) : null}
                  <button
                    type="button"
                    className="button button-quiet"
                    onClick={() => setEditing(editing === pool.id ? null : pool.id)}
                  >
                    {editing === pool.id ? 'Close' : 'Edit'}
                  </button>
                </div>
              ) : null}
            </div>

            {test && test !== 'running' ? (
              <p className={test.ok ? 'note note-ok' : 'note note-error'} role="status">
                {test.ok
                  ? `The connection works. Writing, reading and deleting took ${test.latencyMs} ms.`
                  : `The test failed: ${test.error ?? 'unknown error'}`}
              </p>
            ) : null}

            <dl className="facts">
              <dt>Type</dt>
              <dd>{pool.driver === 'LOCAL' ? 'Folder on this server' : 'S3-compatible bucket'}</dd>
              {pool.driver === 'LOCAL' ? (
                <>
                  <dt>Folder</dt>
                  <dd>
                    <code>{pool.config.basePath}</code>
                  </dd>
                </>
              ) : (
                <>
                  <dt>Bucket</dt>
                  <dd>
                    {pool.config.bucket}
                    {pool.config.keyPrefix ? ` / ${pool.config.keyPrefix}` : ''}
                  </dd>
                  <dt>Region</dt>
                  <dd>{pool.config.region}</dd>
                  <dt>Endpoint</dt>
                  <dd>{pool.config.endpoint ?? 'Amazon S3'}</dd>
                  <dt>Access key</dt>
                  <dd>
                    <code>{pool.config.accessKeyId}</code>
                  </dd>
                </>
              )}
              <dt>Used</dt>
              <dd>
                {formatBytes(pool.usedBytes)}
                {pool.quotaBytes ? ` of ${formatBytes(pool.quotaBytes)}` : ', no limit'}
              </dd>
            </dl>
            {percent !== null ? (
              <div className="usage">
                <ProgressBar percent={percent} label={`Space used in ${pool.name}`} />
              </div>
            ) : null}

            {editing === pool.id ? (
              <EditPoolForm
                pool={pool}
                error={update.error}
                busy={update.isPending}
                onSave={(body) => update.mutate({ id: pool.id, body })}
              />
            ) : null}
          </section>
        );
      })}
    </>
  );
}

function EditPoolForm({
  pool,
  error,
  busy,
  onSave,
}: {
  pool: StoragePool;
  error: unknown;
  busy: boolean;
  onSave: (body: UpdateStoragePoolInput) => void;
}) {
  const [name, setName] = useState(pool.name);
  const [quota, setQuota] = useState(bytesToGigabytes(pool.quotaBytes));
  const [isActive, setIsActive] = useState(pool.isActive);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    onSave({
      name: name.trim(),
      quotaBytes: quota.trim() ? gigabytesToBytes(quota) : null,
      // The default pool must stay active, so the field is only sent for other pools.
      ...(pool.isDefault ? {} : { isActive }),
    });
  };

  return (
    <form className="inline-form" onSubmit={submit}>
      <div className="field-row">
        <label className="field grow">
          Name
          <input
            type="text"
            required
            maxLength={64}
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
        </label>
        <label className="field">
          Limit (GB)
          <input
            type="number"
            min={0.01}
            step="any"
            placeholder="No limit"
            value={quota}
            onChange={(event) => setQuota(event.target.value)}
          />
        </label>
        {!pool.isDefault ? (
          <label className="check">
            <input
              type="checkbox"
              checked={isActive}
              onChange={(event) => setIsActive(event.target.checked)}
            />
            Active
          </label>
        ) : null}
      </div>
      <p className="hint">
        The folder or bucket of a pool cannot be changed here, because files already stored would no
        longer be found.
      </p>
      <ErrorNote error={error} />
      <button type="submit" className="button button-primary" disabled={busy}>
        Save
      </button>
    </form>
  );
}

function CreatePoolForm({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [driver, setDriver] = useState<'LOCAL' | 'S3'>('S3');
  const [name, setName] = useState('');
  const [quota, setQuota] = useState('');
  const [isDefault, setIsDefault] = useState(false);
  const [basePath, setBasePath] = useState('');
  const [s3, setS3] = useState({
    bucket: '',
    region: 'us-east-1',
    endpoint: '',
    keyPrefix: '',
    accessKeyId: '',
    secretAccessKey: '',
    forcePathStyle: false,
  });
  const setS3Field = (values: Partial<typeof s3>) =>
    setS3((current) => ({ ...current, ...values }));

  const create = useMutation({
    mutationFn: () => {
      const shared = {
        name: name.trim(),
        isDefault,
        quotaBytes: gigabytesToBytes(quota) ?? undefined,
      };
      const body: CreateStoragePoolInput =
        driver === 'LOCAL'
          ? { ...shared, driver, config: { basePath: basePath.trim() } }
          : {
              ...shared,
              driver,
              config: {
                bucket: s3.bucket.trim(),
                region: s3.region.trim(),
                endpoint: s3.endpoint.trim() || undefined,
                keyPrefix: s3.keyPrefix.trim() || undefined,
                accessKeyId: s3.accessKeyId.trim(),
                secretAccessKey: s3.secretAccessKey,
                forcePathStyle: s3.forcePathStyle,
              },
            };
      return storageApi.create(body);
    },
    onSuccess: onSaved,
  });

  const submit = (event: FormEvent) => {
    event.preventDefault();
    create.mutate();
  };

  return (
    <form className="card" onSubmit={submit}>
      <h2>New pool</h2>
      <div className="field-row">
        <label className="field">
          Type
          <select
            value={driver}
            onChange={(event) => setDriver(event.target.value as 'LOCAL' | 'S3')}
          >
            <option value="S3">S3-compatible bucket</option>
            <option value="LOCAL">Folder on this server</option>
          </select>
        </label>
        <label className="field grow">
          Name
          <input
            type="text"
            required
            maxLength={64}
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
        </label>
        <label className="field">
          Limit (GB)
          <input
            type="number"
            min={0.01}
            step="any"
            placeholder="No limit"
            value={quota}
            onChange={(event) => setQuota(event.target.value)}
          />
        </label>
      </div>

      {driver === 'LOCAL' ? (
        <label className="field">
          Folder
          <input
            type="text"
            required
            placeholder="/var/lib/onyx/storage"
            value={basePath}
            onChange={(event) => setBasePath(event.target.value)}
          />
          <span className="hint">An absolute path that the API and the workers can write to.</span>
        </label>
      ) : (
        <>
          <div className="field-row">
            <label className="field grow">
              Bucket
              <input
                type="text"
                required
                value={s3.bucket}
                onChange={(event) => setS3Field({ bucket: event.target.value })}
              />
            </label>
            <label className="field">
              Region
              <input
                type="text"
                required
                value={s3.region}
                onChange={(event) => setS3Field({ region: event.target.value })}
              />
            </label>
          </div>
          <div className="field-row">
            <label className="field grow">
              Endpoint
              <input
                type="url"
                placeholder="Empty for Amazon S3, or https://s3.example.com"
                value={s3.endpoint}
                onChange={(event) => setS3Field({ endpoint: event.target.value })}
              />
            </label>
            <label className="field">
              Folder in the bucket
              <input
                type="text"
                placeholder="Optional"
                value={s3.keyPrefix}
                onChange={(event) => setS3Field({ keyPrefix: event.target.value })}
              />
            </label>
          </div>
          <div className="field-row">
            <label className="field grow">
              Access key ID
              <input
                type="text"
                required
                autoComplete="off"
                value={s3.accessKeyId}
                onChange={(event) => setS3Field({ accessKeyId: event.target.value })}
              />
            </label>
            <label className="field grow">
              Secret access key
              <input
                type="password"
                required
                autoComplete="new-password"
                value={s3.secretAccessKey}
                onChange={(event) => setS3Field({ secretAccessKey: event.target.value })}
              />
            </label>
          </div>
          <label className="check">
            <input
              type="checkbox"
              checked={s3.forcePathStyle}
              onChange={(event) => setS3Field({ forcePathStyle: event.target.checked })}
            />
            Use path-style addresses (needed by MinIO and some other services)
          </label>
        </>
      )}

      <label className="check">
        <input
          type="checkbox"
          checked={isDefault}
          onChange={(event) => setIsDefault(event.target.checked)}
        />
        Make this the default pool for new uploads
      </label>

      <ErrorNote error={create.error} />
      <div className="button-row">
        <span className="grow" />
        <button type="button" className="button" onClick={onClose}>
          Cancel
        </button>
        <button type="submit" className="button button-primary" disabled={create.isPending}>
          {create.isPending ? 'Creating…' : 'Create pool'}
        </button>
      </div>
    </form>
  );
}
