// SPDX-License-Identifier: AGPL-3.0-only
import {
  Activity,
  Clapperboard,
  Database,
  Film,
  KeyRound,
  LayoutDashboard,
  type LucideIcon,
  ScrollText,
  SlidersHorizontal,
  Tags,
  Users,
} from 'lucide-react';
import type { Permission } from '@/api/types';

export interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  /** The item is shown only to admins with this permission. */
  permission?: Permission;
  /** Words the command palette also matches. */
  keywords?: string;
}

export interface NavGroup {
  label: string;
  items: NavItem[];
}

/** The pages of the panel, used by the sidebar, the command palette and the breadcrumbs. */
export const NAVIGATION: NavGroup[] = [
  {
    label: 'Overview',
    items: [{ to: '/', label: 'Dashboard', icon: LayoutDashboard, keywords: 'home overview' }],
  },
  {
    label: 'Catalog',
    items: [
      {
        to: '/titles',
        label: 'Titles',
        icon: Clapperboard,
        permission: 'catalog:read',
        keywords: 'movies series films shows episodes catalog',
      },
      {
        to: '/categories',
        label: 'Categories',
        icon: Tags,
        permission: 'catalog:read',
        keywords: 'genres groups tags',
      },
    ],
  },
  {
    label: 'Media',
    items: [
      {
        to: '/assets',
        label: 'Library',
        icon: Film,
        permission: 'assets:read',
        keywords: 'videos assets media upload',
      },
      {
        to: '/jobs',
        label: 'Jobs',
        icon: Activity,
        permission: 'jobs:read',
        keywords: 'processing queue transcode',
      },
    ],
  },
  {
    label: 'Settings',
    items: [
      {
        to: '/encoding-profiles',
        label: 'Encoding profiles',
        icon: SlidersHorizontal,
        permission: 'encoding-profiles:read',
        keywords: 'qualities renditions bitrate',
      },
      {
        to: '/storage',
        label: 'Storage',
        icon: Database,
        permission: 'storage:read',
        keywords: 'pools s3 disk bucket',
      },
      {
        to: '/admins',
        label: 'Admins',
        icon: Users,
        permission: 'admins:read',
        keywords: 'users team roles',
      },
      {
        to: '/api-keys',
        label: 'API keys',
        icon: KeyRound,
        permission: 'api-keys:read',
        keywords: 'tokens integration',
      },
      {
        to: '/audit',
        label: 'Audit log',
        icon: ScrollText,
        permission: 'audit:read',
        keywords: 'history activity',
      },
    ],
  },
];

/** Finds the navigation entry a path belongs to. */
export function findNavItem(pathname: string): NavItem | undefined {
  const items = NAVIGATION.flatMap((group) => group.items);
  return (
    items.find((item) => item.to === pathname) ??
    items.find((item) => item.to !== '/' && pathname.startsWith(`${item.to}/`))
  );
}
