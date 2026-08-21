import sanitizeHtml from 'sanitize-html';

/**
 * HTML sanitisation for the one CMS section type that accepts markup.
 *
 * The policy is an allowlist, never a denylist: anything not named here is
 * dropped. Notable exclusions and why:
 *   - `script`, `style`, `iframe`, `object`, `embed`, `form` — code execution
 *     and credential-phishing vectors.
 *   - every `on*` attribute — inline event handlers are script by another name.
 *   - `javascript:` / `data:` URLs — blocked by the scheme allowlist below,
 *     which is what stops `<a href="javascript:...">`.
 *
 * Applied on write as well as trusted on read, so a payload stored before a
 * policy change cannot resurface.
 */

const ALLOWED_TAGS = [
  'h2', 'h3', 'h4', 'h5', 'h6',
  'p', 'br', 'hr', 'span', 'div',
  'strong', 'b', 'em', 'i', 'u', 's', 'sub', 'sup', 'mark', 'small',
  'ul', 'ol', 'li',
  'blockquote', 'pre', 'code',
  'a', 'img', 'figure', 'figcaption',
  'table', 'thead', 'tbody', 'tfoot', 'tr', 'th', 'td', 'caption',
];

export function sanitizeRichHtml(dirty: string): string {
  if (!dirty) return '';

  return sanitizeHtml(dirty, {
    allowedTags: ALLOWED_TAGS,
    allowedAttributes: {
      a: ['href', 'title', 'target', 'rel'],
      img: ['src', 'alt', 'title', 'width', 'height', 'loading'],
      td: ['colspan', 'rowspan'],
      th: ['colspan', 'rowspan', 'scope'],
      '*': ['class'],
    },
    allowedSchemes: ['http', 'https', 'mailto'],
    allowedSchemesByTag: { img: ['http', 'https'] },
    allowProtocolRelative: false,
    // Every outbound link opens safely: `noopener` denies the new page access
    // to `window.opener`, `noreferrer` withholds the referrer.
    transformTags: {
      a: (tagName, attribs) => ({
        tagName,
        attribs: {
          ...attribs,
          ...(attribs.target === '_blank' ? { rel: 'noopener noreferrer' } : {}),
        },
      }),
    },
    // Class names are allowlisted so a payload cannot borrow app styling to
    // build a convincing fake UI inside a content block.
    allowedClasses: {
      '*': ['text-left', 'text-center', 'text-right', 'lead', 'callout', 'note', 'warning'],
    },
    disallowedTagsMode: 'discard',
  });
}

/** Flattens HTML to text for search indexing and excerpt generation. */
export function htmlToPlainText(html: string): string {
  return sanitizeHtml(html, { allowedTags: [], allowedAttributes: {} })
    .replace(/\s+/g, ' ')
    .trim();
}
