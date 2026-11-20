// SPDX-License-Identifier: AGPL-3.0-only
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { type FormEvent, useState } from 'react';
import { apiKeysApi } from '../api/endpoints';
import type { ApiKey, CreatedApiKey, Permission } from '../api/types';
import { useSession } from '../auth/session';
import { EmptyState, ErrorNote, PageHeader, Spinner } from '../components/ui';
import { formatDateTime } from '../lib/format';

/** What a key can be allowed to do. Managing admins and keys can never be given to a key. */
const SCOPE_GROUPS: { label: string; read: Permission; write?: Permission }[] = [
  { label: 'Videos', read: 'assets:read', write: 'assets:write' },
  { label: 'Jobs', read: 'jobs:read', write: 'jobs:write' },
  { label: 'Encoding profiles', read: 'encoding-profiles:read', write: 'encoding-profiles:write' },
  { label: 'Storage', read: 'storage:read', write: 'storage:write' },
  { label: 'Settings', read: 'settings:read', write: 'settings:write' },
  { label: 'Admins', read: 'admins:read' },
  { label: 'API keys', read: 'api-keys:read' },
  { label: 'Audit log', read: 'audit:read' },
];

function keyState(key: ApiKey): { label: string; tone: 'ok' | 'idle' | 'bad' } {
  if (key.revokedAt) {
    return { label: 'Revoked', tone: 'idle' };
  }
  if (key.expiresAt && new Date(key.expiresAt).getTime() <= Date.now()) {
    return { label: 'Expired', tone: 'bad' };
  }
  return { label: 'Active', tone: 'ok' };
}

/** Keys that let other programs use the API without a person signing in. */
export function ApiKeysPage() {
  const { state, can } = useSession();
  const queryClient = useQueryClient();
  const mayWrite = can('api-keys:write');
  const myPermissions = state.status === 'signedIn' ? state.me.permissions : [];
  const [creating, setCreating] = useState(false);
  const [created, setCreated] = useState<CreatedApiKey | null>(null);

  const keys = useQuery({
    queryKey: ['api-keys'],
    queryFn: ({ signal }) => apiKeysApi.list(signal),
  });
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['api-keys'] });
  const revoke = useMutation({ mutationFn: apiKeysApi.revoke, onSuccess: refresh });

  return (
    <>
      <PageHeader title="API keys">
        {mayWrite && !creating ? (
          <button
            type="button"
            className="button button-primary"
            onClick={() => {
              setCreated(null);
              setCreating(true);
            }}
          >
            New key
          </button>
        ) : null}
      </PageHeader>
      <p className="muted lead">
        A key lets a script or another system call the API. Send it as{' '}
        <code>Authorization: Bearer …</code>.
      </p>

      {created ? <NewKeyNotice created={created} onClose={() => setCreated(null)} /> : null}

      {creating ? (
        <CreateKeyForm
          allowed={myPermissions}
          onClose={() => setCreating(false)}
          onSaved={(key) => {
            setCreating(false);
            setCreated(key);
            void refresh();
          }}
        />
      ) : null}

      <ErrorNote error={keys.error ?? revoke.error} />
      {keys.isPending ? <Spinner label="Loading keys" /> : null}
      {keys.data?.length === 0 ? (
        <EmptyState title="No API keys">Create one to let another program use the API.</EmptyState>
      ) : null}

      {keys.data && keys.data.length > 0 ? (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Status</th>
                <th>May do</th>
                <th>Last used</th>
                <th>Expires</th>
                <th aria-label="Actions" />
              </tr>
            </thead>
            <tbody>
              {keys.data.map((key) => {
                const status = keyState(key);
                return (
                  <tr key={key.id}>
                    <td>
                      <strong>{key.name}</strong>
                      <div className="muted">
                        <code>{key.prefix}…</code> by {key.createdBy.displayName}
                      </div>
                    </td>
                    <td>
                      <span className={`badge badge-${status.tone}`}>{status.label}</span>
                    </td>
                    <td className="scopes">{key.scopes.join(', ')}</td>
                    <td>{key.lastUsedAt ? formatDateTime(key.lastUsedAt) : 'Never'}</td>
                    <td>{key.expiresAt ? formatDateTime(key.expiresAt) : 'Never'}</td>
                    <td className="col-actions">
                      {mayWrite && !key.revokedAt ? (
                        <button
                          type="button"
                          className="button button-quiet button-danger"
                          disabled={revoke.isPending}
                          onClick={() => {
                            if (
                              window.confirm(
                                `Revoke "${key.name}"? Programs using it stop working at once.`,
                              )
                            ) {
                              revoke.mutate(key.id);
                            }
                          }}
                        >
                          Revoke
                        </button>
                      ) : null}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : null}
    </>
  );
}

function NewKeyNotice({ created, onClose }: { created: CreatedApiKey; onClose: () => void }) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(created.key);
      setCopied(true);
    } catch {
      // The clipboard can be blocked. The key stays visible to copy by hand.
      setCopied(false);
    }
  };

  return (
    <section className="card card-notice" role="status">
      <h2>Copy the key for "{created.name}" now</h2>
      <p>This is the only time the full key is shown. It cannot be shown again later.</p>
      <div className="secret">
        <code>{created.key}</code>
        <button type="button" className="button" onClick={() => void copy()}>
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      <button type="button" className="button button-quiet" onClick={onClose}>
        I have stored it
      </button>
    </section>
  );
}

function CreateKeyForm({
  allowed,
  onClose,
  onSaved,
}: {
  allowed: readonly Permission[];
  onClose: () => void;
  onSaved: (key: CreatedApiKey) => void;
}) {
  const [name, setName] = useState('');
  const [scopes, setScopes] = useState<Set<Permission>>(new Set(['assets:read']));
  const [expiry, setExpiry] = useState('');

  const create = useMutation({
    mutationFn: () =>
      apiKeysApi.create({
        name: name.trim(),
        scopes: [...scopes],
        // The field holds local time. The API wants a moment with a time zone.
        expiresAt: expiry ? new Date(expiry).toISOString() : undefined,
      }),
    onSuccess: onSaved,
  });

  const toggle = (scope: Permission) =>
    setScopes((current) => {
      const next = new Set(current);
      if (next.has(scope)) {
        next.delete(scope);
      } else {
        next.add(scope);
      }
      return next;
    });

  const submit = (event: FormEvent) => {
    event.preventDefault();
    create.mutate();
  };

  const box = (scope: Permission | undefined, label: string) =>
    scope ? (
      <label className="check">
        <input
          type="checkbox"
          checked={scopes.has(scope)}
          // A key can never be allowed more than the admin who creates it.
          disabled={!allowed.includes(scope)}
          onChange={() => toggle(scope)}
        />
        {label}
      </label>
    ) : null;

  return (
    <form className="card" onSubmit={submit}>
      <h2>New key</h2>
      <div className="field-row">
        <label className="field grow">
          Name
          <input
            type="text"
            required
            maxLength={100}
            placeholder="What will use this key, for example: website import"
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
        </label>
        <label className="field">
          Expires
          <input
            type="datetime-local"
            value={expiry}
            onChange={(event) => setExpiry(event.target.value)}
          />
          <span className="hint">Empty means never.</span>
        </label>
      </div>

      <fieldset className="scope-grid">
        <legend>What the key may do</legend>
        {SCOPE_GROUPS.map((group) => (
          <div className="scope-row" key={group.label}>
            <span>{group.label}</span>
            {box(group.read, 'Read')}
            {box(group.write, 'Change')}
          </div>
        ))}
      </fieldset>
      <p className="hint">
        Give a key only what it needs. A key can never manage admins or other keys.
      </p>

      <ErrorNote error={create.error} />
      <div className="button-row">
        <span className="grow" />
        <button type="button" className="button" onClick={onClose}>
          Cancel
        </button>
        <button
          type="submit"
          className="button button-primary"
          disabled={create.isPending || scopes.size === 0}
        >
          {create.isPending ? 'Creating…' : 'Create key'}
        </button>
      </div>
    </form>
  );
}
