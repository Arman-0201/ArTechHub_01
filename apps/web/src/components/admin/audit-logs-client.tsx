'use client';

import { useState } from 'react';
import { ClipboardList, Search } from 'lucide-react';
import type { AuditLogDto } from '@academy/types';
import { useApiList } from '@/lib/api/hooks';
import { formatRelativeDate } from '@/lib/utils';
import { Alert, Badge, Button, Input } from '@/components/ui';
import { AdminPageHeader, DataTable, Modal, TableCell, TableRow } from './primitives';
import { ClientPagination } from './users-client';

/**
 * Audit log.
 *
 * Records who did what to which object, for the operations where that matters:
 * role changes, deletions, publishes, settings and feature-flag changes. It is
 * append-only and deliberately contains no credentials or tokens.
 */
export function AuditLogsClient({ locale }: { locale: string }) {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [action, setAction] = useState('');
  const [selected, setSelected] = useState<AuditLogDto | null>(null);

  const logsQuery = useApiList<AuditLogDto>('/admin/audit-logs', {
    page,
    pageSize: 30,
    search: search || undefined,
    action: action || undefined,
  });

  return (
    <>
      <AdminPageHeader
        title="Audit log"
        description="A record of sensitive administrative actions."
      />

      <div className="mb-5 flex flex-col gap-3 sm:flex-row">
        <Input
          type="search"
          placeholder="Search by action, actor or target…"
          aria-label="Search the audit log"
          value={search}
          onChange={(event) => {
            setSearch(event.target.value);
            setPage(1);
          }}
          leadingIcon={<Search className="size-4" />}
          containerClassName="flex-1"
        />
        <Input
          placeholder="Exact action, e.g. user.deleted"
          aria-label="Filter by exact action"
          value={action}
          onChange={(event) => {
            setAction(event.target.value);
            setPage(1);
          }}
          containerClassName="sm:w-64"
        />
      </div>

      {logsQuery.error ? (
        <Alert tone="danger" className="mb-4">
          {logsQuery.error.message}
        </Alert>
      ) : null}

      <DataTable
        headers={['Action', 'Actor', 'Target', 'When', '']}
        isLoading={logsQuery.isLoading}
        isEmpty={(logsQuery.data?.items.length ?? 0) === 0}
        emptyMessage="No audit entries match these filters."
      >
        {logsQuery.data?.items.map((entry) => (
          <TableRow key={entry.id}>
            <TableCell>
              <Badge tone="neutral" className="font-mono text-2xs">
                {entry.action}
              </Badge>
            </TableCell>

            <TableCell>
              <div className="min-w-0">
                <p className="truncate text-sm text-text-primary">
                  {entry.actor?.name ?? 'System'}
                </p>
                {entry.actor?.email ? (
                  <p className="truncate text-2xs text-text-muted">{entry.actor.email}</p>
                ) : null}
              </div>
            </TableCell>

            <TableCell className="text-xs">
              {entry.targetType ? (
                <span className="font-mono text-2xs text-text-muted">
                  {entry.targetType}
                  {entry.targetId ? `:${entry.targetId.slice(0, 8)}` : ''}
                </span>
              ) : (
                '—'
              )}
            </TableCell>

            <TableCell className="whitespace-nowrap text-xs">
              <time dateTime={entry.createdAt} title={new Date(entry.createdAt).toLocaleString(locale)}>
                {formatRelativeDate(entry.createdAt, locale)}
              </time>
            </TableCell>

            <TableCell align="right">
              <Button size="sm" variant="ghost" onClick={() => setSelected(entry)}>
                Details
              </Button>
            </TableCell>
          </TableRow>
        ))}
      </DataTable>

      {logsQuery.data?.meta && logsQuery.data.meta.totalPages > 1 ? (
        <ClientPagination meta={logsQuery.data.meta} onPageChange={setPage} className="mt-5" />
      ) : null}

      {selected ? (
        <Modal open onClose={() => setSelected(null)} title="Audit entry" size="lg">
          <dl className="space-y-4 text-sm">
            <div>
              <dt className="text-text-muted">Action</dt>
              <dd className="font-mono text-text-primary">{selected.action}</dd>
            </div>
            <div>
              <dt className="text-text-muted">Actor</dt>
              <dd className="text-text-primary">
                {selected.actor
                  ? `${selected.actor.name} (${selected.actor.email})`
                  : 'System / unauthenticated'}
              </dd>
            </div>
            <div>
              <dt className="text-text-muted">Target</dt>
              <dd className="font-mono text-text-primary">
                {selected.targetType ?? '—'}
                {selected.targetId ? ` · ${selected.targetId}` : ''}
              </dd>
            </div>
            <div>
              <dt className="text-text-muted">When</dt>
              <dd className="text-text-primary">
                {new Date(selected.createdAt).toLocaleString(locale)}
              </dd>
            </div>
            <div>
              <dt className="text-text-muted">IP address</dt>
              <dd className="font-mono text-text-primary">{selected.ipAddress ?? '—'}</dd>
            </div>
            {selected.metadata ? (
              <div>
                <dt className="text-text-muted">Details</dt>
                <dd>
                  <pre className="mt-1 overflow-x-auto rounded-lg bg-surface-sunken p-3 font-mono text-2xs text-text-secondary">
                    {JSON.stringify(selected.metadata, null, 2)}
                  </pre>
                </dd>
              </div>
            ) : null}
          </dl>
        </Modal>
      ) : null}
    </>
  );
}
