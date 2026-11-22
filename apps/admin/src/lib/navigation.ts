// SPDX-License-Identifier: AGPL-3.0-only
import {
  Activity,
  Clapperboard,
  Database,
  Film,
  KeyRound,
  LayoutDashboard,
  Boxes,
  CreditCard,
  Receipt,
  type LucideIcon,
  CalendarClock,
  Disc,
  Network,
  Mail,
  Radio,
  ScrollText,
  SlidersHorizontal,
  Tags,
  Users,
  UsersRound,
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
    label: 'Audience',
    items: [
      {
        to: '/viewers',
        label: 'Viewers',
        icon: UsersRound,
        permission: 'viewers:read',
        keywords: 'accounts users customers members subscribers sign-up devices',
      },
    ],
  },
  {
    label: 'Billing',
    items: [
      {
        to: '/plans',
        label: 'Plans',
        icon: CreditCard,
        permission: 'billing:read',
        keywords: 'subscriptions prices pricing paywall stripe checkout',
      },
      {
        to: '/packages',
        label: 'Packages',
        icon: Boxes,
        permission: 'catalog:read',
        keywords: 'bouquets bundles groups tiers what a plan opens includes kids sports',
      },
      {
        to: '/revenue',
        label: 'Revenue',
        icon: Receipt,
        permission: 'billing:read',
        keywords: 'payments money income invoices refunds mrr export csv books accounting',
      },
    ],
  },
  {
    label: 'Live',
    items: [
      {
        to: '/channels',
        label: 'Channels',
        icon: Radio,
        permission: 'live:read',
        keywords: 'live tv streams broadcast iptv linear sources rtmp srt hls udp on air',
      },
      {
        to: '/guide',
        label: 'Guide',
        icon: CalendarClock,
        permission: 'live:read',
        keywords: 'epg programme program schedule xmltv now next tv guide listings',
      },
      {
        to: '/recordings',
        label: 'Recordings',
        icon: Disc,
        permission: 'live:read',
        keywords: 'record recording dvr catch-up keep save programme library',
      },
    ],
  },
  {
    label: 'Delivery',
    items: [
      {
        to: '/edges',
        label: 'Edge servers',
        icon: Network,
        permission: 'delivery:read',
        keywords: 'edge cdn cache delivery servers agent bandwidth traffic offload nodes',
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
        to: '/email',
        label: 'Email',
        icon: Mail,
        permission: 'settings:read',
        keywords: 'smtp mail server password reset verification',
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
