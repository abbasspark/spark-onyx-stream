// SPDX-License-Identifier: AGPL-3.0-only
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { useQuery } from '@tanstack/react-query';
import { Command } from 'cmdk';
import {
  Clapperboard,
  Film,
  LogOut,
  Monitor,
  Moon,
  Search,
  Sun,
  Upload,
  UserRound,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { assetsApi } from '@/api/endpoints';
import { useSession } from '@/auth/session';
import { NAVIGATION } from '@/lib/navigation';
import { useTheme } from '@/theme/theme';
import { StatusBadge } from './ui/display';

const itemClasses =
  'flex cursor-default items-center gap-3 rounded-md px-3 py-2 text-sm select-none data-[selected=true]:bg-accent data-[selected=true]:text-accent-foreground [&_svg]:size-4 [&_svg]:text-muted-foreground';
const groupClasses =
  '[&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-muted-foreground';

interface CommandPaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * The quick switcher: jump to a page, find a video by title or run a common
 * action from the keyboard. Opens with Ctrl+K or Cmd+K.
 */
export function CommandPalette({ open, onOpenChange }: CommandPaletteProps) {
  const navigate = useNavigate();
  const { can, signOut } = useSession();
  const { setChoice } = useTheme();
  const [search, setSearch] = useState('');

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        onOpenChange(!open);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onOpenChange]);

  useEffect(() => {
    if (!open) {
      setSearch('');
    }
  }, [open]);

  const term = search.trim();
  const assets = useQuery({
    queryKey: ['assets', 'palette', term],
    queryFn: ({ signal }) => assetsApi.list({ page: 1, pageSize: 6, q: term }, signal),
    enabled: open && term.length >= 2 && can('assets:read'),
    staleTime: 10_000,
  });

  const run = (action: () => void) => {
    onOpenChange(false);
    action();
  };

  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 animate-overlay bg-overlay backdrop-blur-[2px]" />
        <DialogPrimitive.Content
          className="fixed top-[18%] left-1/2 z-50 w-[calc(100vw-2rem)] max-w-xl -translate-x-1/2 animate-in overflow-hidden rounded-xl border bg-popover text-popover-foreground shadow-2xl outline-none"
          aria-describedby={undefined}
        >
          <DialogPrimitive.Title className="sr-only">Search and commands</DialogPrimitive.Title>
          {/* Titles from the server are matched there, so filtering here only looks at pages and actions. */}
          <Command
            filter={(value, searchText, keywords) =>
              value.startsWith('asset:') ||
              `${value} ${keywords?.join(' ') ?? ''}`
                .toLowerCase()
                .includes(searchText.toLowerCase())
                ? 1
                : 0
            }
          >
            <div className="flex items-center gap-3 border-b px-4">
              <Search className="size-4 text-muted-foreground" aria-hidden="true" />
              <Command.Input
                value={search}
                onValueChange={setSearch}
                placeholder="Search videos, pages and actions"
                className="h-12 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
              />
            </div>
            <Command.List className="max-h-[min(60dvh,26rem)] overflow-y-auto p-2">
              <Command.Empty className="px-3 py-8 text-center text-sm text-muted-foreground">
                {assets.isFetching ? 'Searching…' : 'Nothing found.'}
              </Command.Empty>

              {assets.data && assets.data.items.length > 0 ? (
                <Command.Group heading="Videos" className={groupClasses}>
                  {assets.data.items.map((asset) => (
                    <Command.Item
                      key={asset.id}
                      value={`asset:${asset.id}`}
                      className={itemClasses}
                      onSelect={() => run(() => void navigate(`/assets/${asset.id}`))}
                    >
                      <Film />
                      <span className="min-w-0 flex-1 truncate">{asset.title}</span>
                      <StatusBadge status={asset.status} />
                    </Command.Item>
                  ))}
                </Command.Group>
              ) : null}

              {NAVIGATION.map((group) => (
                <Command.Group key={group.label} heading={group.label} className={groupClasses}>
                  {group.items
                    .filter((item) => !item.permission || can(item.permission))
                    .map((item) => (
                      <Command.Item
                        key={item.to}
                        value={item.label}
                        keywords={item.keywords?.split(' ')}
                        className={itemClasses}
                        onSelect={() => run(() => void navigate(item.to))}
                      >
                        <item.icon />
                        {item.label}
                      </Command.Item>
                    ))}
                </Command.Group>
              ))}

              <Command.Group heading="Actions" className={groupClasses}>
                {can('assets:write') ? (
                  <Command.Item
                    value="Upload videos"
                    keywords={['add', 'new', 'import']}
                    className={itemClasses}
                    onSelect={() => run(() => void navigate('/assets?upload=1'))}
                  >
                    <Upload />
                    Upload videos
                  </Command.Item>
                ) : null}
                {can('catalog:write') ? (
                  <Command.Item
                    value="New title"
                    keywords={['add', 'create', 'movie', 'series', 'catalog']}
                    className={itemClasses}
                    onSelect={() => run(() => void navigate('/titles?new=1'))}
                  >
                    <Clapperboard />
                    New title
                  </Command.Item>
                ) : null}
                <Command.Item
                  value="My account"
                  keywords={['password', 'profile']}
                  className={itemClasses}
                  onSelect={() => run(() => void navigate('/account'))}
                >
                  <UserRound />
                  My account
                </Command.Item>
                <Command.Item
                  value="Light theme"
                  keywords={['appearance', 'mode']}
                  className={itemClasses}
                  onSelect={() => run(() => setChoice('light'))}
                >
                  <Sun />
                  Use the light theme
                </Command.Item>
                <Command.Item
                  value="Dark theme"
                  keywords={['appearance', 'mode']}
                  className={itemClasses}
                  onSelect={() => run(() => setChoice('dark'))}
                >
                  <Moon />
                  Use the dark theme
                </Command.Item>
                <Command.Item
                  value="System theme"
                  keywords={['appearance', 'mode', 'auto']}
                  className={itemClasses}
                  onSelect={() => run(() => setChoice('system'))}
                >
                  <Monitor />
                  Follow the system theme
                </Command.Item>
                <Command.Item
                  value="Sign out"
                  keywords={['logout', 'exit']}
                  className={itemClasses}
                  onSelect={() => run(() => void signOut())}
                >
                  <LogOut />
                  Sign out
                </Command.Item>
              </Command.Group>
            </Command.List>
          </Command>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
