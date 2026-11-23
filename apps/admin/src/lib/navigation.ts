// SPDX-License-Identifier: AGPL-3.0-only
import {
  Activity,
  BarChart3,
  Clapperboard,
  MonitorPlay,
  PanelsTopLeft,
  PanelTop,
  RadioTower,
  Database,
  DatabaseBackup,
  Film,
  FolderSearch,
  KeyRound,
  Library,
  LayoutDashboard,
  LayoutTemplate,
  Boxes,
  CreditCard,
  Receipt,
  type LucideIcon,
  CalendarClock,
  Disc,
  Drama,
  Gauge,
  Network,
  Share2,
  Mail,
  Radio,
  ScrollText,
  ShieldHalf,
  SlidersHorizontal,
  Stethoscope,
  Shapes,
  Tag,
  Tags,
  Tv,
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
    items: [
      { to: '/', label: 'Dashboard', icon: LayoutDashboard, keywords: 'home overview' },
      {
        to: '/analytics',
        label: 'Analytics',
        icon: BarChart3,
        permission: 'analytics:read',
        keywords: 'views viewers watch time statistics figures audience popular top',
      },
    ],
  },
  {
    label: 'Catalog',
    items: [
      {
        to: '/movies',
        label: 'Movies',
        icon: Film,
        permission: 'catalog:read',
        keywords: 'films titles documentaries catalog',
      },
      {
        to: '/series',
        label: 'Series',
        icon: Tv,
        permission: 'catalog:read',
        keywords: 'shows titles seasons episodes catalog',
      },
      {
        to: '/collections',
        label: 'Collections',
        icon: Library,
        permission: 'catalog:read',
        keywords: 'franchise trilogy sets selections lists',
      },
      {
        to: '/people',
        label: 'People',
        icon: Drama,
        permission: 'catalog:read',
        keywords: 'cast crew actors directors persons',
      },
      {
        to: '/genres',
        label: 'Genres',
        icon: Shapes,
        permission: 'catalog:read',
        keywords: 'kinds drama comedy',
      },
      {
        to: '/categories',
        label: 'Categories',
        icon: Tags,
        permission: 'catalog:read',
        keywords: 'shelves groups tags rows',
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
    label: 'Layout',
    items: [
      {
        to: '/layout/home',
        label: 'Home page',
        icon: LayoutTemplate,
        permission: 'catalog:read',
        keywords: 'website start front rows hero opening sections builder carousel',
      },
      {
        to: '/layout/movies',
        label: 'Movies page',
        icon: Clapperboard,
        permission: 'catalog:read',
        keywords: 'website films rows hero opening sections builder',
      },
      {
        to: '/layout/series',
        label: 'Series page',
        icon: MonitorPlay,
        permission: 'catalog:read',
        keywords: 'website shows rows hero opening sections builder',
      },
      {
        to: '/layout/live',
        label: 'Live page',
        icon: RadioTower,
        permission: 'catalog:read',
        keywords: 'website channels rows sections builder',
      },
      {
        to: '/layout/category',
        label: 'Category pages',
        icon: PanelsTopLeft,
        permission: 'catalog:read',
        keywords: 'website shelves rows hero opening sections builder template',
      },
      {
        to: '/layout/genre',
        label: 'Genre pages',
        icon: PanelTop,
        permission: 'catalog:read',
        keywords: 'website kinds rows hero opening sections builder template',
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
        to: '/coupons',
        label: 'Coupons',
        icon: Tag,
        permission: 'billing:read',
        keywords: 'codes discounts vouchers promotions promo offers percent off campaign',
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
    label: 'Delivery',
    items: [
      {
        to: '/delivery',
        label: 'Overview',
        icon: Gauge,
        permission: 'delivery:read',
        keywords: 'delivery offload bandwidth traffic saved main server edges viewers statistics',
      },
      {
        to: '/edges',
        label: 'Edge servers',
        icon: Network,
        permission: 'delivery:read',
        keywords: 'edge cdn cache delivery servers agent bandwidth traffic offload nodes',
      },
      {
        to: '/p2p',
        label: 'P2P',
        icon: Share2,
        permission: 'delivery:read',
        keywords: 'p2p peer to peer tracker webrtc swarm viewers share offload',
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
        to: '/imports',
        label: 'Imports',
        icon: FolderSearch,
        permission: 'catalog:read',
        keywords: 'watch folder watched bucket s3 automatic scan tmdb incoming drop',
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
        to: '/backups',
        label: 'Backups',
        icon: DatabaseBackup,
        permission: 'settings:read',
        keywords: 'backup restore database dump schedule recovery disaster',
      },
      {
        to: '/diagnostics',
        label: 'Diagnostics',
        icon: Stethoscope,
        permission: 'settings:read',
        keywords: 'health status problems errors version update processes alerts',
      },
      {
        to: '/admins',
        label: 'Admins',
        icon: Users,
        permission: 'admins:read',
        keywords: 'users team staff people',
      },
      {
        to: '/roles',
        label: 'Roles',
        icon: ShieldHalf,
        permission: 'admins:read',
        keywords: 'permissions access rights custom role rbac',
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
