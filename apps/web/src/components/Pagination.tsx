import { Link } from '../i18n/routing'
import { pageWindow } from '../lib/page-window'

/**
 * Page numbers under a list: the directory, the sections, the article index.
 *
 * One component since 16 November 2026. Each list had its own copy, and they
 * had drifted: the directory drew the design's square cells, the sections an
 * older bordered style, and the article index every page number with no window
 * and no `nofollow`.
 *
 * Square cells, navy for the current page, per the design. The window keeps a
 * long list to one row on a phone (lib/page-window). The links are `nofollow`
 * and not prefetched: every listing and article is in the sitemap, so crawlers
 * need not walk the pages, and a reader's browser need not render them all
 * ahead of a click.
 *
 * `href` builds the address of page n, so each list keeps its own filters on it.
 */
export function Pagination({
  page,
  totalPages,
  href,
  className = 'mt-16',
}: {
  page: number
  totalPages: number
  href: (n: number) => string
  className?: string
}) {
  if (totalPages <= 1) return null
  return (
    <nav className={`${className} flex items-center justify-center gap-2`} aria-label="Pagination">
      {pageWindow(page, totalPages).map((n, i) =>
        n === 'gap' ? (
          <span key={`gap-${i}`} aria-hidden className="text-ink-500 px-1">
            &hellip;
          </span>
        ) : (
          <Link
            key={n}
            href={href(n)}
            prefetch={false}
            rel="nofollow"
            aria-current={n === page ? 'page' : undefined}
            className={
              n === page
                ? 'bg-cedar-900 text-surface-base inline-flex h-10 w-10 items-center justify-center font-mono text-xs tabular-nums'
                : 'text-ink-500 hover:bg-surface-raised hover:text-ink-900 inline-flex h-10 w-10 items-center justify-center font-mono text-xs tabular-nums transition-colors'
            }
          >
            {n}
          </Link>
        ),
      )}
    </nav>
  )
}
