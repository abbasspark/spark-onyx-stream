// SPDX-License-Identifier: AGPL-3.0-only
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Cloud,
  Database,
  HardDrive,
  MoreHorizontal,
  Pencil,
  PlugZap,
  Plus,
  Star,
} from 'lucide-react';
import { type FormEvent, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { storageApi } from '@/api/endpoints';
import type { CreateStoragePoolInput, StoragePool } from '@/api/types';
import { useSession } from '@/auth/session';
import { Button } from '@/components/ui/button';
import {
  Badge,
  Card,
  CardContent,
  CardHeader,
  EmptyState,
  ErrorNote,
  Facts,
  PageHeader,
  Progress,
  Skeleton,
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
  DropdownMenuTrigger,
} from '@/components/ui/overlay';
import { bytesToGigabytes, formatBytes, gigabytesToBytes, usagePercent } from '@/lib/format';

/** Storage pools: the places where sources and streams are kept. */
export function StoragePage() {
  const { can } = useSession();
  const queryClient = useQueryClient();
  const mayWrite = can('storage:write');
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<StoragePool | null>(null);
  const [testing, setTesting] = useState<string | null>(null);

  const pools = useQuery({
    queryKey: ['storage-pools'],
    queryFn: ({ signal }) => storageApi.list(signal),
  });
  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ['storage-pools'] });
    void queryClient.invalidateQueries({ queryKey: ['stats'] });
  };

  const makeDefault = useMutation({
    mutationFn: (pool: StoragePool) => storageApi.update(pool.id, { isDefault: true }),
    onSuccess: (pool) => {
      toast.success(`New uploads now go to "${pool.name}"`);
      refresh();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const runTest = async (pool: StoragePool) => {
    setTesting(pool.id);
    try {
      const result = await storageApi.test(pool.id);
      if (result.ok) {
        toast.success(`"${pool.name}" works`, {
          description: `Writing, reading and deleting took ${result.latencyMs} ms.`,
        });
      } else {
        toast.error(`"${pool.name}" failed the test`, {
          description: result.error,
          duration: 10_000,
        });
      }
    } catch (error) {
      toast.error(`"${pool.name}" could not be tested`, {
        description: error instanceof Error ? error.message : undefined,
      });
    } finally {
      setTesting(null);
    }
  };

  return (
    <>
      <PageHeader
        title="Storage"
        description="A pool is a folder on this server or an S3-compatible bucket. New uploads go to the default pool."
        actions={
          mayWrite ? (
            <Button variant="primary" onClick={() => setCreating(true)}>
              <Plus />
              New pool
            </Button>
          ) : null
        }
      />

      <ErrorNote error={pools.error} className="mb-4" />
      {pools.isPending ? <Skeleton className="h-48 rounded-xl" /> : null}
      {pools.data?.length === 0 ? (
        <EmptyState icon={Database} title="No pools yet">
          The first upload creates a local pool.
        </EmptyState>
      ) : null}

      <div className="grid gap-4 xl:grid-cols-2">
        {pools.data?.map((pool) => {
          const percent = usagePercent(pool.usedBytes, pool.quotaBytes);
          const Icon = pool.driver === 'LOCAL' ? HardDrive : Cloud;
          return (
            <Card key={pool.id}>
              <CardHeader
                title={
                  <>
                    <span className="flex size-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
                      <Icon className="size-4" aria-hidden="true" />
                    </span>
                    {pool.name}
                    {pool.isDefault ? (
                      <Badge tone="primary">
                        <Star className="size-3" aria-hidden="true" />
                        Default
                      </Badge>
                    ) : null}
                    {!pool.isActive ? <Badge tone="danger">Inactive</Badge> : null}
                  </>
                }
                actions={
                  mayWrite ? (
                    <>
                      <Button
                        size="sm"
                        loading={testing === pool.id}
                        onClick={() => void runTest(pool)}
                      >
                        <PlugZap />
                        Test
                      </Button>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            aria-label={`More actions for ${pool.name}`}
                          >
                            <MoreHorizontal />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onSelect={() => setEditing(pool)}>
                            <Pencil />
                            Edit
                          </DropdownMenuItem>
                          {!pool.isDefault && pool.isActive ? (
                            <DropdownMenuItem onSelect={() => makeDefault.mutate(pool)}>
                              <Star />
                              Make default
                            </DropdownMenuItem>
                          ) : null}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </>
                  ) : null
                }
              />
              <CardContent className="grid gap-4">
                <div className="grid gap-1.5">
                  <div className="flex items-baseline justify-between text-sm">
                    <span className="text-xl font-semibold tabular-nums">
                      {formatBytes(pool.usedBytes)}
                    </span>
                    <span className="text-muted-foreground">
                      {pool.quotaBytes ? `of ${formatBytes(pool.quotaBytes)}` : 'No limit'}
                    </span>
                  </div>
                  {percent !== null ? (
                    <Progress value={percent} label={`Space used in ${pool.name}`} />
                  ) : null}
                </div>
                <Facts
                  items={
                    pool.driver === 'LOCAL'
                      ? [
                          ['Type', 'Folder on this server'],
                          [
                            'Folder',
                            <code key="path" className="font-mono text-[13px]">
                              {pool.config.basePath}
                            </code>,
                          ],
                        ]
                      : [
                          ['Type', 'S3-compatible bucket'],
                          [
                            'Bucket',
                            `${pool.config.bucket}${pool.config.keyPrefix ? ` / ${pool.config.keyPrefix}` : ''}`,
                          ],
                          ['Region', pool.config.region],
                          ['Endpoint', pool.config.endpoint ?? 'Amazon S3'],
                          [
                            'Access key',
                            <code key="key" className="font-mono text-[13px]">
                              {pool.config.accessKeyId}
                            </code>,
                          ],
                        ]
                  }
                />
              </CardContent>
            </Card>
          );
        })}
      </div>

      <CreatePoolDialog
        open={creating}
        onOpenChange={setCreating}
        onSaved={(pool) => {
          toast.success(`Pool "${pool.name}" created`, {
            description: 'Run a test to check the connection.',
          });
          setCreating(false);
          refresh();
        }}
      />
      <EditPoolDialog
        pool={editing}
        onClose={() => setEditing(null)}
        onSaved={() => {
          toast.success('Pool saved');
          setEditing(null);
          refresh();
        }}
      />
    </>
  );
}

function EditPoolDialog({
  pool,
  onClose,
  onSaved,
}: {
  pool: StoragePool | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState('');
  const [quota, setQuota] = useState('');
  const [isActive, setIsActive] = useState(true);

  const save = useMutation({
    mutationFn: () =>
      storageApi.update((pool as StoragePool).id, {
        name: name.trim(),
        quotaBytes: quota.trim() ? gigabytesToBytes(quota) : null,
        // The default pool must stay active, so the field is only sent for other pools.
        ...(pool?.isDefault ? {} : { isActive }),
      }),
    onSuccess: onSaved,
  });

  useEffect(() => {
    if (pool) {
      save.reset();
      setName(pool.name);
      setQuota(bytesToGigabytes(pool.quotaBytes));
      setIsActive(pool.isActive);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pool]);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    save.mutate();
  };

  return (
    <Dialog open={pool !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        title={`Edit ${pool?.name ?? ''}`}
        description="The folder or bucket of a pool cannot be changed, because files already stored would no longer be found."
      >
        <form onSubmit={submit} className="contents">
          <DialogBody>
            <Field label="Name">
              {(id) => (
                <Input
                  id={id}
                  required
                  maxLength={64}
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                />
              )}
            </Field>
            <Field label="Limit in GB" hint="Leave empty for no limit.">
              {(id) => (
                <Input
                  id={id}
                  type="number"
                  min={0.01}
                  step="any"
                  placeholder="No limit"
                  value={quota}
                  onChange={(event) => setQuota(event.target.value)}
                />
              )}
            </Field>
            {pool && !pool.isDefault ? (
              <ToggleRow
                label="Active"
                description="An inactive pool takes no new uploads. Videos already in it keep playing."
                checked={isActive}
                onCheckedChange={setIsActive}
              />
            ) : null}
            <ErrorNote error={save.error} />
          </DialogBody>
          <DialogFooter>
            <Button onClick={onClose}>Cancel</Button>
            <Button type="submit" variant="primary" loading={save.isPending}>
              Save
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

const EMPTY_S3 = {
  bucket: '',
  region: 'us-east-1',
  endpoint: '',
  keyPrefix: '',
  accessKeyId: '',
  secretAccessKey: '',
  forcePathStyle: false,
};

function CreatePoolDialog({
  open,
  onOpenChange,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: (pool: StoragePool) => void;
}) {
  const [driver, setDriver] = useState<'LOCAL' | 'S3'>('S3');
  const [name, setName] = useState('');
  const [quota, setQuota] = useState('');
  const [isDefault, setIsDefault] = useState(false);
  const [basePath, setBasePath] = useState('');
  const [s3, setS3] = useState(EMPTY_S3);
  const setS3Field = (values: Partial<typeof s3>) =>
    setS3((current) => ({ ...current, ...values }));

  const create = useMutation({
    mutationFn: () => {
      const shared = {
        name: name.trim(),
        isDefault,
        quotaBytes: gigabytesToBytes(quota) ?? undefined,
      };
      const body: CreateStoragePoolInput =
        driver === 'LOCAL'
          ? { ...shared, driver, config: { basePath: basePath.trim() } }
          : {
              ...shared,
              driver,
              config: {
                bucket: s3.bucket.trim(),
                region: s3.region.trim(),
                endpoint: s3.endpoint.trim() || undefined,
                keyPrefix: s3.keyPrefix.trim() || undefined,
                accessKeyId: s3.accessKeyId.trim(),
                secretAccessKey: s3.secretAccessKey,
                forcePathStyle: s3.forcePathStyle,
              },
            };
      return storageApi.create(body);
    },
    onSuccess: onSaved,
  });

  useEffect(() => {
    if (open) {
      create.reset();
      setName('');
      setQuota('');
      setIsDefault(false);
      setBasePath('');
      setS3(EMPTY_S3);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    create.mutate();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        variant="sheet"
        title="New pool"
        description="Credentials are stored encrypted and are never shown again."
      >
        <form onSubmit={submit} className="contents">
          <DialogBody>
            <Field label="Type">
              {(id) => (
                <Select
                  id={id}
                  value={driver}
                  onValueChange={(value) => setDriver(value as 'LOCAL' | 'S3')}
                  options={[
                    {
                      value: 'S3',
                      label: 'S3-compatible bucket',
                      description: 'Amazon S3, Cloudflare R2, Wasabi, MinIO and others.',
                    },
                    {
                      value: 'LOCAL',
                      label: 'Folder on this server',
                      description: 'A path the API and the workers can write to.',
                    },
                  ]}
                />
              )}
            </Field>
            <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_9rem]">
              <Field label="Name">
                {(id) => (
                  <Input
                    id={id}
                    required
                    maxLength={64}
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                  />
                )}
              </Field>
              <Field label="Limit in GB">
                {(id) => (
                  <Input
                    id={id}
                    type="number"
                    min={0.01}
                    step="any"
                    placeholder="No limit"
                    value={quota}
                    onChange={(event) => setQuota(event.target.value)}
                  />
                )}
              </Field>
            </div>

            {driver === 'LOCAL' ? (
              <Field label="Folder" hint="An absolute path, for example /var/lib/onyx/storage.">
                {(id) => (
                  <Input
                    id={id}
                    required
                    placeholder="/var/lib/onyx/storage"
                    className="font-mono"
                    value={basePath}
                    onChange={(event) => setBasePath(event.target.value)}
                  />
                )}
              </Field>
            ) : (
              <>
                <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_9rem]">
                  <Field label="Bucket">
                    {(id) => (
                      <Input
                        id={id}
                        required
                        value={s3.bucket}
                        onChange={(event) => setS3Field({ bucket: event.target.value })}
                      />
                    )}
                  </Field>
                  <Field label="Region">
                    {(id) => (
                      <Input
                        id={id}
                        required
                        value={s3.region}
                        onChange={(event) => setS3Field({ region: event.target.value })}
                      />
                    )}
                  </Field>
                </div>
                <Field label="Endpoint" hint="Leave empty for Amazon S3.">
                  {(id) => (
                    <Input
                      id={id}
                      type="url"
                      placeholder="https://s3.example.com"
                      value={s3.endpoint}
                      onChange={(event) => setS3Field({ endpoint: event.target.value })}
                    />
                  )}
                </Field>
                <Field label="Folder in the bucket" hint="Optional. Everything is stored under it.">
                  {(id) => (
                    <Input
                      id={id}
                      value={s3.keyPrefix}
                      onChange={(event) => setS3Field({ keyPrefix: event.target.value })}
                    />
                  )}
                </Field>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Access key ID">
                    {(id) => (
                      <Input
                        id={id}
                        required
                        autoComplete="off"
                        className="font-mono"
                        value={s3.accessKeyId}
                        onChange={(event) => setS3Field({ accessKeyId: event.target.value })}
                      />
                    )}
                  </Field>
                  <Field label="Secret access key">
                    {(id) => (
                      <Input
                        id={id}
                        type="password"
                        required
                        autoComplete="new-password"
                        value={s3.secretAccessKey}
                        onChange={(event) => setS3Field({ secretAccessKey: event.target.value })}
                      />
                    )}
                  </Field>
                </div>
                <ToggleRow
                  label="Path-style addresses"
                  description="Needed by MinIO and some other services."
                  checked={s3.forcePathStyle}
                  onCheckedChange={(checked) => setS3Field({ forcePathStyle: checked })}
                />
              </>
            )}

            <ToggleRow
              label="Default pool"
              description="New uploads go to this pool."
              checked={isDefault}
              onCheckedChange={setIsDefault}
            />
            <ErrorNote error={create.error} />
          </DialogBody>
          <DialogFooter>
            <Button onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" variant="primary" loading={create.isPending}>
              Create pool
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
