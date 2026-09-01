import { Suspense, type ReactNode } from 'react'
import type { Metadata } from 'next'
import Image from 'next/image'
import { notFound } from 'next/navigation'
import { getTranslations, setRequestLocale } from 'next-intl/server'
import { RichText } from '@payloadcms/richtext-lexical/react'
import { can, tierOf } from '@vardenia/core'
import { LOCALES, isLocale, type Locale } from '@vardenia/i18n'
import {
  findListingBySlug,
  findAllListingSlugs,
  findRelatedListings,
} from '../../../../../lib/listings'
import { resolveGallery, resolvePhotograph } from '../../../../../lib/media'
import { buildMetadata } from '../../../../../lib/seo'
import { listingSchema } from '../../../../../lib/structured-data'
import { resolveRules, type BookingRules } from '../../../../../lib/availability'
import { JsonLd } from '../../../../../components/JsonLd'
import {
  amenityLabel,
  categoryLabel,
  placeLabel,
  priceLabel,
  subcategoryLabel,
} from '../../../../../lib/labels'
import { isOpenNow } from '../../../../../lib/hours'
import { Link } from '../../../../../i18n/routing'
import { ActionBar } from '../../../../../components/ActionBar'
import { BookingPanel } from '../../../../../components/BookingPanel'
import { OpeningHoursTable } from '../../../../../components/OpeningHoursTable'
import { ListingGrid } from '../../../../../components/ListingGrid'
import { ScanArrival } from '../../../../../components/ScanArrival'
import { Eyebrow, Stars } from '../../../../../components/ui'

/**
 * The listing page. Every printed QR code in the magazine lands here, which
 * makes it the highest-consequence page in the product: if it is slow, ugly or
 * broken, that is what the reader associates with the brand and with the
 * advertiser who paid for the placement.
 *
 * # Why it opens on a photograph with the name on it
 *
 * The commissioned design puts the title over a full-height picture rather than
 * under a banner, and for this page in particular that is worth more than it
 * looks. A reader who scanned a code in a hotel lobby has never seen the site
 * before, has no idea what Vardenia is, and gave up on us at the first screen or
 * not at all. A name set large over the place itself says what this is without a
 * sentence of explanation.
 *
 * It has to work with no photograph too, and today most of the catalogue has
 * none - see `Masthead` below.
 *
 * # The QR arrival notice, and why it is a client component
 *
 * The design shows a gold notice for readers arriving from a scan, keyed off
 * `?via=qr`. It is built - see components/ScanArrival - and the constraint that
 * shaped it is worth keeping written down: reading `searchParams` here would
 * make the route dynamic and undo `generateStaticParams` below, so the most
 * important page in the product would pay two database round trips per view.
 * The parameter is read in the browser instead, inside a Suspense boundary, and
 * the page stays prerendered. `/g/[code]` puts it there; see lib/qr-destination.
 */

// Cached for an hour and regenerated in the background. See magazine/page.tsx.
export const revalidate = 3600

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

  const ar = locale === 'ar'
  const t = await getTranslations('directory')
  /**
   * A real photograph, or nothing.
   *
   * `resolvePhotograph` rather than `resolveImage`, and the difference decides
   * what this page looks like for most of the catalogue. Every imported listing
   * points at one shared stand-in image, so a hero that simply rendered
   * `heroImage` would open 308 different places on the same picture at full
   * bleed - which is a worse lie the larger you draw it. Without one, the
   * masthead falls back to the flat navy ground and shortens. See lib/media.
   */
  const hero = resolvePhotograph(listing.heroImage as never, 'hero')
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

  /**
   * The Google rating, if somebody has looked it up.
   *
   * Read straight off the listing rather than fetched, because it is one number
   * on the business and not a collection of reviews. It is deliberately absent
   * from the structured data below - see lib/structured-data.
   */
  const googleRating = typeof listing.googleRating === 'number' ? listing.googleRating : null

  /**
   * Whether there is anything to put beside the description.
   *
   * `resolveRules` rather than `listing.booking?.enabled`, because that function
   * is where "missing means off" is decided and BookingPanel asks it the same
   * question. Calling the same helper is not a second opinion; reimplementing
   * the check here would be.
   *
   * It decides the shape of the page, not just its contents. Declaring a 360px
   * sidebar and then rendering nothing into it would narrow the main column on
   * every listing that does not take bookings - which is most of them - in
   * exchange for a column of white space.
   */
  const bookable = resolveRules(listing.booking as BookingRules | null).enabled

  const subcategories = Array.isArray(listing.subcategories)
    ? (listing.subcategories as string[])
    : []
  const amenities = Array.isArray(listing.amenities) ? (listing.amenities as string[]) : []
  const hours = Array.isArray(listing.openingHours) ? listing.openingHours : []

  /** Whether the ruled fact table has any rows, and whether it exists at all. */
  const hasRows = Boolean(listing.address) || subcategories.length > 0 || Boolean(price)
  const hasFacts = hasRows || hours.length > 0

  const related = await findRelatedListings({
    locale,
    slug,
    category: listing.category,
    governorate: listing.governorate,
  })

  return (
    <article>
      {/* Invisible to readers, read by search engines. See lib/structured-data. */}
      <JsonLd data={listingSchema(listing as never, locale as Locale)} />

      <header className="bg-cedar-900 relative isolate flex flex-col justify-end overflow-hidden">
        {/*
          `alt=""` and aria-hidden together: this is the ground the name sits on
          rather than content, and a description of it read out before the
          heading tells a screen reader nothing it needs. `priority` because it
          is the whole first screen.

          The navy stays declared on the element above, so a listing with no
          photograph - most of them, today - gets a flat brand ground rather
          than ivory type on white. That is the difference between a page that
          looks unfinished and one that looks plain.
        */}
        {hero ? (
          <>
            <Image
              src={hero.src}
              alt=""
              aria-hidden
              fill
              priority
              sizes="100vw"
              className="-z-10 object-cover"
            />
            <div
              aria-hidden
              className="from-cedar-900 via-cedar-900/70 to-cedar-900/30 absolute inset-0 -z-10 bg-gradient-to-t"
            />
          </>
        ) : null}

        {/*
          Shorter without a photograph. 70svh of empty navy is a wall between
          the reader and the listing; the same block at 40 reads as a masthead.
        */}
        <div
          className={`mx-auto flex w-full max-w-6xl flex-col justify-end px-6 ${
            hero ? 'min-h-[70svh] pb-12 pt-24 sm:pb-16' : 'pb-12 pt-14'
          }`}
        >
          {/*
            Back to the directory, above the name.

            A reader who arrived from a printed code has no history to go back
            through - the scan is the first page in the tab - so the browser's
            own back button does nothing for them. This is the only way off the
            page other than the suggestions at the foot.
          */}
          <Link
            href="/directory"
            className="text-cedar-100/70 hover:text-surface-base mb-8 inline-flex w-fit items-center gap-2 font-mono text-[11px] uppercase tracking-[0.16em] transition-colors"
          >
            <span aria-hidden className="rtl:-scale-x-100">
              &larr;
            </span>
            {ar ? 'الدليل' : 'Directory'}
          </Link>

          {/*
            The one moment the paper and the site meet.

            Wrapped in Suspense because it reads the query string on the client:
            in a statically rendered route Next requires that, renders the
            fallback into the prerendered HTML and fills it in afterwards, which
            is what lets this page stay cached. `null` as the fallback, so a
            reader who did not scan anything never sees a placeholder.
          */}
          <Suspense fallback={null}>
            <ScanArrival />
          </Suspense>

          <Eyebrow inverse>
            {[categoryLabel(listing.category, locale as Locale), place].filter(Boolean).join(' · ')}
          </Eyebrow>

          {/* `dir="auto"` rather than a fixed direction, on every field that
              holds text somebody typed into the admin.

              Payload falls back to English when a listing has no Arabic yet, and
              today none of them do - so the Arabic page shows English text in an
              RTL paragraph, which moves its full stop to the left edge. A fixed
              `ltr` would fix that and then break the day the field is actually
              translated. `auto` asks the browser to decide per field from the
              first strong character, which is right in both states and during
              the long middle where some listings are translated and some are
              not. */}
          <h1
            dir="auto"
            className="text-surface-base mt-4 text-[clamp(2.5rem,7vw,5rem)] leading-[1.02]"
          >
            {listing.name}
          </h1>

          <div className="text-cedar-100/80 mt-6 flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
            {price ? <span className="font-mono tabular-nums">{price}</span> : null}

            {/* Labelled as Google by the component itself. This is not our
                verdict on the place and must never read as one. */}
            {googleRating !== null ? (
              <Stars
                rating={googleRating}
                count={
                  typeof listing.googleRatingCount === 'number'
                    ? listing.googleRatingCount
                    : undefined
                }
                locale={locale as Locale}
                inverse
              />
            ) : null}

            {/*
              A dot and a word, per the design. `state.success` rather than a
              brand colour: "open" is a status, and it should stay green if the
              brand ever stops being - the brand ground is navy now.

              The dot is aria-hidden because the word beside it already says
              it. Colour is never the only signal here.
            */}
            {open !== null ? (
              <span className="inline-flex items-center gap-2">
                <span
                  aria-hidden
                  className={`h-1.5 w-1.5 rounded-full ${
                    open ? 'bg-state-success' : 'bg-cedar-100/50'
                  }`}
                />
                {open ? t('openNow') : ar ? 'مغلق الآن' : 'Closed now'}
              </span>
            ) : null}

            {/*
              The word, not the badge component.

              ui/Tier paints itself `bg-cedar-900` so it reads as a mark on a
              photograph in a grid - which on this navy ground would be a navy
              badge on navy. The badge exists because a card is 150px wide and
              has to abbreviate; there is room here for the full phrase, and
              "Verified by Vardenia" says who verified it, which is the part
              that matters and the part the short badge has to put in an
              aria-label to keep.
            */}
            {listing.verified ? (
              <span className="text-gold-300 font-medium">{t('verified')}</span>
            ) : null}
          </div>
        </div>
      </header>

      <div
        className={`mx-auto grid max-w-6xl gap-14 px-6 py-14 sm:py-20 ${
          bookable ? 'lg:grid-cols-[minmax(0,1fr)_360px] lg:gap-20' : ''
        }`}
      >
        <div className={bookable ? 'min-w-0' : 'min-w-0 max-w-3xl'}>
          {/*
            The tagline set as display type, which is the design's call and a
            good one: it is one line saying what the place is, and at body size
            it reads as a caption nobody stops for. It is also the only prose
            most listings have.
          */}
          {listing.tagline ? (
            <p dir="auto" className="font-display text-ink-700 text-2xl leading-snug lg:text-3xl">
              {listing.tagline}
            </p>
          ) : null}

          <div className={listing.tagline ? 'mt-10' : ''}>
            <ActionBar name={listing.name ?? ''} coordinates={point} />
          </div>

          {/*
            The facts, as a ruled table rather than a sidebar.

            Address and hours are what somebody standing outside the place needs,
            and in the old layout they were in a right-hand column that falls
            below the entire description on a phone. A reader on the pavement had
            to scroll past everything to find the address. Hairline rows put them
            directly under the name instead, which is also how a listing reads in
            print.
          */}
          {/*
            The rule at the top belongs to the block, not to the first row, so
            it is only drawn when there is something under it. A listing with no
            address, type or price - and there are some - would otherwise get a
            stray line across the page.
          */}
          <div className={hasFacts ? 'border-ink-100 mt-12 border-t' : undefined}>
            {hasRows ? (
              <dl>
                {listing.address ? (
                  <Row label={ar ? 'العنوان' : 'Address'}>
                    <p className="whitespace-pre-line">{listing.address}</p>
                    {point ? (
                      <a
                        className="text-gold-700 hover:text-ink-900 mt-2 inline-block underline underline-offset-4"
                        href={`https://www.google.com/maps/search/?api=1&query=${point[1]},${point[0]}`}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        {t('viewOnMap')}
                      </a>
                    ) : null}
                  </Row>
                ) : null}

                {subcategories.length > 0 ? (
                  <Row label={ar ? 'التصنيف' : 'Type'}>
                    {subcategories
                      .map((sub) => subcategoryLabel(sub, locale as Locale))
                      .join(' · ')}
                  </Row>
                ) : null}

                {price ? (
                  <Row label={ar ? 'السعر' : 'Price'}>
                    <span className="font-mono tabular-nums">{price}</span>
                  </Row>
                ) : null}
              </dl>
            ) : null}

            {/*
            Hours, as a disclosure, and outside the list above rather than in it.

            Two reasons, and the second is the one that decided it. It costs no
            JavaScript because it is a `<details>` - the design's version is
            React state, which would make this the only client component on an
            otherwise static page for the sake of one toggle. And a `<details>`
            cannot go inside a `<dl>`: the list may only hold `dt`/`dd` pairs, or
            `div`s that hold them. Rendered as a sibling it looks like another
            row and is valid markup, which the alternative was not.

            Collapsed because seven rows of times is the largest block on the
            page, and the urgent half of the question - open or not - is already
            answered beside the name.
          */}
            {hours.length > 0 ? (
              <details className="border-ink-100 group border-b py-5">
                <summary className="flex cursor-pointer list-none items-center gap-4 sm:grid sm:grid-cols-[180px_1fr]">
                  <span className="text-ink-500 font-mono text-[11px] uppercase tracking-[0.16em]">
                    {ar ? 'ساعات العمل' : 'Opening hours'}
                  </span>
                  <span className="text-ink-700 ms-auto text-sm sm:ms-0">
                    {ar ? 'عرض الأسبوع' : 'Show the week'}
                    <span
                      aria-hidden
                      className="text-ink-500 ms-2 inline-block transition-transform group-open:rotate-180"
                    >
                      &#9662;
                    </span>
                  </span>
                </summary>
                <div className="mt-4 sm:ps-[180px]">
                  <OpeningHoursTable
                    hours={listing.openingHours as never}
                    locale={locale as Locale}
                  />
                </div>
              </details>
            ) : null}
          </div>

          {/*
            Square chips, matching every other control on the site since the
            2026 design. They are a list because that is what they are - a
            screen reader saying "list, 6 items" before reading them is how
            somebody knows how long it is.
          */}
          {amenities.length > 0 ? (
            <ul className="mt-10 flex flex-wrap gap-2">
              {amenities.map((amenity) => (
                <li
                  key={amenity}
                  className="border-ink-100 text-ink-700 border px-3 py-1.5 text-xs"
                >
                  {amenityLabel(amenity, locale as Locale)}
                </li>
              ))}
            </ul>
          ) : null}

          {listing.description ? (
            <div dir="auto" className="prose-vardenia mt-14 max-w-2xl">
              <RichText data={listing.description as never} />
            </div>
          ) : null}

          {gallery.length > 0 ? (
            <section className="mt-16">
              <h2 className="text-ink-500 font-mono text-[11px] uppercase tracking-[0.16em]">
                {ar ? 'الصور' : 'Gallery'}
              </h2>
              <div className="mt-5 grid grid-cols-2 gap-3 md:grid-cols-3">
                {gallery.map((image) => (
                  <div key={image.src} className="bg-surface-sunken relative aspect-[4/3]">
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
        </div>

        {/*
          Rendered once, and in the sidebar.

          The first version of this rendered it twice - once here, once higher up
          with `lg:hidden` - so that a phone would meet the form before the
          gallery. That emits `id="book"` twice, which is invalid and quietly
          breaks the `#book` anchor the booking flow links back to. One copy, in
          the aside.

          On a phone the grid collapses and this lands at the foot of the page,
          which is where it already sat before this redesign and is the right
          place anyway: a reader who arrived from a printed code has not decided
          to book yet - they are finding out what the place is - and a form above
          that decision is an interruption. On a wide screen it is beside the
          description rather than under it, so it interrupts nothing and can
          follow the reader down.
        */}
        {bookable ? (
          <aside>
            <div className="lg:sticky lg:top-10">
              <BookingPanel
                businessId={listing.id}
                rules={listing.booking as never}
                locale={locale as Locale}
              />
            </div>
          </aside>
        ) : null}
      </div>

      {/*
        Somewhere to go next.

        This is the only page on the site most readers will ever see - they
        scanned a code, they landed here, and the browser has no history to go
        back through. Three more places is the difference between a visit of one
        page and a visit of two.
      */}
      {related.length > 0 ? (
        <section className="bg-surface-raised border-ink-100 border-t">
          <div className="mx-auto max-w-6xl px-6 py-16 sm:py-20">
            <Eyebrow>{ar ? 'قريب من هنا' : 'Nearby'}</Eyebrow>
            <h2 className="text-ink-900 mt-3 text-3xl sm:text-4xl">
              {ar ? 'أماكن مشابهة' : 'More like this'}
            </h2>
            <div className="mt-10">
              <ListingGrid
                listings={related}
                locale={locale}
                kind="related"
                empty={t('resultCount', { count: 0 })}
              />
            </div>
          </div>
        </section>
      ) : null}

      {/*
        The one line that explains Vardenia to somebody who arrived by scanning
        a code and has read nothing else. Navy, because it is the brand
        speaking rather than the listing.
      */}
      <section className="bg-cedar-900">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-8 px-6 py-12">
          <p className="text-surface-base font-display max-w-xl text-xl leading-snug">
            {ar
              ? 'فنادق ومطاعم وتجارب مختارة في لبنان، في المجلة وعلى الإنترنت.'
              : 'Curated hotels, restaurants and experiences across Lebanon, in print and online.'}
          </p>
          {/*
            Gold outline on navy. The kit's ButtonLink has no variant for this -
            its outline is an ink hairline meant for the ivory ground, and would
            all but vanish here. Worth a variant when a second one appears; not
            worth widening the kit for one button.
          */}
          <Link
            href="/directory"
            className="border-gold-300 text-gold-300 hover:bg-gold-300 hover:text-cedar-900 inline-flex h-12 items-center border px-6 text-sm font-semibold transition-colors"
          >
            {ar ? 'تصفّح الدليل' : 'Browse the directory'}
          </Link>
        </div>
      </section>
    </article>
  )
}

/**
 * One line of the spec table.
 *
 * A fixed label column on anything wider than a phone, so the values line up
 * and the table reads as a table. Below that the label sits above its value,
 * because 180px of label at 375px leaves 150px for an address.
 */
function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="border-ink-100 grid gap-1 border-b py-5 sm:grid-cols-[180px_1fr] sm:gap-4">
      <dt className="text-ink-500 font-mono text-[11px] uppercase tracking-[0.16em]">{label}</dt>
      <dd className="text-ink-700 text-sm leading-relaxed">{children}</dd>
    </div>
  )
}
