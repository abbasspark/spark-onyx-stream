// SPDX-License-Identifier: AGPL-3.0-only
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { ChevronDown, ScrollText, Search } from 'lucide-react';
import { Fragment, useState } from 'react';
import { adminsApi, auditApi } from '@/api/endpoints';
import { useSession } from '@/auth/session';
import { Button } from '@/components/ui/button';
import {
  Card,
  EmptyState,
  ErrorNote,
  PageHeader,
  Pagination,
  Skeleton,
  Table,
  Td,
  Th,
  Tr,
} from '@/components/ui/display';
import { Input, Select } from '@/components/ui/form';
import { Tooltip } from '@/components/ui/overlay';
import { describeAction, subjectOf } from '@/lib/audit';
import { cn } from '@/lib/cn';
import { formatDateTime, formatRelative } from '@/lib/format';

const PAGE_SIZE = 50;

/** The kinds of things the API writes entries about, with a readable name. */
const ENTITY_TYPES: Record<string, string> = {
  Asset: 'Videos',
  Job: 'Jobs',
  EncodingProfile: 'Encoding profiles',
  StoragePool: 'Storage pools',
  AdminUser: 'Admins',
  AdminSession: 'Sign-ins',
  ApiKey: 'API keys',
};

/** The record of who changed what. Entries cannot be edited or deleted. */
export function AuditPage() {
  const { can } = useSession();
  const [page, setPage] = useState(1);
  const [entityType, setEntityType] = useState('ALL');
  const [action, setAction] = useState('');
  const [open, setOpen] = useState<string | null>(null);

  const entries = useQuery({
    queryKey: ['audit', { page, entityType, action }],
    queryFn: ({ signal }) =>
      auditApi.list(
        {
          page,
          pageSize: PAGE_SIZE,
          entityType: entityType === 'ALL' ? undefined : entityType,
          action: action.trim() || undefined,
        },
        signal,
      ),
    placeholderData: keepPreviousData,
  });

  // Names for the "who" column. Without the permission, the column shows ids.
  const admins = useQuery({
    queryKey: ['admins', 'names'],
    queryFn: ({ signal }) => adminsApi.list({ page: 1, pageSize: 100 }, signal),
    enabled: can('admins:read'),
    staleTime: 60_000,
  });
  const names = new Map(admins.data?.items.map((admin) => [admin.id, admin.displayName]));

  return (
    <>
      <PageHeader
        title="Audit log"
        description="Who changed what, newest first. Entries cannot be edited or deleted."
      />
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Select
          aria-label="Filter by kind of thing"
          className="w-48"
          value={entityType}
          onValueChange={(value) => {
            setEntityType(value);
            setPage(1);
          }}
          options={[
            { value: 'ALL', label: 'Everything' },
            ...Object.entries(ENTITY_TYPES).map(([value, label]) => ({ value, label })),
          ]}
        />
        <div className="relative w-full sm:w-72">
          <Search
            className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <Input
            type="search"
            placeholder="Exact action, for example asset.delete"
            aria-label="Filter by action"
            className="pl-9"
            value={action}
            onChange={(event) => {
              setAction(event.target.value);
              setPage(1);
            }}
          />
        </div>
      </div>

      <ErrorNote error={entries.error} className="mb-4" />
      {entries.isPending ? <Skeleton className="h-64 rounded-xl" /> : null}
      {entries.data?.items.length === 0 ? (
        <EmptyState icon={ScrollText} title="No entries match" />
      ) : null}

      {entries.data && entries.data.items.length > 0 ? (
        <Card className="overflow-hidden">
          <Table>
            <thead>
              <tr>
                <Th>When</Th>
                <Th>Who</Th>
                <Th>Action</Th>
                <Th>On</Th>
                <Th>From</Th>
                <Th className="w-10" aria-label="Details" />
              </tr>
            </thead>
            <tbody>
              {entries.data.items.map((entry) => {
                const hasDetails = entry.metadata !== null && entry.metadata !== undefined;
                const isOpen = open === entry.id;
                return (
                  <Fragment key={entry.id}>
                    <Tr>
                      <Td className="whitespace-nowrap text-muted-foreground">
                        <Tooltip content={formatDateTime(entry.createdAt)}>
                          <span>{formatRelative(entry.createdAt)}</span>
                        </Tooltip>
                      </Td>
                      <Td>
                        {entry.adminId ? (
                          (names.get(entry.adminId) ?? (
                            <code className="font-mono text-xs text-muted-foreground">
                              {entry.adminId}
                            </code>
                          ))
                        ) : (
                          <span className="text-muted-foreground">System</span>
                        )}
                      </Td>
                      <Td>
                        <p className={cn(entry.action.endsWith('_failed') && 'text-destructive')}>
                          {describeAction(entry.action)}
                          {subjectOf(entry.metadata) ? (
                            <span className="text-muted-foreground">
                              {' '}
                              · {subjectOf(entry.metadata)}
                            </span>
                          ) : null}
                        </p>
                        <p className="font-mono text-xs text-muted-foreground">{entry.action}</p>
                      </Td>
                      <Td>
                        {entry.entityType
                          ? (ENTITY_TYPES[entry.entityType] ?? entry.entityType)
                          : '–'}
                        {entry.entityId ? (
                          <p className="font-mono text-xs text-muted-foreground">
                            {entry.entityId}
                          </p>
                        ) : null}
                      </Td>
                      <Td className="font-mono text-xs whitespace-nowrap text-muted-foreground">
                        {entry.ipAddress ?? '–'}
                      </Td>
                      <Td>
                        {hasDetails ? (
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            aria-expanded={isOpen}
                            aria-label={isOpen ? 'Hide the details' : 'Show the details'}
                            onClick={() => setOpen(isOpen ? null : entry.id)}
                          >
                            <ChevronDown
                              className={cn('transition-transform', isOpen && 'rotate-180')}
                            />
                          </Button>
                        ) : null}
                      </Td>
                    </Tr>
                    {isOpen ? (
                      <tr>
                        <td colSpan={6} className="border-b bg-muted/40 px-4 py-3">
                          <pre
                            className="overflow-x-auto font-mono text-xs"
                            data-testid="audit-details"
                          >
                            {JSON.stringify(entry.metadata, null, 2)}
                          </pre>
                        </td>
                      </tr>
                    ) : null}
                  </Fragment>
                );
              })}
            </tbody>
          </Table>
        </Card>
      ) : null}

      {entries.data ? (
        <Pagination
          page={entries.data.page}
          pageSize={entries.data.pageSize}
          total={entries.data.total}
          onChange={setPage}
        />
      ) : null}
    </>
  );
}
