import { useTranslations } from 'next-intl'
import { ButtonLink } from '../../../../components/ui/Button'

export type SearchParams = Record<string, string | string[] | undefined>
type PageKey = 'listingsPage' | 'articlesPage'

/** Keep the other result group and all query parameters intact when paging. */
export function searchPageHref(params: SearchParams, key: PageKey, page: number): string {
  const query = new URLSearchParams()
  for (const [name, value] of Object.entries(params)) {
    if (name === key || value === undefined) continue
    for (const item of Array.isArray(value) ? value : [value]) query.append(name, item)
  }
  if (page > 1) query.set(key, String(page))
  return `/search?${query.toString()}`
}

/** Two independent result sets, with compact, touch-sized navigation for each. */
export function SearchPagination({
  page,
  totalPages,
  pageKey,
  searchParams,
  labelledBy,
}: {
  page: number
  totalPages: number
  pageKey: PageKey
  searchParams: SearchParams
  labelledBy: string
}) {
  const t = useTranslations('partner')
  if (totalPages <= 1) return null

  return (
    <nav
      aria-labelledby={labelledBy}
      className="mt-8 flex flex-wrap items-center justify-center gap-3"
    >
      {page > 1 ? (
        <ButtonLink variant="outline" href={searchPageHref(searchParams, pageKey, page - 1)}>
          {t('pagePrev')}
        </ButtonLink>
      ) : null}
      <span aria-current="page" className="text-ink-500 text-sm tabular-nums">
        {t('pageOf', { page, pages: totalPages })}
      </span>
      {page < totalPages ? (
        <ButtonLink variant="outline" href={searchPageHref(searchParams, pageKey, page + 1)}>
          {t('pageNext')}
        </ButtonLink>
      ) : null}
    </nav>
  )
}
