/**
 * Emits a JSON-LD block.
 *
 * The payload is serialised with `JSON.stringify` and then has `<` escaped, so
 * a value containing `</script>` cannot terminate the script element early —
 * the one real injection risk with inline JSON-LD.
 */
export function StructuredData({ data }: { data: Record<string, unknown> }) {
  const json = JSON.stringify(data).replace(/</g, '\\u003c');

  return (
    <script
      type="application/ld+json"
      // Content is machine-generated JSON, never author-supplied markup.
      dangerouslySetInnerHTML={{ __html: json }}
    />
  );
}
