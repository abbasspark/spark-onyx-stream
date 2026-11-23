// SPDX-License-Identifier: AGPL-3.0-only
import { isPermission, type Permission } from './permissions.js';

/** A part of the panel a role can be let into, in words a person reads. */
export interface PermissionArea {
  /** The first half of the permission: `catalog` for `catalog:read`. */
  key: string;
  label: string;
  /** What seeing this area means. */
  read: { permission: Permission; description: string };
  /** What changing it means. Missing for areas that can only be seen. */
  write: { permission: Permission; description: string } | null;
  /**
   * Set on areas that reach beyond their own page: changing admins, for
   * instance, is a way to every other permission. The panel shows a warning.
   */
  sensitive: boolean;
}

export interface PermissionSection {
  key: string;
  label: string;
  description: string;
  areas: PermissionArea[];
}

function area(
  key: string,
  label: string,
  read: string,
  write: string | null,
  sensitive = false,
): PermissionArea {
  const readPermission = `${key}:read`;
  const writePermission = `${key}:write`;
  if (!isPermission(readPermission) || (write !== null && !isPermission(writePermission))) {
    throw new Error(`The permission catalogue names an area the code does not know: ${key}`);
  }
  return {
    key,
    label,
    read: { permission: readPermission, description: read },
    write:
      write !== null && isPermission(writePermission)
        ? { permission: writePermission, description: write }
        : null,
    sensitive,
  };
}

/**
 * Every permission, grouped the way the panel is, with a sentence for each.
 * The roles page is drawn from this, so a new permission shows up there once
 * it is added here. A test makes sure none is left out.
 */
export const PERMISSION_CATALOG: readonly PermissionSection[] = [
  {
    key: 'content',
    label: 'Content',
    description: 'Titles, the files behind them and live television.',
    areas: [
      area(
        'catalog',
        'Catalog',
        'See titles, seasons, people, categories, genres, collections and the page layouts.',
        'Create, change, publish and delete them, import from TMDB and translate.',
      ),
      area(
        'assets',
        'Media files',
        'See uploaded videos, their renditions and subtitles, and play them.',
        'Upload, replace and delete videos and subtitles.',
      ),
      area(
        'jobs',
        'Processing jobs',
        'See the encoding queue and what failed.',
        'Retry and cancel jobs.',
      ),
      area(
        'encoding-profiles',
        'Encoding profiles',
        'See the quality ladders videos are encoded to.',
        'Create, change and delete encoding profiles.',
      ),
      area(
        'live',
        'Live TV',
        'See channels, the programme guide and recordings.',
        'Create and change channels, start and stop them, load the guide and record.',
      ),
    ],
  },
  {
    key: 'audience',
    label: 'Audience and money',
    description: 'The people who watch, what they watch and what they pay.',
    areas: [
      area(
        'viewers',
        'Viewers',
        'See viewer accounts, their profiles, devices, lists and what is playing now.',
        'Create, change, block and delete viewers, sign them out and stop their streams.',
      ),
      area(
        'analytics',
        'Analytics',
        'See watch figures, popular titles and audience reports.',
        null,
      ),
      area(
        'billing',
        'Billing',
        'See plans, packages, coupons, subscriptions, purchases, payments and revenue.',
        'Change plans, prices and coupons, grant and cancel access, record and refund payments.',
        true,
      ),
    ],
  },
  {
    key: 'system',
    label: 'System',
    description: 'Where files live, how they reach viewers and how the installation runs.',
    areas: [
      area(
        'storage',
        'Storage',
        'See storage pools and how full they are.',
        'Add, change and remove storage pools, and move files between them.',
      ),
      area(
        'delivery',
        'Delivery',
        'See edge servers, their traffic and peer-to-peer sharing.',
        'Add, change and remove edge servers, and change how sharing works.',
      ),
      area(
        'settings',
        'Settings',
        'See diagnostics, email settings and backups.',
        'Change email settings, send test mail, and make, download and delete backups.',
        true,
      ),
    ],
  },
  {
    key: 'access',
    label: 'Access',
    description: 'Who can sign in to this panel, and what programs may do on their behalf.',
    areas: [
      area(
        'admins',
        'Admins and roles',
        'See the admins of this panel and the roles.',
        'Invite and deactivate admins, reset their passwords, and create and change roles.',
        true,
      ),
      area(
        'api-keys',
        'API keys',
        'See the API keys and what each may do.',
        'Create and revoke API keys.',
        true,
      ),
      area('audit', 'Audit log', 'See who did what, and when.', null),
    ],
  },
];

/** Every permission the catalogue names, for the test that none is forgotten. */
export function catalogPermissions(): Permission[] {
  return PERMISSION_CATALOG.flatMap((section) =>
    section.areas.flatMap((entry) =>
      entry.write ? [entry.read.permission, entry.write.permission] : [entry.read.permission],
    ),
  );
}
