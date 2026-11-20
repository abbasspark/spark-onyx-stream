// SPDX-License-Identifier: AGPL-3.0-only
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { KeyRound, MoreHorizontal, Plus, UserCheck, UserX } from 'lucide-react';
import { type FormEvent, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { adminsApi } from '@/api/endpoints';
import { ADMIN_ROLES, type Admin, type AdminRole, type UpdateAdminInput } from '@/api/types';
import { useSession } from '@/auth/session';
import { useConfirm } from '@/components/confirm';
import { Button } from '@/components/ui/button';
import {
  Badge,
  Card,
  ErrorNote,
  PageHeader,
  Pagination,
  Skeleton,
  Table,
  Td,
  Th,
  Tr,
} from '@/components/ui/display';
import { Field, Input, Select } from '@/components/ui/form';
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
import { formatDateTime, formatRelative, humanize } from '@/lib/format';

const PAGE_SIZE = 25;

const ROLE_HELP: Record<AdminRole, string> = {
  OWNER: 'Everything, including other admins',
  ADMIN: 'Everything except managing admins',
  EDITOR: 'Upload and manage videos',
  VIEWER: 'Read only',
};
const ROLE_OPTIONS = ADMIN_ROLES.map((role) => ({
  value: role,
  label: humanize(role),
  description: ROLE_HELP[role],
}));

const initialsOf = (name: string) =>
  name
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join('');

/** The people who can sign in to this panel. */
export function AdminsPage() {
  const { state, can } = useSession();
  const confirm = useConfirm();
  const queryClient = useQueryClient();
  const mayWrite = can('admins:write');
  const myId = state.status === 'signedIn' ? state.me.adminId : '';
  const [page, setPage] = useState(1);
  const [creating, setCreating] = useState(false);
  const [resetting, setResetting] = useState<Admin | null>(null);

  const admins = useQuery({
    queryKey: ['admins', page],
    queryFn: ({ signal }) => adminsApi.list({ page, pageSize: PAGE_SIZE }, signal),
    placeholderData: keepPreviousData,
  });
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['admins'] });

  const update = useMutation({
    mutationFn: ({ admin, body }: { admin: Admin; body: UpdateAdminInput; message: string }) =>
      adminsApi.update(admin.id, body),
    onSuccess: (_admin, variables) => {
      toast.success(variables.message);
      void refresh();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const toggleActive = async (admin: Admin) => {
    if (admin.isActive) {
      const confirmed = await confirm({
        title: `Deactivate ${admin.displayName}?`,
        description:
          'They are signed out at once and cannot sign in again until you activate them.',
        confirmLabel: 'Deactivate',
        destructive: true,
      });
      if (!confirmed) {
        return;
      }
    }
    update.mutate({
      admin,
      body: { isActive: !admin.isActive },
      message: admin.isActive
        ? `${admin.displayName} was deactivated`
        : `${admin.displayName} can sign in again`,
    });
  };

  return (
    <>
      <PageHeader
        title="Admins"
        description="The people who can sign in to this panel, and what each of them may do."
        actions={
          mayWrite ? (
            <Button variant="primary" onClick={() => setCreating(true)}>
              <Plus />
              New admin
            </Button>
          ) : null
        }
      />

      <ErrorNote error={admins.error} className="mb-4" />
      {admins.isPending ? <Skeleton className="h-48 rounded-xl" /> : null}

      {admins.data ? (
        <Card className="overflow-hidden">
          <Table>
            <thead>
              <tr>
                <Th>Name</Th>
                <Th>Role</Th>
                <Th>Status</Th>
                <Th>Last sign-in</Th>
                <Th className="w-10" aria-label="Actions" />
              </tr>
            </thead>
            <tbody>
              {admins.data.items.map((admin) => {
                // An admin does not change their own role or switch themselves off by accident.
                const editable = mayWrite && admin.id !== myId;
                return (
                  <Tr key={admin.id}>
                    <Td>
                      <div className="flex items-center gap-3">
                        <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary/15 text-xs font-semibold text-primary">
                          {initialsOf(admin.displayName)}
                        </span>
                        <div className="min-w-0">
                          <p className="flex items-center gap-2 font-medium">
                            {admin.displayName}
                            {admin.id === myId ? <Badge>You</Badge> : null}
                          </p>
                          <p className="truncate text-xs text-muted-foreground">{admin.email}</p>
                        </div>
                      </div>
                    </Td>
                    <Td>
                      {editable ? (
                        <Select
                          aria-label={`Role of ${admin.displayName}`}
                          className="h-8 w-32"
                          value={admin.role}
                          disabled={update.isPending}
                          onValueChange={(role) =>
                            update.mutate({
                              admin,
                              body: { role: role as AdminRole },
                              message: `${admin.displayName} is now ${humanize(role).toLowerCase()}`,
                            })
                          }
                          options={ROLE_OPTIONS}
                        />
                      ) : (
                        humanize(admin.role)
                      )}
                    </Td>
                    <Td>
                      <Badge tone={admin.isActive ? 'success' : 'neutral'} dot>
                        {admin.isActive ? 'Active' : 'Deactivated'}
                      </Badge>
                    </Td>
                    <Td className="whitespace-nowrap text-muted-foreground">
                      {admin.lastLoginAt ? (
                        <Tooltip content={formatDateTime(admin.lastLoginAt)}>
                          <span>{formatRelative(admin.lastLoginAt)}</span>
                        </Tooltip>
                      ) : (
                        'Never'
                      )}
                    </Td>
                    <Td>
                      {editable ? (
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              aria-label={`Actions for ${admin.displayName}`}
                            >
                              <MoreHorizontal />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onSelect={() => setResetting(admin)}>
                              <KeyRound />
                              Set a new password
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              destructive={admin.isActive}
                              onSelect={() => void toggleActive(admin)}
                            >
                              {admin.isActive ? <UserX /> : <UserCheck />}
                              {admin.isActive ? 'Deactivate' : 'Activate'}
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      ) : null}
                    </Td>
                  </Tr>
                );
              })}
            </tbody>
          </Table>
        </Card>
      ) : null}

      {admins.data ? (
        <Pagination
          page={admins.data.page}
          pageSize={admins.data.pageSize}
          total={admins.data.total}
          onChange={setPage}
        />
      ) : null}

      <CreateAdminDialog
        open={creating}
        onOpenChange={setCreating}
        onSaved={(admin) => {
          toast.success(`${admin.displayName} can now sign in`);
          setCreating(false);
          void refresh();
        }}
      />
      <ResetPasswordDialog
        admin={resetting}
        onClose={() => setResetting(null)}
        onSaved={(admin) => {
          toast.success(`New password set for ${admin.displayName}`, {
            description: 'They were signed out everywhere.',
          });
          setResetting(null);
        }}
      />
    </>
  );
}

function ResetPasswordDialog({
  admin,
  onClose,
  onSaved,
}: {
  admin: Admin | null;
  onClose: () => void;
  onSaved: (admin: Admin) => void;
}) {
  const [password, setPassword] = useState('');
  const save = useMutation({
    mutationFn: () => adminsApi.update((admin as Admin).id, { password }),
    onSuccess: onSaved,
  });

  useEffect(() => {
    if (admin) {
      save.reset();
      setPassword('');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [admin]);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    save.mutate();
  };

  return (
    <Dialog open={admin !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        size="sm"
        title={`New password for ${admin?.displayName ?? ''}`}
        description="They are signed out everywhere and must use the new password."
      >
        <form onSubmit={submit} className="contents">
          <DialogBody>
            <Field
              label="New password"
              hint="At least 12 characters. Give it to the person in a safe way."
            >
              {(id) => (
                <Input
                  id={id}
                  type="password"
                  required
                  autoFocus
                  minLength={12}
                  autoComplete="new-password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                />
              )}
            </Field>
            <ErrorNote error={save.error} />
          </DialogBody>
          <DialogFooter>
            <Button onClick={onClose}>Cancel</Button>
            <Button type="submit" variant="primary" loading={save.isPending}>
              Set password
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function CreateAdminDialog({
  open,
  onOpenChange,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: (admin: Admin) => void;
}) {
  const [email, setEmail] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<AdminRole>('EDITOR');

  const create = useMutation({
    mutationFn: () =>
      adminsApi.create({ email: email.trim(), displayName: displayName.trim(), password, role }),
    onSuccess: onSaved,
  });

  useEffect(() => {
    if (open) {
      create.reset();
      setEmail('');
      setDisplayName('');
      setPassword('');
      setRole('EDITOR');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    create.mutate();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title="New admin">
        <form onSubmit={submit} className="contents">
          <DialogBody>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Name">
                {(id) => (
                  <Input
                    id={id}
                    required
                    maxLength={100}
                    value={displayName}
                    onChange={(event) => setDisplayName(event.target.value)}
                  />
                )}
              </Field>
              <Field label="Email">
                {(id) => (
                  <Input
                    id={id}
                    type="email"
                    required
                    autoComplete="off"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                  />
                )}
              </Field>
            </div>
            <Field label="Role">
              {(id) => (
                <Select
                  id={id}
                  value={role}
                  onValueChange={(value) => setRole(value as AdminRole)}
                  options={ROLE_OPTIONS}
                />
              )}
            </Field>
            <Field
              label="Password"
              hint="At least 12 characters. Give it to the person in a safe way."
            >
              {(id) => (
                <Input
                  id={id}
                  type="password"
                  required
                  minLength={12}
                  autoComplete="new-password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                />
              )}
            </Field>
            <ErrorNote error={create.error} />
          </DialogBody>
          <DialogFooter>
            <Button onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" variant="primary" loading={create.isPending}>
              Create admin
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
