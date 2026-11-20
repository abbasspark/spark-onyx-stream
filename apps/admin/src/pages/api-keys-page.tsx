// SPDX-License-Identifier: AGPL-3.0-only
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Ban, Check, Copy, KeyRound, Plus, TriangleAlert } from 'lucide-react';
import { type FormEvent, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { apiKeysApi } from '@/api/endpoints';
import type { ApiKey, CreatedApiKey, Permission } from '@/api/types';
import { useSession } from '@/auth/session';
import { useConfirm } from '@/components/confirm';
import { Button } from '@/components/ui/button';
import {
  Badge,
  type BadgeTone,
  Card,
  EmptyState,
  ErrorNote,
  PageHeader,
  Skeleton,
  Table,
  Td,
  Th,
  Tr,
} from '@/components/ui/display';
import { Checkbox, Field, Input } from '@/components/ui/form';
import { Dialog, DialogBody, DialogContent, DialogFooter, Tooltip } from '@/components/ui/overlay';
import { formatDateTime, formatRelative } from '@/lib/format';

/** What a key can be allowed to do. Managing admins and keys can never be given to a key. */
const SCOPE_GROUPS: { label: string; read: Permission; write?: Permission }[] = [
  { label: 'Videos', read: 'assets:read', write: 'assets:write' },
  { label: 'Jobs', read: 'jobs:read', write: 'jobs:write' },
  { label: 'Encoding profiles', read: 'encoding-profiles:read', write: 'encoding-profiles:write' },
  { label: 'Storage', read: 'storage:read', write: 'storage:write' },
  { label: 'Settings', read: 'settings:read', write: 'settings:write' },
  { label: 'Admins', read: 'admins:read' },
  { label: 'API keys', read: 'api-keys:read' },
  { label: 'Audit log', read: 'audit:read' },
];

function keyState(key: ApiKey): { label: string; tone: BadgeTone } {
  if (key.revokedAt) {
    return { label: 'Revoked', tone: 'neutral' };
  }
  if (key.expiresAt && new Date(key.expiresAt).getTime() <= Date.now()) {
    return { label: 'Expired', tone: 'danger' };
  }
  return { label: 'Active', tone: 'success' };
}

/** Keys that let other programs use the API without a person signing in. */
export function ApiKeysPage() {
  const { state, can } = useSession();
  const confirm = useConfirm();
  const queryClient = useQueryClient();
  const mayWrite = can('api-keys:write');
  const myPermissions = state.status === 'signedIn' ? state.me.permissions : [];
  const [creating, setCreating] = useState(false);
  const [created, setCreated] = useState<CreatedApiKey | null>(null);

  const keys = useQuery({
    queryKey: ['api-keys'],
    queryFn: ({ signal }) => apiKeysApi.list(signal),
  });
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['api-keys'] });
  const revoke = useMutation({
    mutationFn: (key: ApiKey) => apiKeysApi.revoke(key.id),
    onSuccess: () => {
      toast.success('Key revoked');
      void refresh();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const askRevoke = async (key: ApiKey) => {
    const confirmed = await confirm({
      title: `Revoke "${key.name}"?`,
      description: 'Programs using this key stop working at once. This cannot be undone.',
      confirmLabel: 'Revoke',
      destructive: true,
    });
    if (confirmed) {
      revoke.mutate(key);
    }
  };

  return (
    <>
      <PageHeader
        title="API keys"
        description={
          <>
            A key lets a script or another system call the API. Send it as{' '}
            <code className="font-mono text-[13px]">Authorization: Bearer …</code>
          </>
        }
        actions={
          mayWrite ? (
            <Button variant="primary" onClick={() => setCreating(true)}>
              <Plus />
              New key
            </Button>
          ) : null
        }
      />

      <ErrorNote error={keys.error} className="mb-4" />
      {keys.isPending ? <Skeleton className="h-48 rounded-xl" /> : null}
      {keys.data?.length === 0 ? (
        <EmptyState
          icon={KeyRound}
          title="No API keys"
          action={
            mayWrite ? (
              <Button variant="primary" onClick={() => setCreating(true)}>
                <Plus />
                New key
              </Button>
            ) : null
          }
        >
          Create one to let another program use the API.
        </EmptyState>
      ) : null}

      {keys.data && keys.data.length > 0 ? (
        <Card className="overflow-hidden">
          <Table>
            <thead>
              <tr>
                <Th>Name</Th>
                <Th>Status</Th>
                <Th>May do</Th>
                <Th>Last used</Th>
                <Th>Expires</Th>
                <Th className="w-10" aria-label="Actions" />
              </tr>
            </thead>
            <tbody>
              {keys.data.map((key) => {
                const status = keyState(key);
                return (
                  <Tr key={key.id}>
                    <Td>
                      <p className="font-medium">{key.name}</p>
                      <p className="text-xs text-muted-foreground">
                        <code className="font-mono">{key.prefix}…</code> by{' '}
                        {key.createdBy.displayName}
                      </p>
                    </Td>
                    <Td>
                      <Badge tone={status.tone} dot>
                        {status.label}
                      </Badge>
                    </Td>
                    <Td>
                      <div className="flex max-w-sm flex-wrap gap-1">
                        {key.scopes.map((scope) => (
                          <Badge key={scope} className="font-mono text-[11px]">
                            {scope}
                          </Badge>
                        ))}
                      </div>
                    </Td>
                    <Td className="whitespace-nowrap text-muted-foreground">
                      {key.lastUsedAt ? (
                        <Tooltip content={formatDateTime(key.lastUsedAt)}>
                          <span>{formatRelative(key.lastUsedAt)}</span>
                        </Tooltip>
                      ) : (
                        'Never'
                      )}
                    </Td>
                    <Td className="whitespace-nowrap text-muted-foreground">
                      {key.expiresAt ? formatDateTime(key.expiresAt) : 'Never'}
                    </Td>
                    <Td>
                      {mayWrite && !key.revokedAt ? (
                        <Tooltip content="Revoke this key">
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            aria-label={`Revoke ${key.name}`}
                            disabled={revoke.isPending}
                            onClick={() => void askRevoke(key)}
                          >
                            <Ban />
                          </Button>
                        </Tooltip>
                      ) : null}
                    </Td>
                  </Tr>
                );
              })}
            </tbody>
          </Table>
        </Card>
      ) : null}

      <CreateKeyDialog
        open={creating}
        onOpenChange={setCreating}
        allowed={myPermissions}
        onSaved={(key) => {
          setCreating(false);
          setCreated(key);
          void refresh();
        }}
      />
      <NewKeyDialog created={created} onClose={() => setCreated(null)} />
    </>
  );
}

/** Shows a new key once. It cannot be closed by clicking outside, so the key is not lost by accident. */
function NewKeyDialog({
  created,
  onClose,
}: {
  created: CreatedApiKey | null;
  onClose: () => void;
}) {
  const [copied, setCopied] = useState(false);
  useEffect(() => setCopied(false), [created]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(created?.key ?? '');
      setCopied(true);
    } catch {
      // The clipboard can be blocked. The key stays visible to copy by hand.
      toast.error('Copying is blocked by the browser. Select the key and copy it by hand.');
    }
  };

  return (
    <Dialog open={created !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        title={`Key "${created?.name ?? ''}" created`}
        onInteractOutside={(event) => event.preventDefault()}
      >
        <DialogBody>
          <p className="flex items-start gap-2 rounded-lg border border-warning/30 bg-warning/10 px-3 py-2 text-sm">
            <TriangleAlert className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden="true" />
            Copy the key now. This is the only time it is shown, and it cannot be shown again later.
          </p>
          <div className="flex items-center gap-2 rounded-lg border bg-background p-2 pl-3">
            <code
              className="min-w-0 flex-1 font-mono text-[13px] break-all select-all"
              data-testid="new-key"
            >
              {created?.key}
            </code>
            <Button onClick={() => void copy()}>
              {copied ? <Check /> : <Copy />}
              {copied ? 'Copied' : 'Copy'}
            </Button>
          </div>
        </DialogBody>
        <DialogFooter>
          <Button variant="primary" onClick={onClose}>
            I have stored it
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CreateKeyDialog({
  open,
  onOpenChange,
  allowed,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  allowed: readonly Permission[];
  onSaved: (key: CreatedApiKey) => void;
}) {
  const [name, setName] = useState('');
  const [scopes, setScopes] = useState<Set<Permission>>(new Set(['assets:read']));
  const [expiry, setExpiry] = useState('');

  const create = useMutation({
    mutationFn: () =>
      apiKeysApi.create({
        name: name.trim(),
        scopes: [...scopes],
        // The field holds local time. The API wants a moment with a time zone.
        expiresAt: expiry ? new Date(expiry).toISOString() : undefined,
      }),
    onSuccess: onSaved,
  });

  useEffect(() => {
    if (open) {
      create.reset();
      setName('');
      setScopes(new Set(['assets:read']));
      setExpiry('');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const toggle = (scope: Permission) =>
    setScopes((current) => {
      const next = new Set(current);
      if (next.has(scope)) {
        next.delete(scope);
      } else {
        next.add(scope);
      }
      return next;
    });

  const submit = (event: FormEvent) => {
    event.preventDefault();
    create.mutate();
  };

  const box = (scope: Permission | undefined, label: string, group: string) =>
    scope ? (
      <label className="flex items-center gap-2 text-sm">
        <Checkbox
          checked={scopes.has(scope)}
          // A key can never be allowed more than the admin who creates it.
          disabled={!allowed.includes(scope)}
          onCheckedChange={() => toggle(scope)}
          aria-label={`${label} ${group}`}
        />
        {label}
      </label>
    ) : (
      <span />
    );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title="New API key" description="Give a key only what it needs.">
        <form onSubmit={submit} className="contents">
          <DialogBody>
            <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_13rem]">
              <Field label="Name" hint="What will use this key.">
                {(id) => (
                  <Input
                    id={id}
                    required
                    maxLength={100}
                    placeholder="Website import"
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                  />
                )}
              </Field>
              <Field label="Expires" hint="Empty means never.">
                {(id) => (
                  <Input
                    id={id}
                    type="datetime-local"
                    value={expiry}
                    onChange={(event) => setExpiry(event.target.value)}
                  />
                )}
              </Field>
            </div>

            <fieldset className="rounded-lg border">
              <legend className="ml-3 px-1 text-[13px] font-medium">What the key may do</legend>
              <div className="divide-y">
                {SCOPE_GROUPS.map((group) => (
                  <div
                    key={group.label}
                    className="grid grid-cols-[minmax(0,1fr)_5.5rem_5.5rem] items-center px-4 py-2"
                  >
                    <span className="text-sm">{group.label}</span>
                    {box(group.read, 'Read', group.label)}
                    {box(group.write, 'Change', group.label)}
                  </div>
                ))}
              </div>
            </fieldset>
            <p className="text-xs text-muted-foreground">
              A key can never manage admins or other keys.
            </p>
            <ErrorNote error={create.error} />
          </DialogBody>
          <DialogFooter>
            <Button onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button
              type="submit"
              variant="primary"
              loading={create.isPending}
              disabled={scopes.size === 0}
            >
              Create key
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
