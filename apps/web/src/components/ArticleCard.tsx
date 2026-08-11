import Image from 'next/image'
import { formatDate, type Locale } from '@vardenia/i18n'
import { Link } from '../i18n/routing'
import { resolveImage, type MediaField } from '../lib/media'
import { kindLabel } from '../lib/editorial'

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
}: Props) {
  const image = resolveImage(heroImage, 'card')

  return (
    <article className="group">
      <Link href={`/magazine/articles/${slug}`} className="block">
        <div className="bg-surface-sunken relative aspect-[3/2] overflow-hidden rounded-lg">
          {image ? (
            <Image
              src={image.src}
              alt={image.alt}
              fill
              sizes="(max-width: 768px) 100vw, 33vw"
              className="object-cover transition-transform duration-500 group-hover:scale-105"
            />
          ) : null}
        </div>

        <p className="text-ink-300 mt-4 text-xs uppercase tracking-widest">
          {kindLabel(kind, locale)}
        </p>
        <h3 className="font-display text-ink-900 mt-1 text-2xl leading-snug">{title}</h3>
        {excerpt ? <p className="text-ink-500 mt-2 line-clamp-3 text-sm">{excerpt}</p> : null}

        {pageLabel ? (
          <p className="text-ink-300 mt-2 text-xs tabular-nums">{pageLabel}</p>
        ) : publishedAt ? (
          <time className="text-ink-300 mt-2 block text-xs" dateTime={publishedAt}>
            {formatDate(new Date(publishedAt), locale)}
          </time>
        ) : null}
      </Link>
    </article>
  )
}
