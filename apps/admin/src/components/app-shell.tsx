// SPDX-License-Identifier: AGPL-3.0-only
import {
  ChevronRight,
  ChevronsUpDown,
  ExternalLink,
  LogOut,
  Monitor,
  Moon,
  PanelLeft,
  Search,
  Sun,
  TriangleAlert,
  UserRound,
} from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router';
import { diagnosticsApi } from '@/api/endpoints';
import { useSession } from '@/auth/session';
import { cn } from '@/lib/cn';
import { markOf } from '@/lib/diagnostics';
import { humanize } from '@/lib/format';
import { roleName } from '@/lib/roles';
import { findNavItem, NAVIGATION } from '@/lib/navigation';
import { SITE_URL } from '@/lib/site';
import { useLiveState } from '@/live/live';
import { type ThemeChoice, useTheme } from '@/theme/theme';
import { useUploads } from '@/uploads/uploads';
import { CommandPalette } from './command-palette';
import { ErrorBoundary } from './error-boundary';
import { Button } from './ui/button';
import { Kbd } from './ui/display';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Tooltip,
} from './ui/overlay';
import { UploadTray } from './upload-tray';

const COLLAPSED_KEY = 'onyx.admin.sidebar';
const THEME_ICONS: Record<ThemeChoice, typeof Sun> = { light: Sun, dark: Moon, system: Monitor };

function Brand({ collapsed }: { collapsed: boolean }) {
  return (
    <Link to="/" className="flex h-14 items-center gap-2.5 px-4 font-semibold tracking-tight">
      <span
        className="size-6 shrink-0 rounded-lg bg-linear-to-br from-primary to-fuchsia-500 shadow-sm"
        aria-hidden="true"
      />
      {collapsed ? <span className="sr-only">Onyx Stream</span> : 'Onyx Stream'}
    </Link>
  );
}

/** The frame around every signed-in page: navigation, top bar, command palette and the upload tray. */
export function AppShell() {
  const { state, signOut, can } = useSession();
  const { choice, setChoice } = useTheme();
  const { uploads } = useUploads();
  const live = useLiveState();
  const location = useLocation();
  const navigate = useNavigate();
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(() => {
    try {
      return window.localStorage.getItem(COLLAPSED_KEY) === '1';
    } catch {
      return false;
    }
  });

  useEffect(() => setMobileOpen(false), [location.pathname]);

  if (state.status !== 'signedIn') {
    return null;
  }

  const toggleCollapsed = () => {
    setCollapsed((current) => {
      try {
        window.localStorage.setItem(COLLAPSED_KEY, current ? '0' : '1');
      } catch {
        // Storage can be blocked. The choice then lasts until the page is reloaded.
      }
      return !current;
    });
  };

  const activeUploads = uploads.filter(
    (item) => item.status === 'starting' || item.status === 'uploading',
  ).length;
  const current = findNavItem(location.pathname);
  const onDetailPage = current !== undefined && current.to !== location.pathname;
  const ThemeIcon = THEME_ICONS[choice];
  const initials = state.me.displayName
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join('');

  const sidebar = (isCollapsed: boolean) => (
    <>
      <Brand collapsed={isCollapsed} />
      <nav className="flex-1 space-y-5 overflow-y-auto px-3 py-2" aria-label="Main">
        {NAVIGATION.map((group) => {
          const items = group.items.filter((item) => !item.permission || can(item.permission));
          if (items.length === 0) {
            return null;
          }
          return (
            <div key={group.label} className="space-y-1">
              {isCollapsed ? null : (
                <p className="px-3 pb-1 text-[11px] font-medium tracking-wider text-muted-foreground uppercase">
                  {group.label}
                </p>
              )}
              {items.map((item) => {
                const link = (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    end={item.to === '/'}
                    className={({ isActive }) =>
                      cn(
                        'flex h-9 items-center gap-3 rounded-md px-3 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground',
                        isActive && 'bg-accent text-foreground shadow-xs',
                        isCollapsed && 'justify-center px-0',
                      )
                    }
                  >
                    <item.icon className="size-4 shrink-0" aria-hidden="true" />
                    {isCollapsed ? <span className="sr-only">{item.label}</span> : item.label}
                    {!isCollapsed && item.to === '/assets' && activeUploads > 0 ? (
                      <span className="ml-auto rounded-full bg-primary px-1.5 text-[11px] font-semibold text-primary-foreground tabular-nums">
                        {activeUploads}
                      </span>
                    ) : null}
                  </NavLink>
                );
                return isCollapsed ? (
                  <Tooltip key={item.to} content={item.label} side="right">
                    {link}
                  </Tooltip>
                ) : (
                  link
                );
              })}
            </div>
          );
        })}
      </nav>

      <div className="border-t p-3">
        <DropdownMenu>
          <DropdownMenuTrigger
            className={cn(
              'flex w-full items-center gap-3 rounded-md p-1.5 text-left transition-colors hover:bg-accent',
              isCollapsed && 'justify-center',
            )}
            aria-label="Account menu"
          >
            <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/15 text-xs font-semibold text-primary">
              {initials}
            </span>
            {isCollapsed ? null : (
              <>
                <span className="grid min-w-0 flex-1 leading-tight">
                  <span className="truncate text-sm font-medium">{state.me.displayName}</span>
                  <span className="truncate text-xs text-muted-foreground">
                    {roleName(state.me)}
                  </span>
                </span>
                <ChevronsUpDown className="size-4 text-muted-foreground" aria-hidden="true" />
              </>
            )}
          </DropdownMenuTrigger>
          <DropdownMenuContent side="top" align="start" className="w-56">
            <DropdownMenuLabel className="truncate">{state.me.email}</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => void navigate('/account')}>
              <UserRound />
              My account
            </DropdownMenuItem>
            <DropdownMenuItem destructive onSelect={() => void signOut()}>
              <LogOut />
              Sign out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </>
  );

  return (
    <div className="flex min-h-dvh">
      <aside
        className={cn(
          'sticky top-0 hidden h-dvh shrink-0 flex-col border-r bg-sidebar transition-[width] duration-200 lg:flex',
          collapsed ? 'w-[68px]' : 'w-60',
        )}
      >
        {sidebar(collapsed)}
      </aside>

      {mobileOpen ? (
        <div className="fixed inset-0 z-40 lg:hidden">
          <button
            type="button"
            className="absolute inset-0 animate-overlay bg-overlay"
            aria-label="Close the menu"
            onClick={() => setMobileOpen(false)}
          />
          <aside className="relative flex h-full w-64 animate-slide-in flex-col border-r bg-sidebar shadow-2xl">
            {sidebar(false)}
          </aside>
        </div>
      ) : null}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b bg-background/85 px-4 backdrop-blur-md lg:px-6">
          <Button
            variant="ghost"
            size="icon-sm"
            className="lg:hidden"
            onClick={() => setMobileOpen(true)}
            aria-label="Open the menu"
          >
            <PanelLeft />
          </Button>
          <Tooltip content={collapsed ? 'Expand the sidebar' : 'Collapse the sidebar'}>
            <Button
              variant="ghost"
              size="icon-sm"
              className="hidden lg:inline-flex"
              onClick={toggleCollapsed}
              aria-label={collapsed ? 'Expand the sidebar' : 'Collapse the sidebar'}
            >
              <PanelLeft />
            </Button>
          </Tooltip>

          <nav className="flex min-w-0 items-center gap-1.5 text-sm" aria-label="Breadcrumb">
            {current ? (
              onDetailPage ? (
                <>
                  <Link to={current.to} className="text-muted-foreground hover:text-foreground">
                    {current.label}
                  </Link>
                  <ChevronRight className="size-3.5 text-muted-foreground" aria-hidden="true" />
                  <span className="truncate font-medium">Details</span>
                </>
              ) : (
                <span className="font-medium">{current.label}</span>
              )
            ) : null}
          </nav>

          <div className="ml-auto flex items-center gap-2">
            {SITE_URL !== null ? (
              <Button asChild variant="ghost" size="sm" className="hidden md:inline-flex">
                <a href={`${SITE_URL}/`} target="_blank" rel="noreferrer">
                  View site
                  <ExternalLink />
                </a>
              </Button>
            ) : null}
            <HealthMark />
            <Tooltip
              content={
                live === 'live'
                  ? 'Changes appear as they happen'
                  : live === 'connecting'
                    ? 'Connecting to live updates'
                    : 'Live updates are interrupted. The panel asks the server every few seconds instead.'
              }
            >
              <span
                className={cn(
                  'hidden items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs font-medium sm:inline-flex',
                  live === 'live'
                    ? 'border-success/25 bg-success/10 text-success'
                    : 'border-warning/30 bg-warning/10 text-warning',
                )}
                role="status"
              >
                <span
                  className={cn(
                    'size-1.5 rounded-full bg-current',
                    live !== 'live' && 'animate-pulse',
                  )}
                  aria-hidden="true"
                />
                {live === 'live' ? 'Live' : live === 'connecting' ? 'Connecting' : 'Reconnecting'}
              </span>
            </Tooltip>
            <button
              type="button"
              onClick={() => setPaletteOpen(true)}
              className="flex h-9 items-center gap-2 rounded-md border bg-card px-3 text-sm text-muted-foreground shadow-xs transition-colors hover:bg-accent sm:w-64"
            >
              <Search className="size-4" aria-hidden="true" />
              <span className="hidden flex-1 text-left sm:inline">Search…</span>
              <span className="hidden sm:inline">
                <Kbd>Ctrl K</Kbd>
              </span>
              <span className="sr-only sm:hidden">Search</span>
            </button>

            <DropdownMenu>
              <Tooltip content="Theme">
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon-sm" aria-label="Choose the theme">
                    <ThemeIcon />
                  </Button>
                </DropdownMenuTrigger>
              </Tooltip>
              <DropdownMenuContent align="end">
                {(['light', 'dark', 'system'] as const).map((option) => {
                  const Icon = THEME_ICONS[option];
                  return (
                    <DropdownMenuItem
                      key={option}
                      onSelect={() => setChoice(option)}
                      className={cn(choice === option && 'font-medium text-primary')}
                    >
                      <Icon />
                      {humanize(option)}
                    </DropdownMenuItem>
                  );
                })}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>

        <main className="mx-auto w-full max-w-[1400px] flex-1 px-4 py-6 lg:px-8 lg:py-8">
          <ErrorBoundary resetKey={location.pathname}>
            <Outlet />
          </ErrorBoundary>
        </main>
      </div>

      <UploadTray />
      <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} />
    </div>
  );
}

/**
 * Says in the header when something is wrong with the installation, on
 * whatever page the admin is. Stays away when all is well.
 */
function HealthMark() {
  const { can } = useSession();
  const allowed = can('settings:read');
  const summary = useQuery({
    queryKey: ['diagnostics', 'summary'],
    queryFn: ({ signal }) => diagnosticsApi.summary(signal),
    enabled: allowed,
    refetchInterval: 60_000,
  });
  const mark = markOf(summary.data?.summary ?? null);
  if (!allowed || !mark) {
    return null;
  }
  return (
    <Tooltip content="Something is wrong with the installation. Open diagnostics to see what.">
      <Link
        to="/diagnostics"
        className={cn(
          'inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs font-medium transition-colors',
          mark.tone === 'danger'
            ? 'border-destructive/30 bg-destructive/10 text-destructive hover:bg-destructive/15'
            : 'border-warning/30 bg-warning/10 text-warning hover:bg-warning/15',
        )}
      >
        <TriangleAlert className="size-3.5" aria-hidden="true" />
        {mark.label}
      </Link>
    </Tooltip>
  );
}
