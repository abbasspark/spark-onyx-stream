// SPDX-License-Identifier: AGPL-3.0-only
import { NavLink, Outlet } from 'react-router';
import { useSession } from '../auth/session';
import { useUploads } from '../uploads/uploads';
import { humanize } from '../lib/format';

/** The frame around every signed-in page: navigation on the left, the page on the right. */
export function Layout() {
  const { state, signOut, can } = useSession();
  const { uploads } = useUploads();
  const activeUploads = uploads.filter(
    (item) => item.status === 'starting' || item.status === 'uploading',
  ).length;

  if (state.status !== 'signedIn') {
    return null;
  }

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true" />
          Onyx Stream
        </div>
        <nav aria-label="Main">
          <NavLink to="/assets" className="nav-link">
            Library
            {activeUploads > 0 ? <span className="nav-count">{activeUploads}</span> : null}
          </NavLink>
          {can('jobs:read') ? (
            <NavLink to="/jobs" className="nav-link">
              Jobs
            </NavLink>
          ) : null}
          <span className="nav-heading">Settings</span>
          {can('encoding-profiles:read') ? (
            <NavLink to="/encoding-profiles" className="nav-link">
              Encoding profiles
            </NavLink>
          ) : null}
          {can('storage:read') ? (
            <NavLink to="/storage" className="nav-link">
              Storage
            </NavLink>
          ) : null}
          {can('admins:read') ? (
            <NavLink to="/admins" className="nav-link">
              Admins
            </NavLink>
          ) : null}
          {can('api-keys:read') ? (
            <NavLink to="/api-keys" className="nav-link">
              API keys
            </NavLink>
          ) : null}
          {can('audit:read') ? (
            <NavLink to="/audit" className="nav-link">
              Audit log
            </NavLink>
          ) : null}
        </nav>
        <div className="sidebar-foot">
          <NavLink to="/account" className="who nav-link">
            <strong>{state.me.displayName}</strong>
            <span className="muted">{humanize(state.me.role)}</span>
          </NavLink>
          <button type="button" className="button button-quiet" onClick={() => void signOut()}>
            Sign out
          </button>
        </div>
      </aside>
      <main className="content">
        <Outlet />
      </main>
    </div>
  );
}
