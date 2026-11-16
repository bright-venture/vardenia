/**
 * The page numbers worth showing: the first, the last, and a few either side.
 *
 * This rendered every page. At 24 listings a page that is 42 links for a
 * thousand listings and 417 for ten thousand, in the HTML of every directory
 * view - a control whose usefulness is fixed while its cost grows with the
 * catalogue. Gaps are rendered as an ellipsis so the jump is legible rather
 * than looking like missing pages.
 *
 * Lived in the directory's page.tsx until 16 November 2026, which the sections
 * imported from; a page module is for the page.
 */
export function pageWindow(current: number, total: number, span = 2): (number | 'gap')[] {
  if (total <= 1) return []

  const wanted = new Set<number>([1, total])
  for (let n = current - span; n <= current + span; n++) {
    if (n >= 1 && n <= total) wanted.add(n)
  }

  const pages = [...wanted].sort((a, b) => a - b)
  const out: (number | 'gap')[] = []

  pages.forEach((n, i) => {
    const previous = pages[i - 1]

    if (previous !== undefined) {
      const missing = n - previous - 1
      // An ellipsis standing in for one page takes the same room as the page
      // and tells the reader less. Only collapse a genuine run.
      if (missing === 1) out.push(previous + 1)
      else if (missing > 1) out.push('gap')
    }

    out.push(n)
  })

  return out
}
