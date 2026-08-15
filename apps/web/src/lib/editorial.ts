import type { Locale } from '@vardenia/i18n'

/** Display labels for the article `kind` select. */
const KIND_LABELS: Record<string, { en: string; ar: string }> = {
  feature: { en: 'Feature', ar: 'تحقيق' },
  guide: { en: 'Destination guide', ar: 'دليل الوجهة' },
  interview: { en: 'Interview', ar: 'مقابلة' },
  itinerary: { en: 'Itinerary', ar: 'برنامج رحلة' },
  news: { en: 'News', ar: 'أخبار' },
  sponsored: { en: 'Paid partnership', ar: 'شراكة مدفوعة' },
}

export function kindLabel(kind: string | null | undefined, locale: Locale): string {
  if (!kind) return ''
  const found = KIND_LABELS[kind]
  return found ? (locale === 'ar' ? found.ar : found.en) : kind
}

/**
 * "Issue 1, Summer 2026, pages 42-45".
 *
 * Print provenance is not decoration. It is what lets a reader who scanned a
 * code in the magazine confirm they are looking at the right story, and what
 * makes the digital archive line up with the physical run.
 */
export function printCredit(
  print:
    | { issue?: unknown; pageFrom?: number | string | null; pageTo?: number | string | null }
    | null
    | undefined,
  locale: Locale,
): string | null {
  if (!print) return null

  const issue = print.issue as { issueNumber?: number | null; title?: string | null } | null
  if (!issue || typeof issue !== 'object') return null

  const ar = locale === 'ar'
  const parts: string[] = []

  if (issue.issueNumber != null)
    parts.push(ar ? `العدد ${issue.issueNumber}` : `Issue ${issue.issueNumber}`)
  if (issue.title) parts.push(issue.title)

  const from = print.pageFrom
  const to = print.pageTo
  if (from != null && String(from) !== '') {
    const range =
      to != null && String(to) !== '' && String(to) !== String(from) ? `${from}-${to}` : `${from}`

    // Both languages pluralise. Arabic said "صفحة" (one page) for a range too,
    // so a story running across four pages read as though it ran across one.
    const many = range.includes('-')
    parts.push(ar ? `${many ? 'صفحات' : 'صفحة'} ${range}` : `page${many ? 's' : ''} ${range}`)
  }

  return parts.length > 0 ? parts.join(', ') : null
}
