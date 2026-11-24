// SPDX-License-Identifier: AGPL-3.0-only
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowDown,
  ArrowUp,
  Ban,
  Check,
  Copy,
  Film,
  KeyRound,
  Lock,
  LockOpen,
  LogOut,
  Mail,
  MailCheck,
  MailPlus,
  MailQuestion,
  Monitor,
  MonitorSmartphone,
  MoreHorizontal,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Smartphone,
  Tablet,
  Trash2,
  Tv,
  UserCheck,
  UsersRound,
  X,
} from 'lucide-react';
import { type FormEvent, type ReactNode, useEffect, useState } from 'react';
import { Link } from 'react-router';
import { toast } from 'sonner';
import { viewersApi } from '@/api/endpoints';
import {
  VIEWER_SORT_FIELDS,
  VIEWER_STATUSES,
  type SortOrder,
  type Viewer,
  type ViewerAccessConfig,
  type ViewerSortField,
  type ViewerStatus,
  type ViewerDevice,
  type ViewerProfile,
} from '@/api/types';
import { useSession } from '@/auth/session';
import { useConfirm } from '@/components/confirm';
import { Button } from '@/components/ui/button';
import {
  Badge,
  Card,
  EmptyState,
  ErrorNote,
  Facts,
  PageHeader,
  Pagination,
  Skeleton,
  StatusBadge,
  Table,
  Td,
  Th,
  Tr,
} from '@/components/ui/display';
import { Field, Input, Select, ToggleRow } from '@/components/ui/form';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Tooltip,
} from '@/components/ui/overlay';
import { ViewerPayments } from '@/components/viewer-payments';
import { ViewerPurchases } from '@/components/viewer-purchases';
import { ViewerSubscription } from '@/components/viewer-subscription';
import { useAddressParams } from '@/lib/address-params';
import { titlePath } from '@/lib/catalog';
import { cn } from '@/lib/cn';
import { describeLimit } from '@/lib/age-rating';
import { formatDateTime, formatRelative, humanize } from '@/lib/format';
import {
  describeApp,
  describeDevice,
  describeStreamDevice,
  describeStreamLimit,
  generatePassword,
  initialsOf,
  parseStreamLimit,
  profileColor,
  summarizeWatching,
} from '@/lib/viewers';

const PAGE_SIZE = 25;
const SEARCH_DELAY_MS = 300;
const DEVICE_ICONS: Record<string, typeof Tv> = {
  TV: Tv,
  MOBILE: Smartphone,
  TABLET: Tablet,
  DESKTOP: Monitor,
};

const MIN_PASSWORD_LENGTH = 8;

const SORT_LABELS: Record<ViewerSortField, string> = {
  createdAt: 'Date joined',
  lastLoginAt: 'Last sign-in',
  email: 'Email',
  displayName: 'Name',
};

/** What a dialog is open for. */
type Open =
  | { kind: 'create' }
  | { kind: 'edit'; viewer: Viewer }
  | { kind: 'password'; viewer: Viewer }
  | { kind: 'detail'; viewer: Viewer }
  | null;

function Avatar({ name, muted }: { name: string; muted?: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        'flex size-9 shrink-0 items-center justify-center rounded-full text-xs font-semibold',
        muted ? 'bg-muted text-muted-foreground' : 'bg-primary/12 text-primary',
      )}
    >
      {initialsOf(name) || '?'}
    </span>
  );
}

/** Says in plain words what the installation lets the public do. */
function AccessSummary({ access }: { access: ViewerAccessConfig }) {
  const items: { label: string; value: string; note: string; tone: 'neutral' | 'warning' }[] = [
    {
      label: 'Sign-up',
      value: access.registration === 'open' ? 'Open to everyone' : 'Closed',
      note:
        access.registration === 'open'
          ? 'Anyone can create an account on the website.'
          : 'Only admins create viewers, here.',
      tone: 'neutral',
    },
    {
      label: 'Playback',
      value:
        access.playback === 'open'
          ? 'Open to everyone'
          : access.playback === 'viewers'
            ? 'Signed-in viewers only'
            : 'Off',
      note:
        access.playback === 'open'
          ? 'Published titles can be watched without an account.'
          : access.playback === 'viewers'
            ? 'A viewer must sign in to watch a published title.'
            : 'Nobody can watch through the website. The catalog can still be browsed.',
      tone: access.playback === 'open' ? 'warning' : 'neutral',
    },
    {
      label: 'Email',
      value: access.email ? 'On' : 'Off',
      note: access.email
        ? 'Viewers get a link to confirm their address, and can set a new password by email.'
        : 'No email is sent. A viewer who forgets their password needs a new one from you.',
      tone: access.email ? 'neutral' : 'warning',
    },
    {
      label: 'Confirmed address',
      value: access.verification === 'required' ? 'Needed to watch' : 'Not needed',
      note:
        access.verification === 'required'
          ? access.playback === 'viewers'
            ? 'A viewer watches only after they confirmed their email address.'
            : 'Has no effect while playback does not need a viewer.'
          : 'A viewer can watch without confirming their email address.',
      tone: 'neutral',
    },
  ];

  return (
    <Card className="mb-6 grid gap-x-10 gap-y-4 p-5 sm:grid-cols-2">
      {items.map((item) => (
        <div key={item.label}>
          <p className="flex items-center gap-2 text-[13px] text-muted-foreground">
            {item.label}
            <Badge tone={item.tone}>{item.value}</Badge>
          </p>
          <p className="mt-1.5 text-sm">{item.note}</p>
        </div>
      ))}
      <p className="text-xs text-muted-foreground sm:col-span-2">
        These are set where the installation is configured, with{' '}
        <code className="font-mono">VIEWER_REGISTRATION</code>,{' '}
        <code className="font-mono">CATALOG_PLAYBACK</code> and{' '}
        <code className="font-mono">VIEWER_EMAIL_VERIFICATION</code>, and apply after a restart.
        Email has{' '}
        <Link to="/email" className="underline underline-offset-4">
          its own page
        </Link>
        .
      </p>
    </Card>
  );
}

/** The people who have an account on the viewer website. */
export function ViewersPage() {
  const { can } = useSession();
  const mayWrite = can('viewers:write');
  const confirm = useConfirm();
  const queryClient = useQueryClient();
  const [params, change] = useAddressParams();
  const [open, setOpen] = useState<Open>(null);

  const page = Math.max(1, Number(params.get('page')) || 1);
  const status = (
    (VIEWER_STATUSES as readonly string[]).includes(params.get('status') ?? '')
      ? params.get('status')
      : ''
  ) as ViewerStatus | '';
  const subscribed = (
    ['yes', 'no'].includes(params.get('subscribed') ?? '') ? params.get('subscribed') : ''
  ) as 'yes' | 'no' | '';
  const q = params.get('q') ?? '';
  const sort = (VIEWER_SORT_FIELDS as readonly string[]).includes(params.get('sort') ?? '')
    ? (params.get('sort') as ViewerSortField)
    : 'createdAt';
  const order: SortOrder =
    params.get('order') === 'asc' || params.get('order') === 'desc'
      ? (params.get('order') as SortOrder)
      : sort === 'email' || sort === 'displayName'
        ? 'asc'
        : 'desc';

  // The search box is local while typing and reaches the address a moment later.
  const [search, setSearch] = useState(q);
  useEffect(() => {
    if (search === q) {
      return;
    }
    const timer = window.setTimeout(() => change({ q: search, page: null }), SEARCH_DELAY_MS);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  const viewers = useQuery({
    queryKey: ['viewers', 'list', { page, status, subscribed, q, sort, order }],
    queryFn: ({ signal }) =>
      viewersApi.list(
        {
          page,
          pageSize: PAGE_SIZE,
          status: status || undefined,
          subscribed: subscribed || undefined,
          q: q || undefined,
          sort,
          order,
        },
        signal,
      ),
    placeholderData: keepPreviousData,
  });
  const access = useQuery({
    queryKey: ['viewers', 'access'],
    queryFn: ({ signal }) => viewersApi.access(signal),
    staleTime: 60_000,
  });
  const mailOn = access.data?.email ?? false;
  const items = viewers.data?.items ?? [];
  const filtered = Boolean(q || status || subscribed);

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ['viewers'] });
    void queryClient.invalidateQueries({ queryKey: ['stats'] });
  };
  const onError = (error: Error) => toast.error(error.message);

  const setStatus = useMutation({
    mutationFn: ({ viewer, next }: { viewer: Viewer; next: ViewerStatus }) =>
      viewersApi.update(viewer.id, { status: next }),
    onSuccess: (viewer) => {
      toast.success(
        viewer.status === 'DISABLED'
          ? `${viewer.displayName} is disabled and signed out`
          : `${viewer.displayName} can sign in again`,
      );
      refresh();
    },
    onError,
  });
  const signOut = useMutation({
    mutationFn: (viewer: Viewer) => viewersApi.signOut(viewer.id),
    onSuccess: (result, viewer) => {
      toast.success(
        result.sessionsEnded === 0
          ? `${viewer.displayName} was not signed in anywhere`
          : `${viewer.displayName} is signed out on ${result.sessionsEnded} ${result.sessionsEnded === 1 ? 'device' : 'devices'}`,
      );
      refresh();
    },
    onError,
  });
  const setVerified = useMutation({
    mutationFn: ({ viewer, verified }: { viewer: Viewer; verified: boolean }) =>
      viewersApi.update(viewer.id, { emailVerified: verified }),
    onSuccess: (viewer) => {
      toast.success(
        viewer.emailVerifiedAt
          ? `The address of ${viewer.displayName} counts as confirmed`
          : `${viewer.displayName} has to confirm their address again`,
      );
      refresh();
    },
    onError,
  });
  const sendPasswordEmail = useMutation({
    mutationFn: (viewer: Viewer) => viewersApi.sendPasswordEmail(viewer.id),
    onSuccess: (_result, viewer) =>
      toast.success(`A link to set a new password is on its way to ${viewer.email}`),
    onError,
  });
  const sendVerificationEmail = useMutation({
    mutationFn: (viewer: Viewer) => viewersApi.sendVerificationEmail(viewer.id),
    onSuccess: (_result, viewer) =>
      toast.success(`A link to confirm the address is on its way to ${viewer.email}`),
    onError,
  });
  const remove = useMutation({
    mutationFn: (viewer: Viewer) => viewersApi.remove(viewer.id),
    onSuccess: (_result, viewer) => {
      toast.success(`${viewer.displayName} deleted`);
      setOpen(null);
      refresh();
    },
    onError,
  });

  const askDisable = async (viewer: Viewer) => {
    const confirmed = await confirm({
      title: `Disable ${viewer.displayName}?`,
      description:
        'They are signed out on every device at once and cannot sign in until you enable them again. Nothing is deleted.',
      confirmLabel: 'Disable',
      destructive: true,
    });
    if (confirmed) {
      setStatus.mutate({ viewer, next: 'DISABLED' });
    }
  };
  const askSignOut = async (viewer: Viewer) => {
    const confirmed = await confirm({
      title: `Sign ${viewer.displayName} out everywhere?`,
      description: 'Every device has to sign in again. The password stays the same.',
      confirmLabel: 'Sign out everywhere',
    });
    if (confirmed) {
      signOut.mutate(viewer);
    }
  };
  const askDelete = async (viewer: Viewer) => {
    const confirmed = await confirm({
      title: `Delete ${viewer.displayName}?`,
      description: `The account ${viewer.email} is deleted with everything stored about it. This cannot be undone. To only keep someone out, disable them instead.`,
      confirmLabel: 'Delete',
      destructive: true,
    });
    if (confirmed) {
      remove.mutate(viewer);
    }
  };

  const sortBy = (field: ViewerSortField) =>
    change({
      sort: field === 'createdAt' ? null : field,
      // A second click on the same column turns the order around.
      order: sort === field ? (order === 'asc' ? 'desc' : 'asc') : null,
      page: null,
    });

  const rowMenu = (viewer: Viewer): ReactNode => (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon-sm" aria-label={`Actions for ${viewer.displayName}`}>
          <MoreHorizontal />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onSelect={() => setOpen({ kind: 'detail', viewer })}>
          <MonitorSmartphone />
          Details and devices
        </DropdownMenuItem>
        {mayWrite ? (
          <>
            <DropdownMenuItem onSelect={() => setOpen({ kind: 'edit', viewer })}>
              <Pencil />
              Edit
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => setOpen({ kind: 'password', viewer })}>
              <KeyRound />
              Set a new password
            </DropdownMenuItem>
            {mailOn ? (
              <DropdownMenuItem
                disabled={viewer.status !== 'ACTIVE'}
                onSelect={() => sendPasswordEmail.mutate(viewer)}
              >
                <Mail />
                Email a link for a new password
              </DropdownMenuItem>
            ) : null}
            {viewer.emailVerifiedAt ? (
              <DropdownMenuItem onSelect={() => setVerified.mutate({ viewer, verified: false })}>
                <MailQuestion />
                Mark address as not confirmed
              </DropdownMenuItem>
            ) : (
              <>
                {mailOn ? (
                  <DropdownMenuItem
                    disabled={viewer.status !== 'ACTIVE'}
                    onSelect={() => sendVerificationEmail.mutate(viewer)}
                  >
                    <MailPlus />
                    Email the link to confirm
                  </DropdownMenuItem>
                ) : null}
                <DropdownMenuItem onSelect={() => setVerified.mutate({ viewer, verified: true })}>
                  <MailCheck />
                  Mark address as confirmed
                </DropdownMenuItem>
              </>
            )}
            <DropdownMenuItem
              disabled={viewer.activeSessions === 0}
              onSelect={() => void askSignOut(viewer)}
            >
              <LogOut />
              Sign out everywhere
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            {viewer.status === 'ACTIVE' ? (
              <DropdownMenuItem onSelect={() => void askDisable(viewer)}>
                <Ban />
                Disable
              </DropdownMenuItem>
            ) : (
              <DropdownMenuItem onSelect={() => setStatus.mutate({ viewer, next: 'ACTIVE' })}>
                <UserCheck />
                Enable
              </DropdownMenuItem>
            )}
            <DropdownMenuItem destructive onSelect={() => void askDelete(viewer)}>
              <Trash2 />
              Delete
            </DropdownMenuItem>
          </>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );

  const newButton = mayWrite ? (
    <Button variant="primary" onClick={() => setOpen({ kind: 'create' })}>
      <Plus />
      New viewer
    </Button>
  ) : null;

  const columns: readonly (readonly [field: ViewerSortField | null, label: string])[] = [
    ['displayName', 'Viewer'],
    [null, 'Status'],
    [null, 'Devices'],
    ['lastLoginAt', 'Last sign-in'],
    ['createdAt', 'Joined'],
  ];

  return (
    <>
      <PageHeader
        title="Viewers"
        description="The people with an account on your site. A viewer can watch and manage their own account, and can never reach this panel."
        actions={newButton}
      />

      {access.data ? <AccessSummary access={access.data} /> : null}

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative w-full sm:w-80">
          <Search
            className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <Input
            type="search"
            placeholder="Search by name or email"
            aria-label="Search by name or email"
            className="pl-9"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </div>
        <Select
          aria-label="Filter by status"
          className="w-40"
          value={status || 'ALL'}
          onValueChange={(value) => change({ status: value === 'ALL' ? null : value, page: null })}
          options={[
            { value: 'ALL', label: 'All statuses' },
            ...VIEWER_STATUSES.map((value) => ({ value, label: humanize(value) })),
          ]}
        />
        <Select
          aria-label="Filter by subscription"
          className="w-44"
          value={subscribed || 'ALL'}
          onValueChange={(value) =>
            change({ subscribed: value === 'ALL' ? null : value, page: null })
          }
          options={[
            { value: 'ALL', label: 'With or without plan' },
            { value: 'yes', label: 'Subscribers' },
            { value: 'no', label: 'No subscription' },
          ]}
        />
        <Select
          aria-label="Sort by"
          className="w-40"
          value={sort}
          onValueChange={(value) =>
            change({ sort: value === 'createdAt' ? null : value, order: null, page: null })
          }
          options={VIEWER_SORT_FIELDS.map((value) => ({ value, label: SORT_LABELS[value] }))}
        />
        {filtered ? (
          <Button
            variant="ghost"
            onClick={() => {
              setSearch('');
              change({ q: null, status: null, page: null });
            }}
          >
            <X />
            Clear filters
          </Button>
        ) : null}
        {viewers.data ? (
          <span className="ml-auto text-xs text-muted-foreground tabular-nums">
            {viewers.data.total} {viewers.data.total === 1 ? 'viewer' : 'viewers'}
          </span>
        ) : null}
      </div>

      <ErrorNote error={viewers.error} className="mb-4" />
      {viewers.isPending ? <Skeleton className="h-80 rounded-xl" /> : null}

      {viewers.data && items.length === 0 ? (
        <EmptyState
          icon={filtered ? Search : UsersRound}
          title={filtered ? 'Nobody matches' : 'No viewers yet'}
          action={!filtered ? newButton : null}
        >
          {filtered
            ? 'Try another search or clear the filters.'
            : access.data?.registration === 'closed'
              ? 'Sign-up is closed, so viewers exist only when you create them here.'
              : 'Viewers appear here when they create an account on your site. You can also create one yourself.'}
        </EmptyState>
      ) : null}

      {items.length > 0 ? (
        <Card className="overflow-hidden">
          <Table>
            <thead>
              <tr>
                {columns.map(([field, label]) => (
                  <Th
                    key={label}
                    aria-sort={
                      field && sort === field
                        ? order === 'asc'
                          ? 'ascending'
                          : 'descending'
                        : undefined
                    }
                  >
                    {field ? (
                      <button
                        type="button"
                        onClick={() => sortBy(field)}
                        className="-mx-1 inline-flex items-center gap-1 rounded px-1 hover:text-foreground"
                      >
                        {label}
                        {sort === field ? (
                          order === 'asc' ? (
                            <ArrowUp className="size-3" />
                          ) : (
                            <ArrowDown className="size-3" />
                          )
                        ) : null}
                      </button>
                    ) : (
                      label
                    )}
                  </Th>
                ))}
                <Th className="w-10" aria-label="Actions" />
              </tr>
            </thead>
            <tbody>
              {items.map((viewer) => (
                <Tr key={viewer.id}>
                  <Td>
                    <button
                      type="button"
                      className="group flex items-center gap-3 text-left"
                      onClick={() => setOpen({ kind: 'detail', viewer })}
                    >
                      <Avatar name={viewer.displayName} muted={viewer.status === 'DISABLED'} />
                      <span className="min-w-0">
                        <span className="block max-w-xs truncate font-medium group-hover:underline">
                          {viewer.displayName}
                        </span>
                        <span className="flex max-w-xs items-center gap-1.5 text-xs text-muted-foreground">
                          <span className="truncate">{viewer.email}</span>
                          {viewer.emailVerifiedAt ? (
                            <MailCheck
                              className="size-3.5 shrink-0 text-success"
                              role="img"
                              aria-label="Address confirmed"
                            />
                          ) : (
                            <Badge tone="warning" className="shrink-0">
                              Not confirmed
                            </Badge>
                          )}
                          {viewer.plan ? (
                            <Badge tone="info" className="shrink-0">
                              {viewer.plan.name}
                            </Badge>
                          ) : null}
                        </span>
                      </span>
                    </button>
                  </Td>
                  <Td>
                    <StatusBadge status={viewer.status} />
                  </Td>
                  <Td className="tabular-nums">
                    {viewer.activeSessions > 0 ? (
                      viewer.activeSessions
                    ) : (
                      <span className="text-muted-foreground">Signed out</span>
                    )}
                  </Td>
                  <Td className="whitespace-nowrap text-muted-foreground">
                    {viewer.lastLoginAt ? (
                      <Tooltip content={formatDateTime(viewer.lastLoginAt)}>
                        <span>{formatRelative(viewer.lastLoginAt)}</span>
                      </Tooltip>
                    ) : (
                      'Never'
                    )}
                  </Td>
                  <Td className="whitespace-nowrap text-muted-foreground">
                    <Tooltip content={formatDateTime(viewer.createdAt)}>
                      <span>{formatRelative(viewer.createdAt)}</span>
                    </Tooltip>
                  </Td>
                  <Td>{rowMenu(viewer)}</Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        </Card>
      ) : null}

      {viewers.data ? (
        <Pagination
          page={page}
          pageSize={PAGE_SIZE}
          total={viewers.data.total}
          onChange={(next) => change({ page: next === 1 ? null : String(next) })}
        />
      ) : null}

      <ViewerFormDialog
        target={open?.kind === 'create' ? 'new' : open?.kind === 'edit' ? open.viewer : null}
        onClose={() => setOpen(null)}
        onSaved={() => {
          setOpen(null);
          refresh();
        }}
      />
      <PasswordDialog
        viewer={open?.kind === 'password' ? open.viewer : null}
        onClose={() => setOpen(null)}
        onSaved={() => {
          setOpen(null);
          refresh();
        }}
      />
      <DetailSheet
        viewer={open?.kind === 'detail' ? open.viewer : null}
        mayWrite={mayWrite}
        onClose={() => setOpen(null)}
        onEdit={(viewer) => setOpen({ kind: 'edit', viewer })}
        onPassword={(viewer) => setOpen({ kind: 'password', viewer })}
        onSignOut={(viewer) => void askSignOut(viewer)}
      />
    </>
  );
}

interface PasswordFieldProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
}

/**
 * A password an admin sets for someone else. It is shown, not hidden, because
 * the admin has to pass it on, and can be made up and copied with one click.
 */
function PasswordField({ label, value, onChange }: PasswordFieldProps) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // The clipboard can be blocked. The password stays visible to copy by hand.
      toast.error('Copying is blocked by the browser. Select the password and copy it by hand.');
    }
  };

  return (
    <Field
      label={label}
      hint={`At least ${MIN_PASSWORD_LENGTH} characters. Pass it on to the viewer yourself. They can change it in their account.`}
    >
      {(id) => (
        <div className="flex gap-2">
          <Input
            id={id}
            required
            minLength={MIN_PASSWORD_LENGTH}
            maxLength={128}
            autoComplete="off"
            spellCheck={false}
            className="font-mono"
            value={value}
            onChange={(event) => onChange(event.target.value)}
          />
          <Tooltip content="Make up a password">
            <Button
              size="icon"
              aria-label="Make up a password"
              onClick={() => onChange(generatePassword())}
            >
              <RefreshCw />
            </Button>
          </Tooltip>
          <Tooltip content={copied ? 'Copied' : 'Copy'}>
            <Button
              size="icon"
              aria-label="Copy the password"
              disabled={!value}
              onClick={() => void copy()}
            >
              {copied ? <Check /> : <Copy />}
            </Button>
          </Tooltip>
        </div>
      )}
    </Field>
  );
}

interface ViewerFormDialogProps {
  target: Viewer | 'new' | null;
  onClose: () => void;
  onSaved: () => void;
}

/** Creates a viewer, or changes the name and email address of one. */
function ViewerFormDialog({ target, onClose, onSaved }: ViewerFormDialogProps) {
  const viewer = target === 'new' || target === null ? undefined : target;
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [vouched, setVouched] = useState(true);
  const [streams, setStreams] = useState('');
  const maxStreams = parseStreamLimit(streams);

  const save = useMutation({
    mutationFn: () =>
      viewer
        ? viewersApi.update(viewer.id, {
            displayName: displayName.trim(),
            email: email.trim(),
            ...(maxStreams === 'invalid' ? {} : { maxStreams }),
          })
        : viewersApi.create({
            displayName: displayName.trim(),
            email: email.trim(),
            password,
            emailVerified: vouched,
          }),
    onSuccess: (saved) => {
      toast.success(viewer ? `${saved.displayName} saved` : `${saved.displayName} can now sign in`);
      onSaved();
    },
  });

  useEffect(() => {
    if (target !== null) {
      save.reset();
      setDisplayName(viewer?.displayName ?? '');
      setEmail(viewer?.email ?? '');
      setPassword(viewer ? '' : generatePassword());
      setVouched(true);
      setStreams(viewer?.maxStreams ? String(viewer.maxStreams) : '');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target]);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (maxStreams === 'invalid') {
      return;
    }
    save.mutate();
  };

  return (
    <Dialog open={target !== null} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogContent
        title={viewer ? `Edit ${viewer.displayName}` : 'New viewer'}
        description={
          viewer
            ? undefined
            : 'Creates an account someone can sign in with on your site. No email is sent.'
        }
      >
        <form onSubmit={submit} className="contents">
          <DialogBody>
            <Field label="Name">
              {(id) => (
                <Input
                  id={id}
                  required
                  autoFocus
                  maxLength={100}
                  value={displayName}
                  onChange={(event) => setDisplayName(event.target.value)}
                />
              )}
            </Field>
            <Field
              label="Email"
              hint={
                viewer
                  ? 'The viewer signs in with this address from now on. A new address counts as not confirmed.'
                  : undefined
              }
            >
              {(id) => (
                <Input
                  id={id}
                  type="email"
                  required
                  maxLength={254}
                  autoComplete="off"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                />
              )}
            </Field>
            {viewer ? (
              <Field
                label="Devices at the same time"
                hint={
                  maxStreams === 'invalid'
                    ? 'A number from 1 to 20, or empty.'
                    : 'On how many devices this account plays at once, whatever its plan says. Empty: as the plan or the installation says.'
                }
              >
                {(id) => (
                  <Input
                    id={id}
                    className="sm:max-w-40"
                    inputMode="numeric"
                    placeholder="As the plan"
                    aria-invalid={maxStreams === 'invalid'}
                    value={streams}
                    onChange={(event) => setStreams(event.target.value)}
                  />
                )}
              </Field>
            ) : null}
            {viewer ? null : (
              <>
                <PasswordField label="Password" value={password} onChange={setPassword} />
                <ToggleRow
                  label="The address is confirmed"
                  description="You know that this address belongs to the viewer. Turn off to let them confirm it by email first."
                  checked={vouched}
                  onCheckedChange={setVouched}
                />
              </>
            )}
            <ErrorNote error={save.error} />
          </DialogBody>
          <DialogFooter>
            <Button onClick={onClose}>Cancel</Button>
            <Button
              type="submit"
              variant="primary"
              loading={save.isPending}
              disabled={!displayName.trim() || !email.trim()}
            >
              {viewer ? 'Save' : 'Create viewer'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

interface PasswordDialogProps {
  viewer: Viewer | null;
  onClose: () => void;
  onSaved: () => void;
}

function PasswordDialog({ viewer, onClose, onSaved }: PasswordDialogProps) {
  const [password, setPassword] = useState('');
  const save = useMutation({
    mutationFn: () => viewersApi.resetPassword((viewer as Viewer).id, password),
    onSuccess: () => {
      toast.success(`New password set for ${viewer?.displayName}`);
      onSaved();
    },
  });

  useEffect(() => {
    if (viewer) {
      save.reset();
      setPassword(generatePassword());
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewer]);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    save.mutate();
  };

  return (
    <Dialog open={viewer !== null} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogContent
        title={`New password for ${viewer?.displayName ?? ''}`}
        description="The viewer is signed out on every device and signs in again with this password. Copy it before you save: it is not shown again."
      >
        <form onSubmit={submit} className="contents">
          <DialogBody>
            <PasswordField label="New password" value={password} onChange={setPassword} />
            <ErrorNote error={save.error} />
          </DialogBody>
          <DialogFooter>
            <Button onClick={onClose}>Cancel</Button>
            <Button
              type="submit"
              variant="primary"
              loading={save.isPending}
              disabled={password.length < MIN_PASSWORD_LENGTH}
            >
              Set password
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

interface DetailSheetProps {
  viewer: Viewer | null;
  mayWrite: boolean;
  onClose: () => void;
  onEdit: (viewer: Viewer) => void;
  onPassword: (viewer: Viewer) => void;
  onSignOut: (viewer: Viewer) => void;
}

/** One viewer with the devices they are signed in on. */
function DetailSheet({
  viewer,
  mayWrite,
  onClose,
  onEdit,
  onPassword,
  onSignOut,
}: DetailSheetProps) {
  const detail = useQuery({
    queryKey: ['viewers', 'detail', viewer?.id],
    queryFn: ({ signal }) => viewersApi.get((viewer as Viewer).id, signal),
    enabled: viewer !== null,
  });
  const queryClient = useQueryClient();
  const streams = useQuery({
    queryKey: ['viewers', 'streams', viewer?.id],
    queryFn: ({ signal }) => viewersApi.streams((viewer as Viewer).id, signal),
    enabled: viewer !== null,
    // What plays changes by itself: a stream ends, another device starts.
    refetchInterval: 15_000,
  });
  const stopStream = useMutation({
    mutationFn: (streamId: string) => viewersApi.stopStream((viewer as Viewer).id, streamId),
    onSuccess: () => {
      toast.success('Stopped. The player goes dark within half a minute.');
      void queryClient.invalidateQueries({ queryKey: ['viewers', 'streams', viewer?.id] });
    },
  });
  const saved = useQuery({
    queryKey: ['viewers', 'saved', viewer?.id],
    queryFn: ({ signal }) => viewersApi.saved((viewer as Viewer).id, signal),
    enabled: viewer !== null,
  });
  const watching = useQuery({
    queryKey: ['viewers', 'watching', viewer?.id],
    queryFn: ({ signal }) => viewersApi.watching((viewer as Viewer).id, signal),
    enabled: viewer !== null,
  });
  const confirm = useConfirm();
  const removeDevice = useMutation({
    mutationFn: (device: ViewerDevice) => viewersApi.removeDevice(viewer?.id ?? '', device.id),
    onSuccess: (_, device) => toast.success(`${device.name} was removed`),
    onError: (error: Error) => toast.error(error.message),
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['viewers'] }),
  });
  const clearPin = useMutation({
    mutationFn: (profile: ViewerProfile) =>
      viewersApi.clearProfilePin(viewer?.id ?? '', profile.id),
    onSuccess: (_, profile) => toast.success(`${profile.name} no longer asks for a PIN`),
    onError: (error: Error) => toast.error(error.message),
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['viewers'] }),
  });
  const askClearPin = async (profile: ViewerProfile) => {
    const confirmed = await confirm({
      title: `Take the PIN off ${profile.name}?`,
      description:
        'For a viewer who forgot the PIN and cannot get in. Anyone on the account can then choose this profile, until the viewer sets a new PIN.',
      confirmLabel: 'Take the PIN off',
      destructive: true,
    });
    if (confirmed) {
      clearPin.mutate(profile);
    }
  };
  const askRemoveDevice = async (device: ViewerDevice) => {
    const confirmed = await confirm({
      title: `Remove ${device.name}?`,
      description: device.signedIn
        ? 'It is signed out at once and what it plays stops. The viewer can sign it in again.'
        : 'It is taken off the list. Nothing changes for the viewer.',
      confirmLabel: 'Remove',
      destructive: true,
    });
    if (confirmed) {
      removeDevice.mutate(device);
    }
  };

  // Who watched is worth saying only when several people share the account.
  const sharedAccount = (detail.data?.profiles.length ?? 1) > 1;
  // The list row is shown at once and replaced by the fresh answer when it arrives.
  const shown = detail.data ?? viewer;

  return (
    <Dialog open={viewer !== null} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogContent variant="sheet" title={shown?.displayName ?? ''} description={shown?.email}>
        {shown ? (
          <DialogBody className="content-start">
            <div className="flex items-center gap-3">
              <Avatar name={shown.displayName} muted={shown.status === 'DISABLED'} />
              <StatusBadge status={shown.status} />
            </div>
            <Facts
              items={[
                [
                  'Email address',
                  shown.emailVerifiedAt
                    ? `Confirmed ${formatDateTime(shown.emailVerifiedAt)}`
                    : 'Not confirmed',
                ],
                ['Joined', formatDateTime(shown.createdAt)],
                ['Last sign-in', shown.lastLoginAt ? formatDateTime(shown.lastLoginAt) : 'Never'],
                ['Changed', formatDateTime(shown.updatedAt)],
              ]}
            />

            {shown ? (
              <ViewerSubscription viewerId={shown.id} viewerName={shown.displayName} />
            ) : null}
            {shown ? <ViewerPurchases viewerId={shown.id} viewerName={shown.displayName} /> : null}
            {shown ? <ViewerPayments viewerId={shown.id} viewerName={shown.displayName} /> : null}

            {detail.data ? (
              <div>
                <h3 className="mb-2 text-[13px] font-medium">
                  {detail.data.profiles.length === 1
                    ? '1 profile'
                    : `${detail.data.profiles.length} profiles`}
                </h3>
                <ul className="divide-y rounded-md border">
                  {detail.data.profiles.map((profile) => (
                    <li key={profile.id} className="flex items-center gap-3 px-3 py-2">
                      <span
                        aria-hidden="true"
                        className="grid size-8 shrink-0 place-items-center rounded-[4px] text-sm font-bold text-black"
                        style={{ background: profileColor(profile.color) }}
                      >
                        {[...profile.name.trim()][0]?.toUpperCase() ?? '?'}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm font-medium">
                          <span className="truncate">{profile.name}</span>
                          {profile.isMain ? <Badge>Main</Badge> : null}
                          {profile.isKids ? <Badge tone="info">Kids</Badge> : null}
                        </p>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          {describeLimit(profile.maxAge) ?? 'Watches everything'}
                          {profile.locked ? ', asks for a PIN' : ''}
                        </p>
                      </div>
                      {profile.locked ? (
                        mayWrite ? (
                          <Tooltip content="For a viewer who forgot the PIN">
                            <Button
                              size="sm"
                              variant="ghost"
                              disabled={clearPin.isPending}
                              onClick={() => void askClearPin(profile)}
                            >
                              <LockOpen />
                              Take the PIN off
                            </Button>
                          </Tooltip>
                        ) : (
                          <Lock
                            className="size-4 shrink-0 text-muted-foreground"
                            aria-label="Asks for a PIN"
                          />
                        )
                      ) : null}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            <div>
              <h3 className="mb-2 text-[13px] font-medium">
                Signed in on {shown.activeSessions}{' '}
                {shown.activeSessions === 1 ? 'device' : 'devices'}
              </h3>
              <ErrorNote error={detail.error} />
              {detail.isPending ? <Skeleton className="h-20 rounded-lg" /> : null}
              {detail.data && detail.data.sessions.length === 0 ? (
                <p className="rounded-lg border border-dashed p-3 text-sm text-muted-foreground">
                  Not signed in anywhere.
                </p>
              ) : null}
              {detail.data && detail.data.sessions.length > 0 ? (
                <ul className="divide-y rounded-lg border">
                  {detail.data.sessions.map((session) => (
                    <li key={session.id} className="flex items-start gap-3 p-3">
                      <MonitorSmartphone
                        className="mt-0.5 size-4 shrink-0 text-muted-foreground"
                        aria-hidden="true"
                      />
                      <div className="min-w-0 text-sm">
                        <p className="font-medium" title={session.userAgent ?? undefined}>
                          {session.device?.name ?? describeDevice(session.userAgent)}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {session.device ? `${describeApp(session.device)}. ` : ''}
                          Used {formatRelative(session.lastUsedAt)}, signed in{' '}
                          {formatRelative(session.createdAt)}
                          {session.ipAddress ? ` from ${session.ipAddress}` : ''}
                        </p>
                      </div>
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>

            {detail.data && detail.data.devices.length > 0 ? (
              <div>
                <div className="mb-2 flex items-baseline justify-between gap-3">
                  <h3 className="text-[13px] font-medium">Apps and televisions</h3>
                  <p className="text-xs text-muted-foreground">
                    {detail.data.devices.length} known,{' '}
                    {detail.data.devices.filter((device) => device.signedIn).length} signed in
                  </p>
                </div>
                <ul className="divide-y rounded-lg border">
                  {detail.data.devices.map((device) => {
                    const DeviceIcon = DEVICE_ICONS[device.kind] ?? MonitorSmartphone;
                    return (
                      <li key={device.id} className="flex items-start gap-3 p-3">
                        <DeviceIcon
                          className="mt-0.5 size-4 shrink-0 text-muted-foreground"
                          aria-hidden="true"
                        />
                        <div className="min-w-0 flex-1 text-sm">
                          <p className="flex flex-wrap items-center gap-x-2 gap-y-1 font-medium">
                            {device.name}
                            {device.appVersion ? (
                              <Badge className="font-mono text-[11px] font-normal">
                                {device.appVersion}
                              </Badge>
                            ) : null}
                            {device.signedIn ? null : <Badge>Signed out</Badge>}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {describeApp(device)}. Used {formatRelative(device.lastSeenAt)}, first
                            seen {formatRelative(device.createdAt)}
                          </p>
                        </div>
                        {mayWrite ? (
                          <Tooltip
                            content={device.signedIn ? 'Sign out and forget' : 'Forget this device'}
                          >
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              aria-label={`Remove ${device.name}`}
                              disabled={removeDevice.isPending}
                              onClick={() => void askRemoveDevice(device)}
                            >
                              <Trash2 />
                            </Button>
                          </Tooltip>
                        ) : null}
                      </li>
                    );
                  })}
                </ul>
              </div>
            ) : null}

            <div>
              <div className="mb-2 flex items-baseline justify-between gap-3">
                <h3 className="text-[13px] font-medium">Playing now</h3>
                {streams.data ? (
                  <p className="text-xs text-muted-foreground">
                    {describeStreamLimit(streams.data)}
                  </p>
                ) : null}
              </div>
              <ErrorNote error={streams.error ?? stopStream.error} />
              {streams.isPending ? <Skeleton className="h-14 rounded-lg" /> : null}
              {streams.data && streams.data.streams.length === 0 ? (
                <p className="rounded-lg border border-dashed p-3 text-sm text-muted-foreground">
                  Nothing is playing on this account.
                </p>
              ) : null}
              {streams.data && streams.data.streams.length > 0 ? (
                <ul className="divide-y rounded-lg border">
                  {streams.data.streams.map((stream) => (
                    <li key={stream.id} className="flex items-center gap-3 px-3 py-2.5 text-sm">
                      <span className="relative flex size-2 shrink-0" aria-hidden="true">
                        <span className="absolute inline-flex size-full animate-ping rounded-full bg-success opacity-60" />
                        <span className="relative inline-flex size-2 rounded-full bg-success" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-medium">
                          {stream.kind === 'LIVE' ? 'Watching' : 'Playing'} {stream.subject}
                        </p>
                        <p
                          className="truncate text-xs text-muted-foreground"
                          title={stream.userAgent ?? undefined}
                        >
                          {[
                            describeStreamDevice(stream),
                            sharedAccount && stream.profile ? stream.profile.name : null,
                            `since ${formatRelative(stream.startedAt)}`,
                          ]
                            .filter(Boolean)
                            .join(', ')}
                        </p>
                      </div>
                      {mayWrite ? (
                        <Button
                          size="sm"
                          loading={stopStream.isPending && stopStream.variables === stream.id}
                          onClick={() => stopStream.mutate(stream.id)}
                        >
                          Stop
                        </Button>
                      ) : null}
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>

            <div>
              <div className="mb-2 flex items-baseline justify-between gap-3">
                <h3 className="text-[13px] font-medium">My list</h3>
                {saved.data && saved.data.total > 0 ? (
                  <p className="text-xs text-muted-foreground">
                    {saved.data.total} saved to watch later
                  </p>
                ) : null}
              </div>
              <ErrorNote error={saved.error} />
              {saved.isPending ? <Skeleton className="h-14 rounded-lg" /> : null}
              {saved.data && saved.data.items.length === 0 ? (
                <p className="rounded-lg border border-dashed p-3 text-sm text-muted-foreground">
                  Nothing saved for later.
                </p>
              ) : null}
              {saved.data && saved.data.items.length > 0 ? (
                <>
                  <ul className="divide-y rounded-lg border">
                    {saved.data.items.map((item) => {
                      const Icon = item.title.type === 'SERIES' ? Tv : Film;
                      return (
                        <li
                          key={`${item.profile.id}:${item.title.id}`}
                          className="flex items-center gap-3 px-3 py-2.5 text-sm"
                        >
                          <Icon
                            className="size-4 shrink-0 text-muted-foreground"
                            aria-hidden="true"
                          />
                          <div className="min-w-0 flex-1">
                            <Link
                              to={titlePath(item.title)}
                              className="block truncate font-medium underline-offset-4 hover:underline"
                            >
                              {item.title.name}
                            </Link>
                            <p className="truncate text-xs text-muted-foreground">
                              {[
                                `Saved ${formatRelative(item.addedAt)}`,
                                sharedAccount ? `by ${item.profile.name}` : null,
                              ]
                                .filter(Boolean)
                                .join(', ')}
                            </p>
                          </div>
                          {item.title.status !== 'PUBLISHED' ? (
                            <Badge tone="warning">Not published</Badge>
                          ) : item.started ? (
                            <Badge tone="success">Begun</Badge>
                          ) : (
                            <Badge>Not begun</Badge>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                  {saved.data.total > saved.data.items.length ? (
                    <p className="mt-2 text-xs text-muted-foreground">
                      The latest {saved.data.items.length} of {saved.data.total}.
                    </p>
                  ) : null}
                </>
              ) : null}
            </div>

            <div>
              <div className="mb-2 flex items-baseline justify-between gap-3">
                <h3 className="text-[13px] font-medium">Watching</h3>
                {watching.data && watching.data.total > 0 ? (
                  <p className="text-xs text-muted-foreground">
                    {watching.data.total} {watching.data.total === 1 ? 'video' : 'videos'},{' '}
                    {watching.data.completed} watched to the end
                  </p>
                ) : null}
              </div>
              <ErrorNote error={watching.error} />
              {watching.isPending ? <Skeleton className="h-20 rounded-lg" /> : null}
              {watching.data && watching.data.items.length === 0 ? (
                <p className="rounded-lg border border-dashed p-3 text-sm text-muted-foreground">
                  Nothing watched yet.
                </p>
              ) : null}
              {watching.data && watching.data.items.length > 0 ? (
                <>
                  <ul className="divide-y rounded-lg border">
                    {watching.data.items.map((item) => {
                      const summary = summarizeWatching(item);
                      return (
                        <li key={item.id} className="flex items-start gap-3 p-3">
                          {item.title.type === 'SERIES' ? (
                            <Tv
                              className="mt-0.5 size-4 shrink-0 text-muted-foreground"
                              aria-hidden="true"
                            />
                          ) : (
                            <Film
                              className="mt-0.5 size-4 shrink-0 text-muted-foreground"
                              aria-hidden="true"
                            />
                          )}
                          <div className="min-w-0 flex-1 text-sm">
                            <div className="flex items-baseline justify-between gap-3">
                              <Link
                                to={titlePath(item.title)}
                                className="truncate font-medium underline-offset-4 hover:underline"
                              >
                                {item.title.name}
                              </Link>
                              <span className="shrink-0 text-xs text-muted-foreground">
                                {formatRelative(item.watchedAt)}
                              </span>
                            </div>
                            {summary.episode || sharedAccount ? (
                              <p className="truncate text-xs text-muted-foreground">
                                {[summary.episode, sharedAccount ? `by ${item.profile.name}` : null]
                                  .filter(Boolean)
                                  .join(', ')}
                              </p>
                            ) : null}
                            <div className="mt-1.5 flex items-center gap-2.5">
                              <div
                                className="h-1 flex-1 overflow-hidden rounded-full bg-muted"
                                role="progressbar"
                                aria-valuemin={0}
                                aria-valuemax={100}
                                aria-valuenow={summary.percent}
                                aria-label={`${item.title.name}: ${summary.state}`}
                              >
                                <div
                                  className="h-full rounded-full bg-primary"
                                  style={{ width: `${summary.percent}%` }}
                                />
                              </div>
                              <span className="flex shrink-0 items-center gap-1 text-xs text-muted-foreground tabular-nums">
                                {summary.percent === 100 ? (
                                  <Check className="size-3.5" aria-hidden="true" />
                                ) : null}
                                {summary.state}
                              </span>
                            </div>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                  {watching.data.total > watching.data.items.length ? (
                    <p className="mt-2 text-xs text-muted-foreground">
                      The latest {watching.data.items.length} of {watching.data.total}.
                    </p>
                  ) : null}
                </>
              ) : null}
            </div>
          </DialogBody>
        ) : null}
        <DialogFooter>
          {mayWrite && shown ? (
            <>
              <Button onClick={() => onEdit(shown)}>
                <Pencil />
                Edit
              </Button>
              <Button onClick={() => onPassword(shown)}>
                <KeyRound />
                New password
              </Button>
              <Button disabled={shown.activeSessions === 0} onClick={() => onSignOut(shown)}>
                <LogOut />
                Sign out everywhere
              </Button>
            </>
          ) : (
            <Button onClick={onClose}>Close</Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
