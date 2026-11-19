import { Link } from '../../i18n/routing'

/** Actual Beirut opening spread, held still as a single open magazine. */
export function MagazineSpread({
  title,
  pageLabel,
  desktopIssueHref,
}: {
  title: string
  pageLabel: string
  /** Undefined keeps the existing layout. Null shows the desktop caption without a link. */
  desktopIssueHref?: string | null
}) {
  const featured = desktopIssueHref !== undefined
  const spreadTitle = featured ? 'All Lebanon' : title

  return (
    <figure className="vd-magazine-spread-frame" data-featured-spread={featured || undefined}>
      <div
        className="vd-real-magazine vd-book-stage"
        data-motion="off"
        data-phase="settled"
        dir="ltr"
        aria-label={spreadTitle}
      >
        <div className="vd-book-floor" aria-hidden="true" />
        <div className="vd-book-float">
          <div className="vd-book-object">
            <div className="vd-book-pages" aria-label={`${spreadTitle} · ${pageLabel} 4–5`}>
              {[4, 5].map((number) => (
                <img
                  key={number}
                  src={`/journey/magazine-pages/all-lebanon-${String(number).padStart(3, '0')}.webp`}
                  width={1057}
                  height={1500}
                  alt={`${spreadTitle} · ${pageLabel} ${number}`}
                  loading="lazy"
                  decoding="async"
                />
              ))}
              <span className="vd-book-gutter" aria-hidden="true" />
            </div>
          </div>
        </div>
      </div>
      {featured ? (
        <figcaption className="vd-magazine-spread-caption">
          {desktopIssueHref ? (
            <Link
              href={desktopIssueHref}
              aria-label="Open the All Lebanon issue, Beirut, pages 4–5"
              className="vd-magazine-spread-link"
            >
              Beirut, pages 4–5
            </Link>
          ) : (
            'Beirut, pages 4–5'
          )}
        </figcaption>
      ) : null}
    </figure>
  )
}
