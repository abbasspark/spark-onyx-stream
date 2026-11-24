// SPDX-License-Identifier: AGPL-3.0-only
import {
  Activity,
  BarChart3,
  BellRing,
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
  Languages,
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
  HeartPulse,
  Network,
  Share2,
  Mail,
  Palette,
  Radio,
  ScrollText,
  ShieldHalf,
  SlidersHorizontal,
  Stethoscope,
  Shapes,
  Tag,
  Ticket,
  Tags,
  Tv,
  Users,
  UsersRound,
  Webhook,
  BookOpenText,
  MonitorSmartphone,
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
      {
        to: '/quality',
        label: 'Playback quality',
        icon: HeartPulse,
        permission: 'analytics:read',
        keywords:
          'buffering rebuffering stalls startup time errors failures bitrate qoe health players',
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
      {
        to: '/translations',
        label: 'Translations',
        icon: Languages,
        permission: 'catalog:read',
        keywords: 'languages translate names genres categories people collections localize',
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
      {
        to: '/notifications',
        label: 'Notifications',
        icon: BellRing,
        permission: 'viewers:read',
        keywords: 'push messages campaigns announcements firebase fcm web push bell inbox',
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
        to: '/prepaid-codes',
        label: 'Prepaid codes',
        icon: Ticket,
        permission: 'billing:read',
        keywords: 'vouchers gift cards scratch cards top up activation codes resellers kiosk cash',
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
        to: '/branding',
        label: 'Branding',
        icon: Palette,
        permission: 'settings:read',
        keywords: 'logo name colour color accent icon favicon footer imprint site look theme',
      },
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
        to: '/api-reference',
        label: 'API reference',
        icon: BookOpenText,
        permission: 'api-keys:read',
        keywords: 'documentation docs endpoints openapi swagger rest developers integration curl',
      },
      {
        to: '/apps',
        label: 'Apps',
        icon: MonitorSmartphone,
        permission: 'settings:read',
        keywords: 'android tv mobile ios version minimum update force upgrade old client',
      },
      {
        to: '/webhooks',
        label: 'Webhooks',
        icon: Webhook,
        permission: 'settings:read',
        keywords:
          'events notify callback integration automation zapier n8n hook signature deliveries',
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
