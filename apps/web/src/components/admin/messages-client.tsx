'use client';

import { useState } from 'react';
import { Check, Inbox, Mail, RotateCcw } from 'lucide-react';
import type { ContactMessageDto, NewsletterSubscriberDto } from '@academy/types';
import { api, useApiList, useApiMutation } from '@/lib/api/hooks';
import { formatRelativeDate } from '@/lib/utils';
import { Alert, Badge, Button } from '@/components/ui';
import { AdminPageHeader, DataTable, Modal, TableCell, TableRow } from './primitives';
import { ClientPagination } from './users-client';

/**
 * The support inboxes.
 *
 * The one admin screen fed entirely by visitors rather than by administrators,
 * which is exactly why it is the screen that most needs to be live: nobody
 * reloads a page waiting for a stranger to write in. A contact message or a
 * newsletter signup announces itself through the `messages` realtime resource,
 * and the queries below are invalidated by prefix from `RealtimeProvider` — so
 * a message sent while this page is open appears without anyone doing anything.
 *
 * Two tabs rather than two routes. They are read the same way, at the same
 * moment, by the same person clearing the same backlog, and splitting them
 * across the navigation would only add a click to a job that is already dull.
 */

type Tab = 'messages' | 'subscribers';

export function MessagesClient({ locale }: { locale: string }) {
  const [tab, setTab] = useState<Tab>('messages');

  return (
    <>
      <AdminPageHeader
        title="Inbox"
        description="Contact form submissions and newsletter subscribers."
      />

      <div
        role="tablist"
        aria-label="Inbox sections"
        className="mb-5 flex gap-1 border-b border-border"
      >
        <TabButton
          isActive={tab === 'messages'}
          onClick={() => setTab('messages')}
          Icon={Inbox}
          label="Messages"
        />
        <TabButton
          isActive={tab === 'subscribers'}
          onClick={() => setTab('subscribers')}
          Icon={Mail}
          label="Subscribers"
        />
      </div>

      {tab === 'messages' ? <MessagesTab locale={locale} /> : <SubscribersTab locale={locale} />}
    </>
  );
}

function TabButton({
  isActive,
  onClick,
  Icon,
  label,
}: {
  isActive: boolean;
  onClick: () => void;
  Icon: typeof Inbox;
  label: string;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={isActive}
      onClick={onClick}
      className={`-mb-px flex items-center gap-2 border-b-2 px-4 py-2.5 text-sm font-medium transition-colors ${
        isActive
          ? 'border-accent text-text-primary'
          : 'border-transparent text-text-muted hover:text-text-secondary'
      }`}
    >
      <Icon className="size-4" />
      {label}
    </button>
  );
}

/* --------------------------------------------------------------- messages */

function MessagesTab({ locale }: { locale: string }) {
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<ContactMessageDto | null>(null);

  const messagesQuery = useApiList<ContactMessageDto>('/admin/contact-messages', {
    page,
    pageSize: 25,
  });

  /*
   * Invalidating `/admin/contact-messages` covers the list this row is in. The
   * server also audits the change, so every *other* admin reading the same
   * inbox is told through the live feed — which is the whole point of a shared
   * queue: two people clearing it should not both answer the same message.
   */
  const handledMutation = useApiMutation(
    ({ id, isHandled }: { id: string; isHandled: boolean }) =>
      api.patch<ContactMessageDto>(`/admin/contact-messages/${id}`, { isHandled }),
    ['/admin/contact-messages'],
    { onSuccess: () => setSelected(null) },
  );

  return (
    <>
      {messagesQuery.error ? (
        <Alert tone="danger" className="mb-4">
          {messagesQuery.error.message}
        </Alert>
      ) : null}

      <DataTable
        headers={['From', 'Subject', 'Received', 'Status', '']}
        isLoading={messagesQuery.isLoading}
        isEmpty={(messagesQuery.data?.items.length ?? 0) === 0}
        emptyMessage="No messages yet. New ones appear here as they arrive."
      >
        {messagesQuery.data?.items.map((message) => (
          <TableRow key={message.id} className={message.isHandled ? 'opacity-60' : undefined}>
            <TableCell>
              <div className="min-w-0">
                <p className="truncate text-sm text-text-primary">{message.name}</p>
                <p className="truncate text-2xs text-text-muted">{message.email}</p>
              </div>
            </TableCell>

            <TableCell className="max-w-xs">
              <p className="truncate text-sm text-text-secondary">{message.subject}</p>
            </TableCell>

            <TableCell className="whitespace-nowrap text-xs">
              <time
                dateTime={message.createdAt}
                title={new Date(message.createdAt).toLocaleString(locale)}
              >
                {formatRelativeDate(message.createdAt, locale)}
              </time>
            </TableCell>

            <TableCell>
              <Badge tone={message.isHandled ? 'neutral' : 'accent'}>
                {message.isHandled ? 'Handled' : 'New'}
              </Badge>
            </TableCell>

            <TableCell align="right">
              <Button size="sm" variant="ghost" onClick={() => setSelected(message)}>
                Read
              </Button>
            </TableCell>
          </TableRow>
        ))}
      </DataTable>

      {messagesQuery.data?.meta && messagesQuery.data.meta.totalPages > 1 ? (
        <ClientPagination meta={messagesQuery.data.meta} onPageChange={setPage} className="mt-5" />
      ) : null}

      {selected ? (
        <Modal open onClose={() => setSelected(null)} title={selected.subject} size="lg">
          <dl className="space-y-4 text-sm">
            <div>
              <dt className="text-text-muted">From</dt>
              <dd className="text-text-primary">
                {selected.name} ·{' '}
                <a href={`mailto:${selected.email}`} className="text-accent hover:underline">
                  {selected.email}
                </a>
              </dd>
            </div>
            <div>
              <dt className="text-text-muted">Received</dt>
              <dd className="text-text-primary">
                {new Date(selected.createdAt).toLocaleString(locale)}
              </dd>
            </div>
            <div>
              <dt className="text-text-muted">Message</dt>
              {/*
                Rendered as text, never as markup. This is the one field on this
                screen written verbatim by an anonymous visitor.
              */}
              <dd className="mt-1 whitespace-pre-wrap rounded-lg bg-surface-sunken p-3 text-text-secondary">
                {selected.message}
              </dd>
            </div>
            <div>
              <dt className="text-text-muted">IP address</dt>
              <dd className="font-mono text-2xs text-text-primary">{selected.ipAddress ?? '—'}</dd>
            </div>
          </dl>

          {handledMutation.error ? (
            <Alert tone="danger" className="mt-4">
              {handledMutation.error.message}
            </Alert>
          ) : null}

          <div className="mt-6 flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setSelected(null)}>
              Close
            </Button>
            <Button
              isLoading={handledMutation.isPending}
              onClick={() =>
                handledMutation.mutate({ id: selected.id, isHandled: !selected.isHandled })
              }
            >
              {selected.isHandled ? (
                <RotateCcw className="size-4" />
              ) : (
                <Check className="size-4" />
              )}
              {selected.isHandled ? 'Reopen' : 'Mark handled'}
            </Button>
          </div>
        </Modal>
      ) : null}
    </>
  );
}

/* ------------------------------------------------------------ subscribers */

function SubscribersTab({ locale }: { locale: string }) {
  const [page, setPage] = useState(1);

  const subscribersQuery = useApiList<NewsletterSubscriberDto>('/admin/newsletter-subscribers', {
    page,
    pageSize: 50,
  });

  return (
    <>
      {subscribersQuery.error ? (
        <Alert tone="danger" className="mb-4">
          {subscribersQuery.error.message}
        </Alert>
      ) : null}

      <DataTable
        headers={['Email', 'Language', 'Confirmed', 'Subscribed']}
        isLoading={subscribersQuery.isLoading}
        isEmpty={(subscribersQuery.data?.items.length ?? 0) === 0}
        emptyMessage="Nobody has subscribed yet."
      >
        {subscribersQuery.data?.items.map((subscriber) => (
          <TableRow key={subscriber.id}>
            <TableCell>
              <span className="text-sm text-text-primary">{subscriber.email}</span>
            </TableCell>

            <TableCell>
              <Badge tone="neutral" className="uppercase">
                {subscriber.locale}
              </Badge>
            </TableCell>

            <TableCell>
              <Badge tone={subscriber.isConfirmed ? 'success' : 'neutral'}>
                {subscriber.isConfirmed ? 'Confirmed' : 'Pending'}
              </Badge>
            </TableCell>

            <TableCell className="whitespace-nowrap text-xs">
              <time
                dateTime={subscriber.createdAt}
                title={new Date(subscriber.createdAt).toLocaleString(locale)}
              >
                {formatRelativeDate(subscriber.createdAt, locale)}
              </time>
            </TableCell>
          </TableRow>
        ))}
      </DataTable>

      {subscribersQuery.data?.meta && subscribersQuery.data.meta.totalPages > 1 ? (
        <ClientPagination
          meta={subscribersQuery.data.meta}
          onPageChange={setPage}
          className="mt-5"
        />
      ) : null}
    </>
  );
}
