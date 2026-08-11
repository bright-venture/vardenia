import type { Metadata } from 'next'
import Image from 'next/image'
import { notFound } from 'next/navigation'
import { setRequestLocale } from 'next-intl/server'
import { RichText } from '@payloadcms/richtext-lexical/react'
import { formatDate, isLocale, type Locale } from '@vardenia/i18n'
import { findArticleBySlug } from '../../../../../../lib/articles'
import { resolveImage } from '../../../../../../lib/media'
import { kindLabel, printCredit } from '../../../../../../lib/editorial'
import { ListingCard } from '../../../../../../components/ListingCard'

/**
 * An editorial story.
 *
 * Two things here are obligations rather than features: the paid-partnership
 * label, which must be visible on any sponsored piece, and the print credit,
 * which is how a reader who scanned a code confirms they reached the right story.
 */

interface Params {
  params: Promise<{ locale: string; slug: string }>
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { locale, slug } = await params
  if (!isLocale(locale)) return {}

  const article = await findArticleBySlug(slug, locale)
  if (!article) return {}

  const seo = (article.seo ?? {}) as { title?: string | null; description?: string | null }
  const image = resolveImage(article.heroImage as never, 'hero')

  return {
    title: seo.title || article.title,
    description: seo.description || article.excerpt || undefined,
    openGraph: {
      title: seo.title || article.title || undefined,
      description: seo.description || article.excerpt || undefined,
      images: image ? [{ url: image.src }] : undefined,
      type: 'article',
      publishedTime: article.publishedAt ?? undefined,
    },
    alternates: {
      canonical: `/magazine/articles/${slug}`,
      languages: { en: `/magazine/articles/${slug}`, ar: `/ar/magazine/articles/${slug}` },
    },
  }
}

export default async function ArticlePage({ params }: Params) {
  const { locale, slug } = await params
  if (!isLocale(locale)) notFound()
  setRequestLocale(locale)

  const article = await findArticleBySlug(slug, locale)
  if (!article) notFound()

  const ar = locale === 'ar'
  const hero = resolveImage(article.heroImage as never, 'hero')
  const credit = printCredit(article.print as never, locale)
  const sponsor = article.sponsoredBy as { name?: string | null } | null
  // At depth 3 these arrive as full documents, but Payload types them as
  // "id or document" because a shallower query would return ids. Keep only the
  // resolved ones; an unresolved id has nothing to render anyway.
  const featured = ((article.featuredBusinesses ?? []) as unknown[]).filter(
    (entry): entry is Record<string, unknown> => typeof entry === 'object' && entry !== null,
  )
  const author = article.author as { name?: string | null } | null

  return (
    <article className="pb-24">
      {hero ? (
        <div className="bg-surface-sunken relative aspect-[16/9] w-full md:aspect-[21/9]">
          <Image
            src={hero.src}
            alt={hero.alt}
            fill
            priority
            sizes="100vw"
            className="object-cover"
          />
        </div>
      ) : null}

      <div className="mx-auto max-w-3xl px-6 pt-10">
        <p className="text-gold-700 text-xs uppercase tracking-[0.2em]">
          {kindLabel(article.kind, locale as Locale)}
        </p>

        <h1 className="font-display text-ink-900 mt-3 text-4xl leading-tight md:text-5xl">
          {article.title}
        </h1>

        {article.excerpt ? <p className="text-ink-700 mt-6 text-lg">{article.excerpt}</p> : null}

        <div className="text-ink-500 border-ink-100 mt-8 flex flex-wrap gap-x-4 gap-y-1 border-t pt-4 text-sm">
          {author?.name ? <span>{ar ? `بقلم ${author.name}` : `By ${author.name}`}</span> : null}
          {article.publishedAt ? (
            <time dateTime={article.publishedAt}>
              {formatDate(new Date(article.publishedAt), locale as Locale)}
            </time>
          ) : null}
          {credit ? <span className="text-ink-300">{credit}</span> : null}
        </div>

        {/*
          Disclosure, not decoration. A sponsored feature must say so before the
          reader starts reading it, not in small print at the end.
        */}
        {article.kind === 'sponsored' ? (
          <p className="border-gold-500 bg-gold-100 text-ink-700 mt-6 border-s-2 px-4 py-3 text-sm">
            {ar
              ? `محتوى مدفوع${sponsor?.name ? ` بالتعاون مع ${sponsor.name}` : ''}.`
              : `Paid partnership${sponsor?.name ? ` with ${sponsor.name}` : ''}.`}
          </p>
        ) : null}

        {article.body ? (
          <div className="prose-vardenia mt-10">
            <RichText data={article.body as never} />
          </div>
        ) : null}
      </div>

      {featured.length > 0 ? (
        <section className="mx-auto mt-16 max-w-6xl px-6">
          <h2 className="text-ink-300 text-xs uppercase tracking-widest">
            {ar ? 'أماكن وردت في هذا المقال' : 'Places in this story'}
          </h2>
          <div className="mt-4 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {featured.map((business) => (
              <ListingCard
                key={String(business.id)}
                slug={String(business.slug ?? '')}
                name={String(business.name ?? '')}
                tagline={business.tagline as string | null}
                category={business.category as string | null}
                governorate={business.governorate as string | null}
                district={business.district as string | null}
                priceRange={business.priceRange as string | null}
                verified={business.verified as boolean | null}
                heroImage={business.heroImage as never}
                locale={locale}
              />
            ))}
          </div>
        </section>
      ) : null}
    </article>
  )
}
