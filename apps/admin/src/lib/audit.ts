// SPDX-License-Identifier: AGPL-3.0-only

/** What each action code of the audit log means, in words. */
const ACTION_LABELS: Record<string, string> = {
  'channel.create': 'Created a channel',
  'channel.update': 'Changed a channel',
  'channel.delete': 'Deleted a channel',
  'channel.start': 'Started a channel',
  'channel.stop': 'Stopped a channel',
  'channel.restart': 'Restarted a channel',
  'channel.stream-key': 'Replaced the stream key of a channel',
  'auth.setup': 'Created the first admin',
  'auth.login': 'Signed in',
  'auth.login_failed': 'Failed sign-in',
  'auth.logout': 'Signed out',
  'auth.password_change': 'Changed their password',
  'admin.create': 'Added an admin',
  'admin.update': 'Changed an admin',
  'api_key.create': 'Created an API key',
  'api_key.revoke': 'Revoked an API key',
  'asset.create': 'Added a video',
  'asset.update': 'Changed a video',
  'asset.delete': 'Deleted a video',
  'asset.reprocess': 'Processed a video again',
  'asset.upload_complete': 'Finished an upload',
  'title.create': 'Added a title',
  'title.update': 'Changed a title',
  'title.publish': 'Published a title',
  'title.unpublish': 'Unpublished a title',
  'title.archive': 'Archived a title',
  'title.delete': 'Deleted a title',
  'season.delete': 'Deleted a season',
  'episode.publish': 'Published an episode',
  'episode.unpublish': 'Unpublished an episode',
  'viewer.create': 'Added a viewer',
  'viewer.update': 'Changed a viewer',
  'viewer.disable': 'Disabled a viewer',
  'viewer.enable': 'Enabled a viewer',
  'viewer.password_reset': 'Set a new password for a viewer',
  'viewer.sign_out': 'Signed a viewer out everywhere',
  'viewer.delete': 'Deleted a viewer',
  'category.create': 'Added a category',
  'category.update': 'Changed a category',
  'category.delete': 'Deleted a category',
  'job.cancel': 'Cancelled a job',
  'job.retry': 'Retried a job',
  'storage_pool.create': 'Added a storage pool',
  'storage_pool.update': 'Changed a storage pool',
  'encoding_profile.create': 'Added an encoding profile',
  'encoding_profile.update': 'Changed an encoding profile',
  'encoding_profile.delete': 'Deleted an encoding profile',
};

/** Describes an audit action in words. Unknown codes are shown as they are. */
export function describeAction(action: string): string {
  return ACTION_LABELS[action] ?? action;
}

/** The name an entry is about, when its details carry one. */
export function subjectOf(metadata: unknown): string | null {
  if (metadata && typeof metadata === 'object') {
    const record = metadata as Record<string, unknown>;
    for (const key of ['title', 'name', 'email']) {
      if (typeof record[key] === 'string' && record[key]) {
        return record[key] as string;
      }
    }
  }
  return null;
}
