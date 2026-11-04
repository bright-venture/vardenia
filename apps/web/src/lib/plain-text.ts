/**
 * Rich text as one line of plain text, for places that cannot show formatting:
 * a page's meta description, and the description in its structured data.
 *
 * Listings used to describe themselves to search engines with their tagline,
 * and the October cleaning emptied every tagline, so all 1,300 listing pages
 * fell back to the same site-wide sentence. The description is what a reader
 * actually reads, so its opening is what a search result now shows.
 */

interface TextNode {
  text?: unknown
  children?: unknown
}

/** Every text node, in reading order, with paragraphs joined by a space. */
export function richTextToPlain(value: unknown): string {
  const parts: string[] = []
  const walk = (node: unknown) => {
    if (!node || typeof node !== 'object') return
    const { text, children } = node as TextNode
    if (typeof text === 'string') parts.push(text)
    if (Array.isArray(children)) {
      for (const child of children) walk(child)
      parts.push(' ')
    }
  }
  walk((value as { root?: unknown } | null)?.root ?? value)
  return parts.join('').replace(/\s+/g, ' ').trim()
}

/**
 * At most `max` characters, cut at a word and marked with an ellipsis.
 *
 * About 155 is what a search result shows before cutting it off itself, and
 * a word cut in half reads as a mistake where an ellipsis reads as "more".
 */
export function summarise(text: string, max = 155): string {
  const clean = text.replace(/\s+/g, ' ').trim()
  if (clean.length <= max) return clean
  const cut = clean.slice(0, max - 1)
  const lastSpace = cut.lastIndexOf(' ')
  const words = lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut
  return `${words.replace(/[\s,;:.]+$/, '')}…`
}

/** The description a listing gives search engines: its tagline, else its text. */
export function listingSummary(listing: { tagline?: string | null; description?: unknown }) {
  const tagline = listing.tagline?.trim()
  if (tagline) return tagline
  const text = summarise(richTextToPlain(listing.description))
  return text || undefined
}
