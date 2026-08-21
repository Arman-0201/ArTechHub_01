'use client';

import { useState } from 'react';
import { Search, ShoppingCart } from 'lucide-react';
import type { OrderDto } from '@academy/types';
import { PERMISSIONS } from '@academy/types';
import { api, useApiList, useApiMutation } from '@/lib/api/hooks';
import { formatDate, formatPrice } from '@/lib/utils';
import { useAuth } from '@/components/providers';
import { Alert, Badge, Button, Input, Select, Textarea } from '@/components/ui';
import { AdminPageHeader, DataTable, Modal, TableCell, TableRow } from './primitives';
import { ClientPagination } from './users-client';

const STATUS_TONES = {
  PENDING: 'neutral',
  AWAITING_PAYMENT: 'warning',
  PAID: 'primary',
  FULFILLED: 'success',
  CANCELLED: 'neutral',
  REFUNDED: 'danger',
} as const;

const STATUS_OPTIONS = [
  { value: 'PENDING', label: 'Pending' },
  { value: 'AWAITING_PAYMENT', label: 'Awaiting payment' },
  { value: 'PAID', label: 'Paid' },
  { value: 'FULFILLED', label: 'Fulfilled' },
  { value: 'CANCELLED', label: 'Cancelled' },
  { value: 'REFUNDED', label: 'Refunded' },
];

export function OrdersClient({ locale }: { locale: string }) {
  const { can } = useAuth();
  const canManage = can(PERMISSIONS.ORDERS_MANAGE);

  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [selected, setSelected] = useState<OrderDto | null>(null);

  const ordersQuery = useApiList<OrderDto>('/admin/orders', {
    page,
    pageSize: 25,
    search: search || undefined,
    status: status || undefined,
  });

  return (
    <>
      <AdminPageHeader title="Orders" description="Shop orders and their fulfilment status." />

      <div className="mb-5 flex flex-col gap-3 sm:flex-row">
        <Input
          type="search"
          placeholder="Search by reference, name or email…"
          aria-label="Search orders"
          value={search}
          onChange={(event) => {
            setSearch(event.target.value);
            setPage(1);
          }}
          leadingIcon={<Search className="size-4" />}
          containerClassName="flex-1"
        />
        <Select
          aria-label="Filter by status"
          value={status}
          onChange={(event) => {
            setStatus(event.target.value);
            setPage(1);
          }}
          placeholder="All statuses"
          options={STATUS_OPTIONS}
          containerClassName="sm:w-52"
        />
      </div>

      {ordersQuery.error ? (
        <Alert tone="danger" className="mb-4">
          {ordersQuery.error.message}
        </Alert>
      ) : null}

      <DataTable
        headers={['Reference', 'Customer', 'Items', 'Total', 'Status', 'Placed', '']}
        isLoading={ordersQuery.isLoading}
        isEmpty={(ordersQuery.data?.items.length ?? 0) === 0}
        emptyMessage="No orders match these filters."
      >
        {ordersQuery.data?.items.map((order) => (
          <TableRow key={order.id}>
            <TableCell className="font-mono text-xs text-text-primary">{order.reference}</TableCell>

            <TableCell>
              <div className="min-w-0">
                <p className="truncate text-sm text-text-primary">{order.customer?.name}</p>
                <p className="truncate text-2xs text-text-muted">{order.customer?.email}</p>
              </div>
            </TableCell>

            <TableCell className="text-xs">{order.items.length}</TableCell>

            <TableCell className="whitespace-nowrap text-sm font-medium text-text-primary">
              {formatPrice(order.totalCents, order.currency, locale)}
            </TableCell>

            <TableCell>
              <Badge tone={STATUS_TONES[order.status as keyof typeof STATUS_TONES] ?? 'neutral'}>
                {order.status.replace(/_/g, ' ').toLowerCase()}
              </Badge>
            </TableCell>

            <TableCell className="whitespace-nowrap text-xs">
              {formatDate(order.createdAt, locale)}
            </TableCell>

            <TableCell align="right">
              <Button size="sm" variant="ghost" onClick={() => setSelected(order)}>
                View
              </Button>
            </TableCell>
          </TableRow>
        ))}
      </DataTable>

      {ordersQuery.data?.meta && ordersQuery.data.meta.totalPages > 1 ? (
        <ClientPagination meta={ordersQuery.data.meta} onPageChange={setPage} className="mt-5" />
      ) : null}

      {selected ? (
        <OrderDetailModal
          order={selected}
          locale={locale}
          canManage={canManage}
          onClose={() => setSelected(null)}
        />
      ) : null}
    </>
  );
}

function OrderDetailModal({
  order,
  locale,
  canManage,
  onClose,
}: {
  order: OrderDto;
  locale: string;
  canManage: boolean;
  onClose: () => void;
}) {
  const [status, setStatus] = useState(order.status);
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);

  const mutation = useApiMutation(
    () => api.put(`/admin/orders/${order.id}/status`, { status, note: note || undefined }),
    ['/admin/orders'],
    { onSuccess: onClose, onError: (caught) => setError(caught.message) },
  );

  return (
    <Modal
      open
      onClose={onClose}
      title={`Order ${order.reference}`}
      size="lg"
      footer={
        canManage ? (
          <>
            <Button variant="ghost" onClick={onClose}>
              Close
            </Button>
            <Button
              onClick={() => {
                setError(null);
                mutation.mutate(undefined as never);
              }}
              isLoading={mutation.isPending}
              disabled={status === order.status}
            >
              Update status
            </Button>
          </>
        ) : (
          <Button variant="ghost" onClick={onClose}>
            Close
          </Button>
        )
      }
    >
      <div className="space-y-5">
        {error ? <Alert tone="danger">{error}</Alert> : null}

        <dl className="grid gap-3 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-text-muted">Customer</dt>
            <dd className="text-text-primary">{order.customer?.name}</dd>
          </div>
          <div>
            <dt className="text-text-muted">Email</dt>
            <dd className="text-text-primary">{order.customer?.email}</dd>
          </div>
          <div>
            <dt className="text-text-muted">Placed</dt>
            <dd className="text-text-primary">
              {new Date(order.createdAt).toLocaleString(locale)}
            </dd>
          </div>
          <div>
            <dt className="text-text-muted">Status</dt>
            <dd>
              <Badge tone={STATUS_TONES[order.status as keyof typeof STATUS_TONES] ?? 'neutral'}>
                {order.status.replace(/_/g, ' ').toLowerCase()}
              </Badge>
            </dd>
          </div>
        </dl>

        <div className="overflow-hidden rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-surface-sunken">
                <th scope="col" className="px-4 py-2 text-left text-xs font-semibold text-text-muted">
                  Item
                </th>
                <th scope="col" className="px-4 py-2 text-right text-xs font-semibold text-text-muted">
                  Qty
                </th>
                <th scope="col" className="px-4 py-2 text-right text-xs font-semibold text-text-muted">
                  Total
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {order.items.map((item) => (
                <tr key={item.id}>
                  <td className="px-4 py-2.5 text-text-secondary">{item.name}</td>
                  <td className="px-4 py-2.5 text-right text-text-secondary">{item.quantity}</td>
                  <td className="px-4 py-2.5 text-right font-medium text-text-primary">
                    {formatPrice(item.totalCents, order.currency, locale)}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t border-border bg-surface-sunken">
                <td colSpan={2} className="px-4 py-2.5 text-right font-medium text-text-primary">
                  Total
                </td>
                <td className="px-4 py-2.5 text-right font-semibold text-text-primary">
                  {formatPrice(order.totalCents, order.currency, locale)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>

        {canManage ? (
          <div className="space-y-4 border-t border-border pt-4">
            <Select
              label="Update status"
              value={status}
              onChange={(event) => setStatus(event.target.value as typeof status)}
              options={STATUS_OPTIONS}
              hint="Cancelling or refunding returns any reserved stock."
            />
            <Textarea
              label="Note"
              rows={2}
              hint="Recorded in the audit log."
              value={note}
              onChange={(event) => setNote(event.target.value)}
            />
          </div>
        ) : null}
      </div>
    </Modal>
  );
}
