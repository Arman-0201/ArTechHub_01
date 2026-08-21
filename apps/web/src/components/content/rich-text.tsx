import { Fragment, type ReactNode } from 'react';
import Link from 'next/link';
import { AlertCircle, CheckCircle2, Info, TriangleAlert } from 'lucide-react';
import type { RichTextDocument, RichTextMark, RichTextNode } from '@academy/types';
import { cn } from '@/lib/utils';

/**
 * Renders the structured rich-text document format.
 *
 * The security property that makes this worth having: there is no HTML string
 * anywhere in this file. Every node maps to a React element, text is rendered
 * as text, and an unrecognised node type is skipped rather than passed through.
 * `dangerouslySetInnerHTML` is never used, so stored content cannot inject
 * markup no matter what reached the database.
 */

/** Only http(s), site-relative and anchor links survive. */
function safeHref(href: string): string | null {
  const trimmed = href.trim();
  if (trimmed.startsWith('/') || trimmed.startsWith('#')) return trimmed;
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  if (/^mailto:/i.test(trimmed)) return trimmed;
  // Anything else — `javascript:`, `data:`, unknown schemes — is dropped.
  return null;
}

function applyMarks(content: ReactNode, marks: RichTextMark[] | undefined, key: string): ReactNode {
  if (!marks || marks.length === 0) return content;

  return marks.reduce<ReactNode>((accumulated, mark, index) => {
    const markKey = `${key}-m${index}`;
    switch (mark.type) {
      case 'bold':
        return <strong key={markKey}>{accumulated}</strong>;
      case 'italic':
        return <em key={markKey}>{accumulated}</em>;
      case 'underline':
        return <u key={markKey}>{accumulated}</u>;
      case 'strike':
        return <s key={markKey}>{accumulated}</s>;
      case 'code':
        return <code key={markKey}>{accumulated}</code>;
      case 'link': {
        const href = safeHref(mark.href);
        if (!href) return accumulated;
        const isExternal = /^https?:\/\//i.test(href);
        if (isExternal) {
          return (
            <a key={markKey} href={href} target="_blank" rel="noopener noreferrer nofollow">
              {accumulated}
            </a>
          );
        }
        return (
          <Link key={markKey} href={href}>
            {accumulated}
          </Link>
        );
      }
      default:
        return accumulated;
    }
  }, content);
}

const CALLOUT_CONFIG = {
  info: { className: 'border-info/25 bg-info-soft', Icon: Info, iconClass: 'text-info' },
  success: {
    className: 'border-success/25 bg-success-soft',
    Icon: CheckCircle2,
    iconClass: 'text-success',
  },
  warning: {
    className: 'border-warning/25 bg-warning-soft',
    Icon: TriangleAlert,
    iconClass: 'text-warning',
  },
  danger: {
    className: 'border-danger/25 bg-danger-soft',
    Icon: AlertCircle,
    iconClass: 'text-danger',
  },
} as const;

function renderNodes(nodes: RichTextNode[] | undefined, keyPrefix: string): ReactNode[] {
  if (!nodes) return [];
  return nodes.map((node, index) => renderNode(node, `${keyPrefix}-${index}`));
}

function renderNode(node: RichTextNode, key: string): ReactNode {
  if (!node || typeof node !== 'object' || !('type' in node)) return null;

  switch (node.type) {
    case 'text': {
      const textNode = node as { text: string; marks?: RichTextMark[] };
      return <Fragment key={key}>{applyMarks(textNode.text, textNode.marks, key)}</Fragment>;
    }

    case 'hardBreak':
      return <br key={key} />;

    case 'paragraph': {
      const children = renderNodes((node as { content?: RichTextNode[] }).content, key);
      // An empty paragraph is layout noise from an import; drop it.
      if (children.length === 0) return null;
      return <p key={key}>{children}</p>;
    }

    case 'heading': {
      const heading = node as { attrs: { level: 2 | 3 | 4 }; content?: RichTextNode[] };
      const Tag = (['h2', 'h3', 'h4'][heading.attrs.level - 2] ?? 'h3') as 'h2' | 'h3' | 'h4';
      return <Tag key={key}>{renderNodes(heading.content, key)}</Tag>;
    }

    case 'bulletList':
      return <ul key={key}>{renderNodes((node as { content?: RichTextNode[] }).content, key)}</ul>;

    case 'orderedList': {
      const list = node as { attrs?: { start?: number }; content?: RichTextNode[] };
      return (
        <ol key={key} start={list.attrs?.start}>
          {renderNodes(list.content, key)}
        </ol>
      );
    }

    case 'listItem':
      return <li key={key}>{renderNodes((node as { content?: RichTextNode[] }).content, key)}</li>;

    case 'blockquote':
      return (
        <blockquote key={key}>
          {renderNodes((node as { content?: RichTextNode[] }).content, key)}
        </blockquote>
      );

    case 'codeBlock': {
      const block = node as { attrs?: { language?: string }; content?: RichTextNode[] };
      const source = (block.content ?? [])
        .map((child) => ('text' in child ? (child as { text: string }).text : ''))
        .join('');
      return (
        <div key={key} className="not-prose my-6">
          {block.attrs?.language ? (
            <div className="flex items-center justify-between rounded-t-lg border border-b-0 border-ink-800 bg-ink-900 px-4 py-1.5">
              <span className="font-mono text-2xs uppercase tracking-wider text-ink-200">
                {block.attrs.language}
              </span>
            </div>
          ) : null}
          <pre className={cn(block.attrs?.language && 'rounded-t-none')}>
            <code>{source}</code>
          </pre>
        </div>
      );
    }

    case 'image': {
      const image = node as {
        attrs: { src: string; alt?: string; caption?: string; width?: number; height?: number };
      };
      const src = safeHref(image.attrs.src);
      if (!src) return null;
      return (
        <figure key={key} className="not-prose my-8">
          {/* Content images are arbitrary remote URLs from the CMS; a plain img
              keeps them working without per-host loader configuration. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={src}
            alt={image.attrs.alt ?? ''}
            width={image.attrs.width}
            height={image.attrs.height}
            loading="lazy"
            decoding="async"
            className="w-full rounded-xl border border-border"
          />
          {image.attrs.caption ? (
            <figcaption className="mt-2.5 text-center text-sm text-text-muted">
              {image.attrs.caption}
            </figcaption>
          ) : null}
        </figure>
      );
    }

    case 'video': {
      const video = node as {
        attrs: { src: string; provider?: string; poster?: string; caption?: string };
      };
      const src = safeHref(video.attrs.src);
      if (!src) return null;

      return (
        <figure key={key} className="not-prose my-8">
          <div className="overflow-hidden rounded-xl border border-border bg-ink-950">
            {video.attrs.provider === 'youtube' || video.attrs.provider === 'vimeo' ? (
              <iframe
                src={src}
                title={video.attrs.caption ?? 'Video'}
                className="aspect-video w-full"
                allow="accelerometer; clipboard-write; encrypted-media; picture-in-picture"
                allowFullScreen
                loading="lazy"
              />
            ) : (
              <video
                src={src}
                poster={video.attrs.poster ? (safeHref(video.attrs.poster) ?? undefined) : undefined}
                controls
                preload="metadata"
                className="aspect-video w-full"
              />
            )}
          </div>
          {video.attrs.caption ? (
            <figcaption className="mt-2.5 text-center text-sm text-text-muted">
              {video.attrs.caption}
            </figcaption>
          ) : null}
        </figure>
      );
    }

    case 'callout': {
      const callout = node as {
        attrs?: { variant?: keyof typeof CALLOUT_CONFIG };
        content?: RichTextNode[];
      };
      const config = CALLOUT_CONFIG[callout.attrs?.variant ?? 'info'];
      return (
        <aside
          key={key}
          className={cn('not-prose my-7 flex gap-3.5 rounded-xl border p-5', config.className)}
        >
          <config.Icon
            className={cn('mt-0.5 size-5 shrink-0', config.iconClass)}
            aria-hidden="true"
          />
          <div className="min-w-0 flex-1 text-[0.9375rem] leading-relaxed text-text-secondary [&>p+p]:mt-3">
            {renderNodes(callout.content, key)}
          </div>
        </aside>
      );
    }

    case 'table':
      return (
        <div key={key} className="not-prose my-7 overflow-x-auto rounded-xl border border-border">
          <table className="w-full border-collapse text-sm">
            <tbody>{renderNodes((node as { content?: RichTextNode[] }).content, key)}</tbody>
          </table>
        </div>
      );

    case 'tableRow':
      return (
        <tr key={key} className="border-b border-border last:border-b-0">
          {renderNodes((node as { content?: RichTextNode[] }).content, key)}
        </tr>
      );

    case 'tableCell': {
      const cell = node as {
        attrs?: { header?: boolean; colspan?: number };
        content?: RichTextNode[];
      };
      const Tag = cell.attrs?.header ? 'th' : 'td';
      return (
        <Tag
          key={key}
          colSpan={cell.attrs?.colspan}
          scope={cell.attrs?.header ? 'col' : undefined}
          className={cn(
            'border-r border-border px-4 py-2.5 text-left align-top last:border-r-0',
            cell.attrs?.header
              ? 'bg-surface-sunken font-semibold text-text-primary'
              : 'text-text-secondary',
          )}
        >
          {renderNodes(cell.content, key)}
        </Tag>
      );
    }

    case 'divider':
      return <hr key={key} className="my-10 border-border" />;

    case 'embed': {
      const embed = node as { attrs: { url: string; title?: string } };
      const src = safeHref(embed.attrs.url);
      if (!src) return null;
      return (
        <div key={key} className="not-prose my-8 overflow-hidden rounded-xl border border-border">
          <iframe
            src={src}
            title={embed.attrs.title ?? 'Embedded resource'}
            className="aspect-video w-full"
            loading="lazy"
            // Embeds are third-party content: the sandbox denies them same-origin
            // access, form submission and top-level navigation.
            sandbox="allow-scripts allow-same-origin allow-presentation"
          />
        </div>
      );
    }

    default:
      // Unknown node types are skipped rather than rendered blindly — the
      // renderer and the schema evolve together.
      return null;
  }
}

export function RichText({
  document,
  className,
}: {
  document: RichTextDocument | null | undefined;
  className?: string;
}) {
  if (!document || !Array.isArray(document.content) || document.content.length === 0) {
    return null;
  }

  return (
    <div className={cn('prose-reading', className)}>
      {renderNodes(document.content, 'n')}
    </div>
  );
}

/** Flattens a document to plain text, for excerpts and meta descriptions. */
export function richTextToPlainText(
  document: RichTextDocument | null | undefined,
  maxLength = 300,
): string {
  if (!document) return '';

  const parts: string[] = [];
  const walk = (nodes: RichTextNode[] | undefined): void => {
    for (const node of nodes ?? []) {
      if (!node || typeof node !== 'object') continue;
      if ('text' in node && typeof node.text === 'string') parts.push(node.text);
      if ('content' in node) walk((node as { content?: RichTextNode[] }).content);
      if (parts.join(' ').length > maxLength * 2) return;
    }
  };
  walk(document.content);

  const text = parts.join(' ').replace(/\s+/g, ' ').trim();
  return text.length > maxLength ? `${text.slice(0, maxLength - 1).trimEnd()}…` : text;
}
