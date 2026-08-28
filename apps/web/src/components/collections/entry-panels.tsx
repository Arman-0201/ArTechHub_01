import Link from 'next/link';
import * as Icons from 'lucide-react';
import { ArrowRight, Check } from 'lucide-react';
import type { CollectionPanelDto, CollectionTone } from '@academy/types';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui';

/**
 * The panels an entry's detail page is made of.
 *
 * Server Components throughout — a reference page is text, and there is nothing
 * here for the browser to do. Each panel is a bordered card with a title, an
 * optional icon and one of five bodies; which body is drawn comes from `kind`,
 * and an unrecognised one renders nothing rather than throwing, so an entry
 * authored against a newer build degrades on an older one instead of taking the
 * page down.
 */

const TONE_DOT: Record<CollectionTone, string> = {
  DEFAULT: 'text-primary',
  INFO: 'text-primary',
  SUCCESS: 'text-success',
  WARNING: 'text-warning',
  DANGER: 'text-danger',
};

const TONE_BORDER: Record<CollectionTone, string> = {
  DEFAULT: 'border-border',
  INFO: 'border-border',
  SUCCESS: 'border-success/35',
  WARNING: 'border-warning/40',
  DANGER: 'border-danger/40',
};

const TONE_BADGE = {
  DEFAULT: 'neutral',
  INFO: 'primary',
  SUCCESS: 'success',
  WARNING: 'warning',
  DANGER: 'danger',
} as const satisfies Record<CollectionTone, string>;

/** Resolves an author-chosen icon name to a Lucide component, safely. */
function resolveIcon(name: string | null) {
  if (!name) return null;
  const candidate = (Icons as unknown as Record<string, unknown>)[name];
  return typeof candidate === 'function' ? (candidate as typeof ArrowRight) : null;
}

/** Blank-line-separated paragraphs, which is how the editor's textarea reads. */
function paragraphs(body: string): string[] {
  return body
    .split(/\n{2,}/)
    .map((part) => part.trim())
    .filter(Boolean);
}

export function EntryPanel({ panel }: { panel: CollectionPanelDto }) {
  const Icon = resolveIcon(panel.iconName);

  return (
    <section
      className={cn(
        'overflow-hidden rounded-xl border bg-surface',
        TONE_BORDER[panel.tone],
      )}
    >
      {panel.title ? (
        <header className="flex items-center gap-2 border-b border-border px-5 py-3.5">
          {Icon ? (
            <Icon className={cn('size-4 shrink-0', TONE_DOT[panel.tone])} aria-hidden="true" />
          ) : (
            <span
              className={cn('size-2 shrink-0 rounded-full bg-current', TONE_DOT[panel.tone])}
              aria-hidden="true"
            />
          )}
          <h2 className="text-sm font-semibold text-text-primary">{panel.title}</h2>
        </header>
      ) : null}

      <div className="px-5 py-4">
        <PanelBody panel={panel} />
      </div>
    </section>
  );
}

function PanelBody({ panel }: { panel: CollectionPanelDto }) {
  switch (panel.kind) {
    case 'TEXT':
      return panel.body ? (
        <div className="space-y-3">
          {paragraphs(panel.body).map((paragraph, index) => (
            <p key={index} className="text-sm leading-relaxed text-text-secondary">
              {paragraph}
            </p>
          ))}
        </div>
      ) : null;

    case 'LIST':
      return (
        <ul className="space-y-2">
          {panel.items.map((item, index) => (
            <li key={index} className="flex items-start gap-2 text-sm text-text-secondary">
              <Check
                className={cn('mt-0.5 size-3.5 shrink-0', TONE_DOT[panel.tone])}
                aria-hidden="true"
              />
              <span>{item}</span>
            </li>
          ))}
        </ul>
      );

    case 'FACTS':
      return <FactList facts={panel.facts} />;

    case 'TABLE':
      return panel.table ? <PanelTable table={panel.table} /> : null;

    case 'LINKS':
      return (
        <ul className="space-y-2">
          {panel.links.map((link, index) => (
            <li key={index}>
              <Link
                href={link.href}
                className={cn(
                  'flex items-center justify-between gap-3 rounded-lg border border-border px-3.5 py-2.5',
                  'transition-colors hover:border-primary',
                  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-border-focus',
                )}
              >
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium text-text-primary">
                    {link.label}
                  </span>
                  {link.sublabel ? (
                    <span className="block truncate text-xs text-text-muted">{link.sublabel}</span>
                  ) : null}
                </span>
                {link.badge ? (
                  <Badge tone={TONE_BADGE[link.tone]} className="shrink-0">
                    {link.badge}
                  </Badge>
                ) : (
                  <ArrowRight className="size-4 shrink-0 text-text-muted" aria-hidden="true" />
                )}
              </Link>
            </li>
          ))}
        </ul>
      );

    default:
      // A kind this build does not know. Skipped, never guessed at.
      return null;
  }
}

export function FactList({ facts }: { facts: { label: string; value: string }[] }) {
  if (facts.length === 0) return null;

  return (
    <dl className="space-y-3">
      {facts.map((fact, index) => (
        <div key={index}>
          <dt className="text-2xs font-medium uppercase tracking-[0.12em] text-text-muted">
            {fact.label}
          </dt>
          <dd className="mt-0.5 text-sm font-semibold text-text-primary">{fact.value}</dd>
        </div>
      ))}
    </dl>
  );
}

/**
 * Wrapped in its own scroll container: a vulnerability table is wide, and the
 * page body must never scroll sideways because one panel does.
 */
function PanelTable({ table }: { table: { columns: string[]; rows: string[][] } }) {
  return (
    <div className="-mx-5 overflow-x-auto px-5">
      <table className="w-full min-w-[32rem] border-collapse text-left text-sm">
        <thead>
          <tr>
            {table.columns.map((column, index) => (
              <th
                key={index}
                scope="col"
                className="border-b border-border pb-2 pr-4 text-2xs font-medium uppercase tracking-[0.12em] text-text-muted last:pr-0"
              >
                {column}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {table.rows.map((row, rowIndex) => (
            <tr key={rowIndex} className="border-b border-border last:border-0">
              {table.columns.map((_, cellIndex) => (
                <td
                  key={cellIndex}
                  className="py-2.5 pr-4 align-top text-text-secondary last:pr-0"
                >
                  {row[cellIndex] ?? ''}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
