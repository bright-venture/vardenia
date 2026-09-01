import { formatDate, type Locale } from '@vardenia/i18n'
import { Link } from '../i18n/routing'
import type { MediaField } from '../lib/media'
import { kindLabel } from '../lib/editorial'
import { Plate } from './ui'

interface Props {
  slug: string
  title: string
  excerpt?: string | null
  kind?: string | null
  publishedAt?: string | null
  heroImage?: MediaField
  locale: Locale
  /** Shown instead of the date inside an issue's table of contents. */
  pageLabel?: string | null
  /** Set on the first card above the fold so its image preloads. */
  priority?: boolean
}

export function ArticleCard({
  slug,
  title,
  excerpt,
  kind,
  publishedAt,
  heroImage,
  locale,
  pageLabel,
  priority = false,
}: Props) {
  return (
    <article className="group">
      <Link href={`/magazine/articles/${slug}`} className="block">
        {/* An article's picture is 3:2, where a listing's is 4:3. Editorial
            photography is shot landscape and the extra width is the point;
            cropping it to a listing's shape would waste it. */}
        <Plate
          image={heroImage}
          ratio="hero"
          interactive
          priority={priority}
          sizes="(max-width: 768px) 100vw, 33vw"
          className="rounded-lg"
        />

        <p className="text-ink-500 mt-4 font-mono text-[10px] uppercase tracking-[0.12em]">
          {kindLabel(kind, locale)}
        </p>
        {/* Editorial fields, so `dir="auto"` for the same reason as the listing
            card: an article with no Arabic version yet falls back to English. */}
        <h3
          dir="auto"
          className="text-ink-900 group-hover:text-gold-700 mt-1 text-2xl leading-snug transition-colors"
        >
          {title}
        </h3>
        {excerpt ? (
          <p dir="auto" className="text-ink-500 mt-2 line-clamp-3 text-sm leading-relaxed">
            {excerpt}
          </p>
        ) : null}

        {pageLabel ? (
          <p className="text-ink-500 mt-2 font-mono text-xs tabular-nums">{pageLabel}</p>
        ) : publishedAt ? (
          <time className="text-ink-500 mt-2 block text-xs" dateTime={publishedAt}>
            {formatDate(new Date(publishedAt), locale)}
          </time>
        ) : null}
      </Link>
    </article>
  )
}
