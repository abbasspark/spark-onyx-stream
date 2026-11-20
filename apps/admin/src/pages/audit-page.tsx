// SPDX-License-Identifier: AGPL-3.0-only
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { adminsApi, auditApi } from '../api/endpoints';
import { useSession } from '../auth/session';
import { EmptyState, ErrorNote, PageHeader, Pagination, Spinner } from '../components/ui';
import { formatDateTime } from '../lib/format';

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
  const [entityType, setEntityType] = useState('');
  const [action, setAction] = useState('');
  const [open, setOpen] = useState<string | null>(null);

  const entries = useQuery({
    queryKey: ['audit', { page, entityType, action }],
    queryFn: ({ signal }) =>
      auditApi.list(
        {
          page,
          pageSize: PAGE_SIZE,
          entityType: entityType || undefined,
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
      <PageHeader title="Audit log" />
      <div className="toolbar">
        <select
          aria-label="Filter by kind of thing"
          value={entityType}
          onChange={(event) => {
            setEntityType(event.target.value);
            setPage(1);
          }}
        >
          <option value="">Everything</option>
          {Object.entries(ENTITY_TYPES).map(([type, label]) => (
            <option key={type} value={type}>
              {label}
            </option>
          ))}
        </select>
        <input
          type="search"
          placeholder="Exact action, for example asset.delete"
          aria-label="Filter by action"
          value={action}
          onChange={(event) => {
            setAction(event.target.value);
            setPage(1);
          }}
        />
      </div>

      <ErrorNote error={entries.error} />
      {entries.isPending ? <Spinner label="Loading the log" /> : null}
      {entries.data?.items.length === 0 ? <EmptyState title="No entries match" /> : null}

      {entries.data && entries.data.items.length > 0 ? (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>When</th>
                <th>Who</th>
                <th>Action</th>
                <th>On</th>
                <th>From</th>
                <th aria-label="Details" />
              </tr>
            </thead>
            <tbody>
              {entries.data.items.map((entry) => {
                const hasDetails = entry.metadata !== null && entry.metadata !== undefined;
                return [
                  <tr key={entry.id}>
                    <td>{formatDateTime(entry.createdAt)}</td>
                    <td>
                      {entry.adminId
                        ? (names.get(entry.adminId) ?? <code>{entry.adminId}</code>)
                        : 'System'}
                    </td>
                    <td>
                      <code>{entry.action}</code>
                    </td>
                    <td>
                      {entry.entityType
                        ? (ENTITY_TYPES[entry.entityType] ?? entry.entityType)
                        : '–'}
                      {entry.entityId ? (
                        <div>
                          <code>{entry.entityId}</code>
                        </div>
                      ) : null}
                    </td>
                    <td>{entry.ipAddress ?? '–'}</td>
                    <td className="col-actions">
                      {hasDetails ? (
                        <button
                          type="button"
                          className="button button-quiet"
                          aria-expanded={open === entry.id}
                          onClick={() => setOpen(open === entry.id ? null : entry.id)}
                        >
                          {open === entry.id ? 'Hide' : 'Details'}
                        </button>
                      ) : null}
                    </td>
                  </tr>,
                  open === entry.id ? (
                    <tr key={`${entry.id}-details`}>
                      <td colSpan={6}>
                        <pre className="details">{JSON.stringify(entry.metadata, null, 2)}</pre>
                      </td>
                    </tr>
                  ) : null,
                ];
              })}
            </tbody>
          </table>
        </div>
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
