// SPDX-License-Identifier: AGPL-3.0-only
import type { Viewer, ViewerSession, ViewerStatus } from '@onyx/database';

/** A viewer as they see themselves. */
export interface ViewerView {
  id: string;
  email: string;
  displayName: string;
  /** Whether the viewer showed that the address is theirs. */
  emailVerified: boolean;
  createdAt: Date;
}

export function toViewerView(viewer: Viewer): ViewerView {
  return {
    id: viewer.id,
    email: viewer.email,
    displayName: viewer.displayName,
    emailVerified: viewer.emailVerifiedAt !== null,
    createdAt: viewer.createdAt,
  };
}

/** A device a viewer is signed in on. */
export interface ViewerSessionView {
  id: string;
  /** The browser or app, as it named itself. */
  userAgent: string | null;
  createdAt: Date;
  lastUsedAt: Date;
  expiresAt: Date;
  /** Whether this is the session the request came with. */
  current: boolean;
}

export function toViewerSessionView(
  session: ViewerSession,
  currentSessionId: string | null,
): ViewerSessionView {
  return {
    id: session.id,
    userAgent: session.userAgent,
    createdAt: session.createdAt,
    lastUsedAt: session.lastUsedAt,
    expiresAt: session.expiresAt,
    current: session.id === currentSessionId,
  };
}

/** A viewer as admins see them in the panel. */
export interface ViewerAdminView extends ViewerView {
  status: ViewerStatus;
  emailVerifiedAt: Date | null;
  lastLoginAt: Date | null;
  updatedAt: Date;
  /** Devices signed in right now. */
  activeSessions: number;
}

export function toViewerAdminView(viewer: Viewer, activeSessions: number): ViewerAdminView {
  return {
    ...toViewerView(viewer),
    status: viewer.status,
    emailVerifiedAt: viewer.emailVerifiedAt,
    lastLoginAt: viewer.lastLoginAt,
    updatedAt: viewer.updatedAt,
    activeSessions,
  };
}

/** A session as admins see it: with the address it was opened from. */
export interface ViewerSessionAdminView extends Omit<ViewerSessionView, 'current'> {
  ipAddress: string | null;
}

export interface ViewerAdminDetail extends ViewerAdminView {
  sessions: ViewerSessionAdminView[];
}
