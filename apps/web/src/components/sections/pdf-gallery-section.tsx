import { SectionHeading } from '@/components/ui';
import { readPdfGalleryItems } from '@/lib/pdf-gallery';
import { SectionShell } from './blocks';
import { readNumber, readOptionalString, readString, type SectionProps } from './types';
import { PdfGalleryGrid } from './pdf-gallery-grid';

/**
 * PDF gallery section.
 *
 * A Server Component, like the rest of the registry: the heading, background
 * and spacing are decided here and shipped as HTML, and only the grid — which
 * has to open a reader — crosses into the browser.
 *
 * An empty gallery renders nothing at all, which is how every other collection
 * section behaves. A section an editor has started but not filled should not
 * leave a heading over blank space on the live site; the editor's own empty
 * state is where that is explained.
 */
export function PdfGallerySection({ section }: SectionProps) {
  const items = readPdfGalleryItems(section.content);
  if (items.length === 0) return null;

  const title = readOptionalString(section.content, 'title');
  const description = readOptionalString(section.content, 'description');

  return (
    <SectionShell background={readString(section.settings, 'background', 'default')}>
      {title ? (
        <SectionHeading
          title={title}
          {...(description ? { description } : {})}
          align={readString(section.settings, 'align', 'left') === 'center' ? 'center' : 'left'}
          className="mb-8"
        />
      ) : null}

      <PdfGalleryGrid items={items} columns={readNumber(section.settings, 'columns', 4)} />
    </SectionShell>
  );
}
