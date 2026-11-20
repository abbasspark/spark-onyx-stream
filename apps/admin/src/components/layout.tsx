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
        </nav>
        <div className="sidebar-foot">
          <div className="who">
            <strong>{state.me.displayName}</strong>
            <span className="muted">{humanize(state.me.role)}</span>
          </div>
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
