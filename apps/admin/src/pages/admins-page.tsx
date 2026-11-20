// SPDX-License-Identifier: AGPL-3.0-only
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { type FormEvent, useState } from 'react';
import { adminsApi } from '../api/endpoints';
import { ADMIN_ROLES, type Admin, type AdminRole, type UpdateAdminInput } from '../api/types';
import { useSession } from '../auth/session';
import { ErrorNote, PageHeader, Pagination, Spinner } from '../components/ui';
import { formatDateTime, humanize } from '../lib/format';

const PAGE_SIZE = 25;

const ROLE_HELP: Record<AdminRole, string> = {
  OWNER: 'Everything, including other admins',
  ADMIN: 'Everything except managing admins',
  EDITOR: 'Upload and manage videos',
  VIEWER: 'Read only',
};

/** The people who can sign in to this panel. */
export function AdminsPage() {
  const { state, can } = useSession();
  const queryClient = useQueryClient();
  const mayWrite = can('admins:write');
  const myId = state.status === 'signedIn' ? state.me.adminId : '';
  const [page, setPage] = useState(1);
  const [creating, setCreating] = useState(false);
  const [resetting, setResetting] = useState<string | null>(null);

  const admins = useQuery({
    queryKey: ['admins', page],
    queryFn: ({ signal }) => adminsApi.list({ page, pageSize: PAGE_SIZE }, signal),
    placeholderData: keepPreviousData,
  });
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['admins'] });

  const update = useMutation({
    mutationFn: ({ id, body }: { id: string; body: UpdateAdminInput }) =>
      adminsApi.update(id, body),
    onSuccess: () => {
      setResetting(null);
      void refresh();
    },
  });

  return (
    <>
      <PageHeader title="Admins">
        {mayWrite && !creating ? (
          <button type="button" className="button button-primary" onClick={() => setCreating(true)}>
            New admin
          </button>
        ) : null}
      </PageHeader>

      {creating ? (
        <CreateAdminForm
          onClose={() => setCreating(false)}
          onSaved={() => {
            setCreating(false);
            void refresh();
          }}
        />
      ) : null}

      <ErrorNote error={admins.error ?? (resetting ? null : update.error)} />
      {admins.isPending ? <Spinner label="Loading admins" /> : null}

      {admins.data ? (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Role</th>
                <th>Status</th>
                <th>Last sign-in</th>
                <th aria-label="Actions" />
              </tr>
            </thead>
            <tbody>
              {admins.data.items.map((admin) => (
                <AdminRow
                  key={admin.id}
                  admin={admin}
                  isMe={admin.id === myId}
                  mayWrite={mayWrite}
                  busy={update.isPending}
                  resetting={resetting === admin.id}
                  resetError={resetting === admin.id ? update.error : null}
                  onToggleReset={() => setResetting(resetting === admin.id ? null : admin.id)}
                  onUpdate={(body) => update.mutate({ id: admin.id, body })}
                />
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      {admins.data ? (
        <Pagination
          page={admins.data.page}
          pageSize={admins.data.pageSize}
          total={admins.data.total}
          onChange={setPage}
        />
      ) : null}
    </>
  );
}

interface AdminRowProps {
  admin: Admin;
  isMe: boolean;
  mayWrite: boolean;
  busy: boolean;
  resetting: boolean;
  resetError: unknown;
  onToggleReset: () => void;
  onUpdate: (body: UpdateAdminInput) => void;
}

function AdminRow(props: AdminRowProps) {
  const { admin, isMe, mayWrite, busy } = props;
  const [password, setPassword] = useState('');
  // An admin does not change their own role or switch themselves off by accident.
  const editable = mayWrite && !isMe;

  const submitReset = (event: FormEvent) => {
    event.preventDefault();
    props.onUpdate({ password });
    setPassword('');
  };

  return (
    <>
      <tr>
        <td>
          <strong>{admin.displayName}</strong>
          {isMe ? <span className="tag">You</span> : null}
          <div className="muted">{admin.email}</div>
        </td>
        <td>
          {editable ? (
            <select
              aria-label={`Role of ${admin.displayName}`}
              value={admin.role}
              disabled={busy}
              onChange={(event) => props.onUpdate({ role: event.target.value as AdminRole })}
            >
              {ADMIN_ROLES.map((role) => (
                <option key={role} value={role}>
                  {humanize(role)}
                </option>
              ))}
            </select>
          ) : (
            humanize(admin.role)
          )}
        </td>
        <td>
          <span className={`badge ${admin.isActive ? 'badge-ok' : 'badge-idle'}`}>
            {admin.isActive ? 'Active' : 'Deactivated'}
          </span>
        </td>
        <td>{formatDateTime(admin.lastLoginAt)}</td>
        <td className="col-actions">
          {editable ? (
            <>
              <button type="button" className="button button-quiet" onClick={props.onToggleReset}>
                {props.resetting ? 'Close' : 'Set password'}
              </button>{' '}
              <button
                type="button"
                className={`button button-quiet ${admin.isActive ? 'button-danger' : ''}`}
                disabled={busy}
                onClick={() => {
                  if (
                    !admin.isActive ||
                    window.confirm(`Deactivate ${admin.displayName}? They are signed out at once.`)
                  ) {
                    props.onUpdate({ isActive: !admin.isActive });
                  }
                }}
              >
                {admin.isActive ? 'Deactivate' : 'Activate'}
              </button>
            </>
          ) : null}
        </td>
      </tr>
      {props.resetting ? (
        <tr>
          <td colSpan={5}>
            <form className="inline-form" onSubmit={submitReset}>
              <div className="field-row">
                <label className="field grow">
                  New password for {admin.displayName}
                  <input
                    type="password"
                    required
                    minLength={12}
                    autoComplete="new-password"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                  />
                  <span className="hint">
                    At least 12 characters. They are signed out everywhere and must use the new
                    password.
                  </span>
                </label>
                <button type="submit" className="button button-primary" disabled={busy}>
                  Set password
                </button>
              </div>
              <ErrorNote error={props.resetError} />
            </form>
          </td>
        </tr>
      ) : null}
    </>
  );
}

function CreateAdminForm({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [email, setEmail] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<AdminRole>('EDITOR');

  const create = useMutation({
    mutationFn: () =>
      adminsApi.create({ email: email.trim(), displayName: displayName.trim(), password, role }),
    onSuccess: onSaved,
  });

  const submit = (event: FormEvent) => {
    event.preventDefault();
    create.mutate();
  };

  return (
    <form className="card" onSubmit={submit}>
      <h2>New admin</h2>
      <div className="field-row">
        <label className="field grow">
          Name
          <input
            type="text"
            required
            maxLength={100}
            value={displayName}
            onChange={(event) => setDisplayName(event.target.value)}
          />
        </label>
        <label className="field grow">
          Email
          <input
            type="email"
            required
            autoComplete="off"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
        </label>
      </div>
      <div className="field-row">
        <label className="field grow">
          Password
          <input
            type="password"
            required
            minLength={12}
            autoComplete="new-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
          <span className="hint">At least 12 characters. Give it to the person in a safe way.</span>
        </label>
        <label className="field">
          Role
          <select value={role} onChange={(event) => setRole(event.target.value as AdminRole)}>
            {ADMIN_ROLES.map((value) => (
              <option key={value} value={value}>
                {humanize(value)}
              </option>
            ))}
          </select>
          <span className="hint">{ROLE_HELP[role]}</span>
        </label>
      </div>
      <ErrorNote error={create.error} />
      <div className="button-row">
        <span className="grow" />
        <button type="button" className="button" onClick={onClose}>
          Cancel
        </button>
        <button type="submit" className="button button-primary" disabled={create.isPending}>
          {create.isPending ? 'Creating…' : 'Create admin'}
        </button>
      </div>
    </form>
  );
}
