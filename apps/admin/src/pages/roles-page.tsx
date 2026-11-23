// SPDX-License-Identifier: AGPL-3.0-only
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft,
  Check,
  Copy,
  Lock,
  MoreHorizontal,
  Plus,
  ShieldHalf,
  Trash2,
  TriangleAlert,
  Users,
} from 'lucide-react';
import { type FormEvent, useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { toast } from 'sonner';
import { ApiError } from '@/api/client';
import { rolesApi } from '@/api/endpoints';
import { type Permission, type PermissionSection, ROLE_COLORS, type Role } from '@/api/types';
import { useSession } from '@/auth/session';
import { useConfirm } from '@/components/confirm';
import { AccessBar, PermissionMatrix, RoleBadge, RoleComparison } from '@/components/role-access';
import { Button } from '@/components/ui/button';
import {
  Badge,
  Card,
  EmptyState,
  ErrorNote,
  PageHeader,
  Skeleton,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui/display';
import { Field, Input, Select, Textarea } from '@/components/ui/form';
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
} from '@/components/ui/overlay';
import { cn } from '@/lib/cn';
import { formatRelative } from '@/lib/format';
import {
  changesOf,
  copyOf,
  covers,
  draftOf,
  draftProblem,
  isDirty,
  type RoleDraft,
  roleColorClasses,
  roleOptions,
  roleValueOf,
  sensitiveAreas,
  summarize,
  summaryText,
} from '@/lib/roles';

/** What the address names: a built-in role by its key, a custom one by its id, or "new". */
const keyOf = (role: Role) => role.id ?? role.key;

const EMPTY_DRAFT: RoleDraft = {
  id: null,
  name: '',
  description: '',
  color: 'blue',
  permissions: [],
};

const admins = (count: number) => (count === 1 ? '1 admin' : `${count} admins`);

/** The roles of the panel: what each kind of admin may do. */
export function RolesPage() {
  const { state, can } = useSession();
  const confirm = useConfirm();
  const queryClient = useQueryClient();
  const [params, setParams] = useSearchParams();
  const [seed, setSeed] = useState<RoleDraft>(EMPTY_DRAFT);
  const [dirty, setDirty] = useState(false);
  const [deleting, setDeleting] = useState<Role | null>(null);

  const me = state.status === 'signedIn' ? state.me : null;
  const mine: readonly Permission[] = me?.permissions ?? [];
  const mayWrite = can('admins:write');

  const overview = useQuery({
    queryKey: ['roles'],
    queryFn: ({ signal }) => rolesApi.overview(signal),
  });
  const roles = overview.data?.roles ?? [];
  const catalog = overview.data?.catalog ?? [];
  const builtIn = roles.filter((role) => role.builtIn);
  const custom = roles.filter((role) => !role.builtIn);

  const view = params.get('view') === 'compare' ? 'compare' : 'roles';
  const chosen = params.get('role');
  const selected = chosen === 'new' ? null : roles.find((role) => keyOf(role) === chosen);
  // Without a choice, a wide screen shows the first role; a phone shows the list.
  const shown = chosen === 'new' ? null : (selected ?? roles[0] ?? null);

  const leave = async (): Promise<boolean> => {
    if (!dirty) {
      return true;
    }
    const confirmed = await confirm({
      title: 'Leave without saving?',
      description: 'What you changed on this role is lost.',
      confirmLabel: 'Leave',
      destructive: true,
    });
    if (confirmed) {
      setDirty(false);
    }
    return confirmed;
  };

  const go = async (next: { role?: string | null; view?: 'roles' | 'compare' }) => {
    if (!(await leave())) {
      return;
    }
    const updated = new URLSearchParams(params);
    if (next.view !== undefined) {
      if (next.view === 'compare') {
        updated.set('view', 'compare');
      } else {
        updated.delete('view');
      }
    }
    if (next.role !== undefined) {
      if (next.role === null) {
        updated.delete('role');
      } else {
        updated.set('role', next.role);
      }
    }
    setParams(updated);
  };

  const startNew = async (from?: Role) => {
    if (!(await leave())) {
      return;
    }
    setSeed(
      from
        ? copyOf(
            from,
            mine,
            roles.map((role) => role.name),
          )
        : EMPTY_DRAFT,
    );
    const updated = new URLSearchParams(params);
    updated.delete('view');
    updated.set('role', 'new');
    setParams(updated);
  };

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ['roles'] });
    void queryClient.invalidateQueries({ queryKey: ['admins'] });
  };

  return (
    <>
      <PageHeader
        title="Roles"
        description="What each kind of admin may do. Four roles are built in; make your own for everything in between."
        actions={
          mayWrite ? (
            <Button variant="primary" onClick={() => void startNew()}>
              <Plus />
              New role
            </Button>
          ) : null
        }
      />

      <ErrorNote error={overview.error} className="mb-4" />
      {overview.isPending ? (
        <div className="grid gap-6 lg:grid-cols-[18.5rem_minmax(0,1fr)]">
          <Skeleton className="h-96 rounded-xl" />
          <Skeleton className="h-[32rem] rounded-xl" />
        </div>
      ) : null}

      {overview.data ? (
        <Tabs
          value={view}
          onValueChange={(next) => void go({ view: next === 'compare' ? 'compare' : 'roles' })}
        >
          <TabsList className={cn(chosen && view === 'roles' && 'max-lg:hidden')}>
            <TabsTrigger value="roles">Roles</TabsTrigger>
            <TabsTrigger value="compare">Compare</TabsTrigger>
          </TabsList>

          <TabsContent value="roles">
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-[18.5rem_minmax(0,1fr)] lg:items-start">
              <nav
                aria-label="Roles"
                className={cn('grid gap-5 lg:sticky lg:top-20', chosen && 'max-lg:hidden')}
              >
                <RoleList
                  title="Built in"
                  roles={builtIn}
                  catalog={catalog}
                  activeKey={shown ? keyOf(shown) : null}
                  implicit={!chosen}
                  onSelect={(role) => void go({ role: keyOf(role) })}
                />
                <RoleList
                  title="Custom"
                  roles={custom}
                  catalog={catalog}
                  activeKey={shown ? keyOf(shown) : null}
                  implicit={!chosen}
                  onSelect={(role) => void go({ role: keyOf(role) })}
                  empty={
                    mayWrite
                      ? 'None yet. Make one for a team that needs its own mix, like support or finance.'
                      : 'None yet.'
                  }
                  draftName={chosen === 'new' ? 'New role' : null}
                />
              </nav>

              <div className={cn('min-w-0', !chosen && 'max-lg:hidden')}>
                <button
                  type="button"
                  onClick={() => void go({ role: null })}
                  className="mb-3 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground lg:hidden"
                >
                  <ArrowLeft className="size-4" />
                  All roles
                </button>

                {chosen && chosen !== 'new' && !selected ? (
                  <EmptyState icon={ShieldHalf} title="This role is gone">
                    It may have been deleted. Choose another one from the list.
                  </EmptyState>
                ) : (
                  <RoleEditor
                    key={shown ? `${keyOf(shown)}:${shown.updatedAt ?? ''}` : `new:${seed.name}`}
                    role={shown}
                    seed={seed}
                    roles={roles}
                    catalog={catalog}
                    mine={mine}
                    mayWrite={mayWrite}
                    ownRoleId={me?.customRole?.id ?? null}
                    onDirtyChange={setDirty}
                    onDuplicate={(role) => void startNew(role)}
                    onDelete={setDeleting}
                    onCancelNew={() => {
                      setDirty(false);
                      const updated = new URLSearchParams(params);
                      updated.delete('role');
                      setParams(updated);
                    }}
                    onSaved={(role, message) => {
                      setDirty(false);
                      toast.success(message.title, { description: message.description });
                      refresh();
                      const updated = new URLSearchParams(params);
                      updated.set('role', keyOf(role));
                      setParams(updated, { replace: true });
                    }}
                  />
                )}
              </div>
            </div>
          </TabsContent>

          <TabsContent value="compare">
            <Card className="overflow-hidden">
              <RoleComparison
                roles={roles}
                catalog={catalog}
                onSelect={(role) => void go({ role: keyOf(role), view: 'roles' })}
              />
            </Card>
            <p className="mt-3 text-xs text-muted-foreground">
              A pencil means the role may change the area, an eye that it may only see it. Choose a
              role at the top to open it.
            </p>
          </TabsContent>
        </Tabs>
      ) : null}

      <DeleteRoleDialog
        role={deleting}
        roles={roles}
        me={me ? { role: me.role, permissions: me.permissions } : null}
        onClose={() => setDeleting(null)}
        onDeleted={(role, moved) => {
          setDeleting(null);
          setDirty(false);
          toast.success(`${role.name} was deleted`, {
            description:
              moved > 0
                ? `${admins(moved)} got the other role and ${moved === 1 ? 'was' : 'were'} signed out.`
                : undefined,
          });
          refresh();
          const updated = new URLSearchParams(params);
          updated.delete('role');
          setParams(updated, { replace: true });
        }}
      />
    </>
  );
}

function RoleList({
  title,
  roles,
  catalog,
  activeKey,
  implicit,
  onSelect,
  empty,
  draftName,
}: {
  /** The active role was not chosen: it is the one a wide screen opens by itself. */
  implicit: boolean;
  title: string;
  roles: readonly Role[];
  catalog: readonly PermissionSection[];
  activeKey: string | null;
  onSelect: (role: Role) => void;
  empty?: string;
  /** Shown as the last, chosen entry while a new role is being made. */
  draftName?: string | null;
}) {
  return (
    <div>
      <h2 className="mb-2 px-1 text-xs font-medium text-muted-foreground">{title}</h2>
      {roles.length === 0 && !draftName ? (
        <p className="rounded-xl border border-dashed px-4 py-5 text-sm text-muted-foreground">
          {empty}
        </p>
      ) : (
        <ul className="grid gap-1.5">
          {roles.map((role) => {
            const active = !draftName && keyOf(role) === activeKey;
            return (
              <li key={keyOf(role)}>
                <button
                  type="button"
                  onClick={() => onSelect(role)}
                  aria-current={active ? 'true' : undefined}
                  className={cn(
                    'grid w-full gap-2 rounded-xl border bg-card px-3.5 py-3 text-left transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring',
                    !active && 'hover:bg-accent',
                    // A phone shows the list alone until a role is chosen: nothing is open yet.
                    active && !implicit && 'border-primary/50 ring-1 ring-primary/30',
                    active &&
                      implicit &&
                      'max-lg:hover:bg-accent lg:border-primary/50 lg:ring-1 lg:ring-primary/30',
                  )}
                >
                  <span className="flex items-center justify-between gap-3">
                    <span className="flex min-w-0 items-center gap-2 text-sm font-medium">
                      <span
                        className={cn(
                          'size-2 shrink-0 rounded-full',
                          roleColorClasses(role.color).dot,
                        )}
                        aria-hidden="true"
                      />
                      <span className="truncate">{role.name}</span>
                    </span>
                    <span className="flex shrink-0 items-center gap-1 text-xs text-muted-foreground tabular-nums">
                      <Users className="size-3.5" aria-hidden="true" />
                      {role.adminCount}
                      <span className="sr-only"> admins</span>
                    </span>
                  </span>
                  <AccessBar permissions={role.permissions} catalog={catalog} />
                </button>
              </li>
            );
          })}
          {draftName ? (
            <li>
              <div className="grid gap-2 rounded-xl border border-dashed border-primary/50 bg-card px-3.5 py-3 ring-1 ring-primary/30">
                <span className="flex items-center gap-2 text-sm font-medium">
                  <Plus className="size-3.5 text-primary" aria-hidden="true" />
                  {draftName}
                </span>
                <span className="text-xs text-muted-foreground">Not saved yet</span>
              </div>
            </li>
          ) : null}
        </ul>
      )}
    </div>
  );
}

interface RoleEditorProps {
  /** The role shown. Null while a new one is being made. */
  role: Role | null;
  /** What a new role starts from. */
  seed: RoleDraft;
  roles: readonly Role[];
  catalog: readonly PermissionSection[];
  mine: readonly Permission[];
  mayWrite: boolean;
  /** The custom role the signed-in admin holds themselves. */
  ownRoleId: string | null;
  onDirtyChange: (dirty: boolean) => void;
  onDuplicate: (role: Role) => void;
  onDelete: (role: Role) => void;
  onCancelNew: () => void;
  onSaved: (role: Role, message: { title: string; description?: string }) => void;
}

/** Why a role is shown without controls. Null when it can be changed. */
function lockReason(
  role: Role | null,
  props: Pick<RoleEditorProps, 'mayWrite' | 'ownRoleId' | 'mine'>,
): string | null {
  if (!role) {
    return null;
  }
  if (role.builtIn) {
    return 'Built-in roles stay as they are. Duplicate this one to make your own version of it.';
  }
  if (!props.mayWrite) {
    return 'Your role lets you see roles, not change them.';
  }
  if (role.id === props.ownRoleId) {
    return 'This is the role you hold yourself. Another admin has to change it.';
  }
  if (!covers(props.mine, role.permissions)) {
    return 'This role may do more than your own, so you cannot change it.';
  }
  return null;
}

function RoleEditor(props: RoleEditorProps) {
  const { role, seed, roles, catalog, mine, mayWrite } = props;
  const [draft, setDraft] = useState<RoleDraft>(() => (role ? draftOf(role) : seed));
  const locked = lockReason(role, props);
  const editable = locked === null;
  const dirty = editable && isDirty(draft, role);

  const { onDirtyChange } = props;
  useEffect(() => {
    // A new role counts as unsaved once something was put into it.
    onDirtyChange(role ? dirty : draft.name.trim() !== '' || draft.permissions.length > 0);
  }, [dirty, role, draft.name, draft.permissions.length, onDirtyChange]);

  const detail = useQuery({
    queryKey: ['roles', role?.id],
    queryFn: ({ signal }) => rolesApi.get(role?.id as string, signal),
    enabled: Boolean(role?.id),
  });

  const save = useMutation({
    mutationFn: () =>
      role?.id
        ? rolesApi.update(role.id, changesOf(draft, role))
        : rolesApi.create({
            name: draft.name.trim(),
            description: draft.description.trim(),
            color: draft.color,
            permissions: draft.permissions,
          }),
    onSuccess: (saved) =>
      props.onSaved(
        saved,
        role
          ? {
              title: `${saved.name} was saved`,
              description:
                saved.adminCount > 0
                  ? `${admins(saved.adminCount)} ${saved.adminCount === 1 ? 'works' : 'work'} with the new permissions from now on.`
                  : undefined,
            }
          : {
              title: `${saved.name} is ready`,
              description: 'Give it to someone on the Admins page.',
            },
      ),
  });

  const problem = draftProblem(draft, roles);
  const summary = useMemo(
    () => summarize(draft.permissions, catalog),
    [draft.permissions, catalog],
  );
  const risky = sensitiveAreas(draft.permissions, catalog);
  const startOptions = useMemo(
    () =>
      roles
        .filter((entry) => entry.key !== 'OWNER')
        .map((entry) => ({
          value: roleValueOf(entry),
          label: entry.name,
          description: covers(mine, entry.permissions)
            ? summaryText(summarize(entry.permissions, catalog))
            : 'As far as your own role reaches',
        })),
    [roles, mine, catalog],
  );
  const [startFrom, setStartFrom] = useState('');

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!problem) {
      save.mutate();
    }
  };

  return (
    <form onSubmit={submit}>
      <Card>
        <header className="flex flex-wrap items-start justify-between gap-x-4 gap-y-3 border-b px-5 py-4">
          <div className="grid min-w-0 gap-1.5">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-lg leading-tight font-semibold break-words">
                {role ? role.name : 'New role'}
              </h2>
              {role?.builtIn ? (
                <Badge>
                  <Lock className="size-3" aria-hidden="true" />
                  Built in
                </Badge>
              ) : null}
              {role?.like && !editable ? <Badge tone="info">Covers {like(role.like)}</Badge> : null}
            </div>
            <p className="max-w-2xl text-sm text-muted-foreground">
              {role
                ? role.description || 'No description.'
                : 'A name, a colour and what its holders may do. Nobody holds it until you give it to them.'}
            </p>
            {role ? (
              <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                <span>
                  {role.adminCount === 0 ? 'Nobody holds it' : `Held by ${admins(role.adminCount)}`}
                </span>
                <span aria-hidden="true">/</span>
                <span>{summaryText(summarize(role.permissions, catalog))}</span>
                {role.updatedAt ? (
                  <>
                    <span aria-hidden="true">/</span>
                    <span>Changed {formatRelative(role.updatedAt)}</span>
                  </>
                ) : null}
              </p>
            ) : null}
          </div>

          {role && (mayWrite || !role.builtIn) ? (
            <div className="flex shrink-0 items-center gap-2">
              {mayWrite ? (
                <Button onClick={() => props.onDuplicate(role)}>
                  <Copy />
                  Duplicate
                </Button>
              ) : null}
              {editable ? (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" aria-label={`More for ${role.name}`}>
                      <MoreHorizontal />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem asChild>
                      <Link to="/admins">
                        <Users />
                        Open admins
                      </Link>
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem destructive onSelect={() => props.onDelete(role)}>
                      <Trash2 />
                      Delete role
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              ) : null}
            </div>
          ) : null}
        </header>

        <div className="grid gap-6 p-5">
          {locked ? (
            <p className="flex items-start gap-2.5 rounded-lg bg-muted px-3.5 py-3 text-sm text-muted-foreground">
              <Lock className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
              {locked}
            </p>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Name">
                {(id) => (
                  <Input
                    id={id}
                    maxLength={40}
                    autoFocus={!role}
                    placeholder="Support"
                    value={draft.name}
                    onChange={(event) => setDraft({ ...draft, name: event.target.value })}
                  />
                )}
              </Field>
              <Field label="Colour" hint="Of its badge, wherever the role is shown.">
                {() => (
                  <div
                    className="flex flex-wrap items-center gap-2"
                    role="radiogroup"
                    aria-label="Colour"
                  >
                    {ROLE_COLORS.map((color) => (
                      <button
                        key={color}
                        type="button"
                        role="radio"
                        aria-checked={draft.color === color}
                        aria-label={color}
                        onClick={() => setDraft({ ...draft, color })}
                        className={cn(
                          'flex size-7 items-center justify-center rounded-full text-white outline-none ring-offset-2 ring-offset-card focus-visible:ring-2 focus-visible:ring-ring',
                          roleColorClasses(color).dot,
                          draft.color === color && 'ring-2 ring-foreground/70',
                        )}
                      >
                        {draft.color === color ? <Check className="size-3.5" /> : null}
                      </button>
                    ))}
                    <RoleBadge
                      name={draft.name.trim() || 'Preview'}
                      color={draft.color}
                      className="ml-2 max-w-40"
                    />
                  </div>
                )}
              </Field>
              <Field
                label="Description"
                hint="For the other admins: who gets this role, in a sentence."
                className="sm:col-span-2"
              >
                {(id) => (
                  <Textarea
                    id={id}
                    rows={2}
                    maxLength={200}
                    placeholder="Answers viewers and looks after their accounts."
                    value={draft.description}
                    onChange={(event) => setDraft({ ...draft, description: event.target.value })}
                  />
                )}
              </Field>
              {!role ? (
                <Field
                  label="Start from"
                  hint="Copies what that role may do. Change it below as you like."
                  className="sm:col-span-2 sm:max-w-sm"
                >
                  {(id) => (
                    <Select
                      id={id}
                      value={startFrom}
                      placeholder="Nothing"
                      options={startOptions}
                      onValueChange={(value) => {
                        setStartFrom(value);
                        const from = roles.find((entry) => roleValueOf(entry) === value);
                        if (from) {
                          setDraft({
                            ...draft,
                            permissions: from.permissions.filter((permission) =>
                              mine.includes(permission),
                            ),
                          });
                        }
                      }}
                    />
                  )}
                </Field>
              ) : null}
            </div>
          )}

          <div>
            <div className="mb-4 flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
              <h3 className="text-[15px] font-semibold">What it may do</h3>
              <div className="flex min-w-48 flex-1 items-center justify-end gap-3 sm:flex-none">
                <span className="text-xs text-muted-foreground">{summaryText(summary)}</span>
                <AccessBar permissions={draft.permissions} catalog={catalog} className="w-24" />
              </div>
            </div>
            <PermissionMatrix
              catalog={catalog}
              value={draft.permissions}
              mine={mine}
              onChange={editable ? (permissions) => setDraft({ ...draft, permissions }) : undefined}
            />
          </div>

          {editable && risky.length > 0 ? (
            <p className="flex items-start gap-2.5 rounded-lg border border-warning/30 bg-warning/10 px-3.5 py-3 text-sm">
              <TriangleAlert className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden="true" />
              <span>
                <span className="font-medium">
                  This role may change {risky.map((area) => area.label.toLowerCase()).join(', ')}.
                </span>{' '}
                {risky.some((area) => area.key === 'admins')
                  ? 'Its holders can create admins and reset passwords, though never for anyone who may do more than they do.'
                  : 'These reach further than their own page. Give the role only to people you trust with that.'}
              </span>
            </p>
          ) : null}

          {role?.id ? <Holders roleName={role.name} admins={detail.data?.admins} /> : null}

          <ErrorNote error={save.error} />
        </div>

        {editable && (dirty || !role) ? (
          <footer className="sticky bottom-0 z-10 flex flex-wrap items-center justify-between gap-3 rounded-b-xl border-t bg-card/95 px-5 py-3 backdrop-blur">
            <p className="min-w-0 text-sm text-muted-foreground">
              {problem ??
                (role && role.adminCount > 0
                  ? `Saving changes what ${admins(role.adminCount)} may do, at once.`
                  : role
                    ? 'You have changes that are not saved.'
                    : 'Ready to save.')}
            </p>
            <div className="flex items-center gap-2">
              <Button
                onClick={() => {
                  if (role) {
                    setDraft(draftOf(role));
                    save.reset();
                  } else {
                    props.onCancelNew();
                  }
                }}
              >
                {role ? 'Discard' : 'Cancel'}
              </Button>
              <Button
                type="submit"
                variant="primary"
                disabled={problem !== null}
                loading={save.isPending}
              >
                {role ? 'Save changes' : 'Create role'}
              </Button>
            </div>
          </footer>
        ) : null}
      </Card>
    </form>
  );
}

const LIKE: Record<string, string> = { ADMIN: 'Admin', EDITOR: 'Editor', VIEWER: 'Viewer' };
const like = (key: string) => LIKE[key] ?? key;

function Holders({
  roleName,
  admins: holders,
}: {
  roleName: string;
  admins: { id: string; displayName: string; email: string; isActive: boolean }[] | undefined;
}) {
  if (!holders) {
    return <Skeleton className="h-16 rounded-lg" />;
  }
  return (
    <section aria-labelledby="role-holders">
      <div className="mb-2 flex items-center justify-between gap-3">
        <h3 id="role-holders" className="text-[15px] font-semibold">
          Who holds it
        </h3>
        <Link to="/admins" className="text-sm text-primary hover:underline">
          Open admins
        </Link>
      </div>
      {holders.length === 0 ? (
        <p className="rounded-lg border border-dashed px-4 py-4 text-sm text-muted-foreground">
          Nobody yet. On the Admins page, choose {roleName} as the role of an admin.
        </p>
      ) : (
        <ul className="grid gap-2 sm:grid-cols-2">
          {holders.map((admin) => (
            <li key={admin.id} className="flex items-center gap-3 rounded-lg border px-3 py-2">
              <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/15 text-xs font-semibold text-primary">
                {admin.displayName
                  .split(/\s+/)
                  .slice(0, 2)
                  .map((part) => part.charAt(0).toUpperCase())
                  .join('')}
              </span>
              <span className="grid min-w-0 flex-1">
                <span className="truncate text-sm font-medium">{admin.displayName}</span>
                <span className="truncate text-xs text-muted-foreground">{admin.email}</span>
              </span>
              {admin.isActive ? null : <Badge>Deactivated</Badge>}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function DeleteRoleDialog({
  role,
  roles,
  me,
  onClose,
  onDeleted,
}: {
  role: Role | null;
  roles: readonly Role[];
  me: { role: Role['key']; permissions: readonly Permission[] } | null;
  onClose: () => void;
  onDeleted: (role: Role, movedAdmins: number) => void;
}) {
  const [moveTo, setMoveTo] = useState('');
  const inUse = (role?.adminCount ?? 0) > 0;

  const remove = useMutation({
    mutationFn: () => {
      const target = roles.find((entry) => roleValueOf(entry) === moveTo);
      return rolesApi.remove(
        (role as Role).id as string,
        target ? (target.id ?? target.key) : undefined,
      );
    },
    onSuccess: (result) => onDeleted(role as Role, result.movedAdmins),
  });

  useEffect(() => {
    if (role) {
      remove.reset();
      setMoveTo('');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [role]);

  const options = me
    ? roleOptions(
        roles.filter((entry) => entry.key !== 'OWNER' && entry.id !== role?.id),
        me,
      )
    : [];
  // Someone else may have given the role to an admin since the list was loaded.
  const nowInUse =
    inUse || (remove.error instanceof ApiError && remove.error.code === 'role_in_use');

  return (
    <Dialog open={role !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        size="sm"
        title={`Delete ${role?.name ?? ''}?`}
        description={
          nowInUse
            ? `${admins(Math.max(role?.adminCount ?? 1, 1))} ${(role?.adminCount ?? 1) === 1 ? 'holds' : 'hold'} this role and ${(role?.adminCount ?? 1) === 1 ? 'needs' : 'need'} another one.`
            : 'Nobody holds this role. It cannot be brought back.'
        }
      >
        <form
          className="contents"
          onSubmit={(event) => {
            event.preventDefault();
            remove.mutate();
          }}
        >
          <DialogBody>
            {nowInUse ? (
              <Field
                label="Move them to"
                hint="They are signed out and work with the new role when they sign in again."
              >
                {(id) => (
                  <Select
                    id={id}
                    value={moveTo}
                    onValueChange={setMoveTo}
                    placeholder="Choose a role"
                    options={options}
                  />
                )}
              </Field>
            ) : null}
            {remove.error instanceof ApiError && remove.error.code === 'role_in_use' ? null : (
              <ErrorNote error={remove.error} />
            )}
          </DialogBody>
          <DialogFooter>
            <Button onClick={onClose}>Cancel</Button>
            <Button
              type="submit"
              variant="destructive"
              loading={remove.isPending}
              disabled={nowInUse && moveTo === ''}
            >
              {nowInUse ? 'Move and delete' : 'Delete role'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
