/**
 * Renders a schema.org block into the page.
 *
 * The `<` escape is the whole reason this is a component rather than an inline
 * `dangerouslySetInnerHTML` at each call site. Content inside a `<script>` tag
 * is not HTML-escaped by the browser, so a business name or an internal note
 * containing `</script>` would close the tag early and let whatever followed be
 * parsed as markup. Every value here comes from the CMS, which staff type into
 * freely, so that is a real path and not a theoretical one.
 *
 * Replacing `<` with its unicode escape keeps the JSON valid and identical once
 * parsed, while making the sequence impossible to produce.
 */
export function JsonLd({ data }: { data: Record<string, unknown> }) {
  const json = JSON.stringify(data).replace(/</g, '\\u003c')

  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: json }} />
}
