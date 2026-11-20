// SPDX-License-Identifier: AGPL-3.0-only
import { useMutation } from '@tanstack/react-query';
import { type FormEvent, useState } from 'react';
import { authApi } from '../api/endpoints';
import { useSession } from '../auth/session';
import { ErrorNote, PageHeader } from '../components/ui';
import { humanize } from '../lib/format';

/** The signed-in admin's own account. */
export function AccountPage() {
  const { state } = useSession();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [repeat, setRepeat] = useState('');
  const [mismatch, setMismatch] = useState(false);

  const change = useMutation({
    mutationFn: () => authApi.changePassword({ currentPassword, newPassword }),
    onSuccess: () => {
      setCurrentPassword('');
      setNewPassword('');
      setRepeat('');
    },
  });

  if (state.status !== 'signedIn') {
    return null;
  }

  const submit = (event: FormEvent) => {
    event.preventDefault();
    change.reset();
    if (newPassword !== repeat) {
      setMismatch(true);
      return;
    }
    setMismatch(false);
    change.mutate();
  };

  return (
    <>
      <PageHeader title="My account" />
      <section className="card">
        <dl className="facts">
          <dt>Name</dt>
          <dd>{state.me.displayName}</dd>
          <dt>Email</dt>
          <dd>{state.me.email}</dd>
          <dt>Role</dt>
          <dd>{humanize(state.me.role)}</dd>
        </dl>
      </section>

      <form className="card narrow-card" onSubmit={submit}>
        <h2>Change password</h2>
        <label className="field">
          Current password
          <input
            type="password"
            required
            autoComplete="current-password"
            value={currentPassword}
            onChange={(event) => setCurrentPassword(event.target.value)}
          />
        </label>
        <label className="field">
          New password
          <input
            type="password"
            required
            minLength={12}
            autoComplete="new-password"
            value={newPassword}
            onChange={(event) => setNewPassword(event.target.value)}
          />
          <span className="hint">At least 12 characters.</span>
        </label>
        <label className="field">
          New password again
          <input
            type="password"
            required
            autoComplete="new-password"
            value={repeat}
            onChange={(event) => setRepeat(event.target.value)}
          />
        </label>
        {mismatch ? (
          <p className="note note-error" role="alert">
            The two new passwords are not the same.
          </p>
        ) : null}
        <ErrorNote error={change.error} />
        {change.isSuccess ? (
          <p className="note note-ok" role="status">
            Your password is changed. Other devices were signed out.
          </p>
        ) : null}
        <div>
          <button type="submit" className="button button-primary" disabled={change.isPending}>
            Change password
          </button>
        </div>
      </form>
    </>
  );
}
