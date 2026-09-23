import { taxonomyLabel, type Locale } from '@vardenia/i18n'

/**
 * Display labels for the article `kind` select. English and Arabic are the
 * canonical pair (they seed the CMS select); the other eight UI languages come
 * from the taxonomy translations in @vardenia/i18n, falling back to English.
 */
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
  if (!found) return kind
  return locale === 'ar'
    ? found.ar
    : locale === 'en'
      ? found.en
      : (taxonomyLabel(kind, locale) ?? found.en)
}

/**
 * The print-credit words in each language: the issue, and a page or a range.
 *
 * English and Arabic only until now, so every other language read "Issue 1,
 * pages 42-45". Where a language has one word for a page and for several - the
 * Russian abbreviation, Hindi, Bengali - the two forms are simply the same.
 */
const CREDIT: Record<
  Locale,
  { issue: (n: number) => string; pages: (range: string, many: boolean) => string }
> = {
  en: { issue: (n) => `Issue ${n}`, pages: (r, many) => `page${many ? 's' : ''} ${r}` },
  ar: { issue: (n) => `العدد ${n}`, pages: (r, many) => `${many ? 'صفحات' : 'صفحة'} ${r}` },
  fr: { issue: (n) => `Numéro ${n}`, pages: (r, many) => `page${many ? 's' : ''} ${r}` },
  es: { issue: (n) => `Número ${n}`, pages: (r, many) => `página${many ? 's' : ''} ${r}` },
  pt: { issue: (n) => `Edição ${n}`, pages: (r, many) => `página${many ? 's' : ''} ${r}` },
  ru: { issue: (n) => `Выпуск ${n}`, pages: (r) => `стр. ${r}` },
  zh: { issue: (n) => `第 ${n} 期`, pages: (r) => `第 ${r} 页` },
  hi: { issue: (n) => `अंक ${n}`, pages: (r) => `पृष्ठ ${r}` },
  bn: { issue: (n) => `সংখ্যা ${n}`, pages: (r) => `পৃষ্ঠা ${r}` },
  ur: { issue: (n) => `شمارہ ${n}`, pages: (r, many) => `${many ? 'صفحات' : 'صفحہ'} ${r}` },
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

  const words = CREDIT[locale] ?? CREDIT.en
  const parts: string[] = []

  if (issue.issueNumber != null) parts.push(words.issue(issue.issueNumber))
  if (issue.title) parts.push(issue.title)

  const from = print.pageFrom
  const to = print.pageTo
  if (from != null && String(from) !== '') {
    const range =
      to != null && String(to) !== '' && String(to) !== String(from) ? `${from}-${to}` : `${from}`

    // Both languages pluralise. Arabic said "صفحة" (one page) for a range too,
    // so a story running across four pages read as though it ran across one.
    const many = range.includes('-')
    parts.push(words.pages(range, many))
  }

  return parts.length > 0 ? parts.join(', ') : null
}
