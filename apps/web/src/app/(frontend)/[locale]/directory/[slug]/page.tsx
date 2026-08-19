import type { Metadata } from 'next'
import Image from 'next/image'
import { notFound } from 'next/navigation'
import { getTranslations, setRequestLocale } from 'next-intl/server'
import { RichText } from '@payloadcms/richtext-lexical/react'
import { can, tierOf } from '@vardenia/core'
import { LOCALES, isLocale, type Locale } from '@vardenia/i18n'
import { findListingBySlug, findAllListingSlugs } from '../../../../../lib/listings'
import { resolveGallery, resolveImage } from '../../../../../lib/media'
import { buildMetadata } from '../../../../../lib/seo'
import { listingSchema } from '../../../../../lib/structured-data'
import { JsonLd } from '../../../../../components/JsonLd'
import {
  amenityLabel,
  categoryLabel,
  placeLabel,
  priceLabel,
  subcategoryLabel,
} from '../../../../../lib/labels'
import { isOpenNow } from '../../../../../lib/hours'
import { ActionBar } from '../../../../../components/ActionBar'
import { BookingPanel } from '../../../../../components/BookingPanel'
import { OpeningHoursTable } from '../../../../../components/OpeningHoursTable'

/**
 * The listing page. Every printed QR code in the magazine lands here, which
 * makes it the highest-consequence page in the product: if it is slow, ugly or
 * broken, that is what the reader associates with the brand and with the
 * advertiser who paid for the placement.
 */

// Cached for 60s and regenerated in the background. See magazine/page.tsx.
export const revalidate = 60

interface Params {
  params: Promise<{ locale: string; slug: string }>
}

/**
 * Prerender every known slug, at both locales.
 *
 * Without this the route has no static params, so Next serves it fully dynamic:
 * the response carried "Cache-Control: no-store" and every single request paid
 * for the database round trips. With it, pages are built once and then served
 * from cache, refreshed by the revalidate window above.
 *
 * `dynamicParams` stays at its default of true, so a slug created after the
 * build still renders on demand rather than 404ing - it just misses the cache
 * the first time.
 */
export async function generateStaticParams() {
  const slugs = await findAllListingSlugs()
  return LOCALES.flatMap((locale) => slugs.map((slug) => ({ locale, slug })))
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { locale, slug } = await params
  if (!isLocale(locale)) return {}

  const listing = await findListingBySlug(slug, locale)
  if (!listing) return {}

  return buildMetadata({
    seo: listing.seo,
    title: listing.name,
    description: listing.tagline,
    fallbackImage: listing.heroImage as never,
    path: `/directory/${slug}`,
    locale,
  })
}

export default async function ListingPage({ params }: Params) {
  const { locale, slug } = await params
  if (!isLocale(locale)) notFound()
  setRequestLocale(locale)

  const listing = await findListingBySlug(slug, locale)
  if (!listing) notFound()

  const t = await getTranslations('directory')
  const hero = resolveImage(listing.heroImage as never, 'hero')
  // Gallery size is what a listing tier actually buys. TIER_CAPABILITIES has
  // described this since the beginning and nothing read it, so every listing -
  // including free ones - showed all 40 images a partner pays for.
  const gallery = resolveGallery(
    listing.gallery as never,
    can(tierOf(listing.tier), 'galleryLimit'),
  )
  const place = placeLabel(listing.governorate, listing.district, locale as Locale)
  const price = priceLabel(listing.priceRange as string | null)
  const open = isOpenNow(listing.openingHours as never)

  const point = Array.isArray(listing.location) ? (listing.location as [number, number]) : null

  return (
    <article className="pb-24">
      {/* Invisible to readers, read by search engines. See lib/structured-data. */}
      <JsonLd data={listingSchema(listing as never, locale as Locale)} />

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

      <div className="mx-auto grid max-w-6xl gap-12 px-6 pt-10 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div>
          <p className="text-gold-700 text-xs uppercase tracking-[0.2em]">
            {categoryLabel(listing.category, locale as Locale)}
          </p>

          <h1 className="font-display text-ink-900 mt-3 text-4xl leading-tight md:text-5xl">
            {listing.name}
          </h1>

          <div className="text-ink-500 mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
            <span>{place}</span>
            {price ? <span className="tabular-nums">{price}</span> : null}
            {listing.verified ? <span className="text-cedar-700">{t('verified')}</span> : null}
            {open !== null ? (
              <span className={open ? 'text-cedar-700' : 'text-ink-300'}>
                {open ? t('openNow') : locale === 'ar' ? 'مغلق الآن' : 'Closed now'}
              </span>
            ) : null}
          </div>

          {listing.tagline ? (
            <p className="text-ink-700 mt-6 max-w-2xl text-lg">{listing.tagline}</p>
          ) : null}

          <div className="mt-8">
            <ActionBar name={listing.name ?? ''} coordinates={point} />
          </div>

          {listing.description ? (
            <div className="prose-vardenia mt-12 max-w-2xl">
              <RichText data={listing.description as never} />
            </div>
          ) : null}

          {gallery.length > 0 ? (
            <section className="mt-14">
              <h2 className="text-ink-300 text-xs uppercase tracking-widest">
                {locale === 'ar' ? 'الصور' : 'Gallery'}
              </h2>
              <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-3">
                {gallery.map((image) => (
                  <div
                    key={image.src}
                    className="bg-surface-sunken relative aspect-[4/3] overflow-hidden rounded-md"
                  >
                    <Image
                      src={image.src}
                      alt={image.alt}
                      fill
                      sizes="(max-width: 768px) 50vw, 33vw"
                      className="object-cover"
                    />
                  </div>
                ))}
              </div>
            </section>
          ) : null}

          {/* Below the description rather than in the sidebar. A reader arriving
              from a printed QR code has not decided to book yet - they are
              finding out what the place is - and a form above that decision is
              an interruption. Renders nothing at all for a listing that does not
              take bookings, which is most of them. */}
          <BookingPanel
            businessId={listing.id}
            rules={listing.booking as never}
            locale={locale as Locale}
          />
        </div>

        <aside className="flex flex-col gap-10">
          {listing.address ? (
            <section>
              <h2 className="text-ink-300 text-xs uppercase tracking-widest">
                {locale === 'ar' ? 'العنوان' : 'Address'}
              </h2>
              <p className="text-ink-700 mt-3 whitespace-pre-line text-sm">{listing.address}</p>
              {point ? (
                <a
                  className="text-gold-700 mt-3 inline-block text-sm underline underline-offset-4"
                  href={`https://www.google.com/maps/search/?api=1&query=${point[1]},${point[0]}`}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {t('viewOnMap')}
                </a>
              ) : null}
            </section>
          ) : null}

          {Array.isArray(listing.openingHours) && listing.openingHours.length > 0 ? (
            <section>
              <h2 className="text-ink-300 text-xs uppercase tracking-widest">
                {locale === 'ar' ? 'ساعات العمل' : 'Opening hours'}
              </h2>
              <div className="mt-3">
                <OpeningHoursTable
                  hours={listing.openingHours as never}
                  locale={locale as Locale}
                />
              </div>
            </section>
          ) : null}

          {Array.isArray(listing.amenities) && listing.amenities.length > 0 ? (
            <section>
              <h2 className="text-ink-300 text-xs uppercase tracking-widest">
                {locale === 'ar' ? 'المرافق' : 'Amenities'}
              </h2>
              <ul className="mt-3 flex flex-wrap gap-2">
                {(listing.amenities as string[]).map((amenity) => (
                  <li
                    key={amenity}
                    className="border-ink-100 text-ink-700 rounded-full border px-3 py-1 text-xs"
                  >
                    {amenityLabel(amenity, locale as Locale)}
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {Array.isArray(listing.subcategories) && listing.subcategories.length > 0 ? (
            <section>
              <h2 className="text-ink-300 text-xs uppercase tracking-widest">
                {locale === 'ar' ? 'التصنيف' : 'Type'}
              </h2>
              <ul className="text-ink-700 mt-3 flex flex-wrap gap-2 text-sm">
                {(listing.subcategories as string[]).map((sub) => (
                  <li key={sub}>{subcategoryLabel(sub, locale as Locale)}</li>
                ))}
              </ul>
            </section>
          ) : null}
        </aside>
      </div>
    </article>
  )
}
