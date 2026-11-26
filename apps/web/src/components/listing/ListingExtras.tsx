import { getTranslations } from 'next-intl/server'
import {
  formatUsd,
  type SeatingAreaKey,
  type StayFeature,
  type StayPackageUnit,
} from '@vardenia/core'
import type { Locale } from '@vardenia/i18n'
import {
  contactLinks,
  hotelFacilitiesView,
  seatingAreaViews,
  stayFactsView,
} from '../../lib/listing-public'

/**
 * What a listing says beyond its description since Tasks 2 to 8: contact
 * links, hotel facilities, a guest house's stay and features, a restaurant's
 * seating areas. One server component, mounted once on the listing page, that
 * draws each block only when its field has something in it; a listing with
 * none of them renders nothing at all.
 *
 * Plain on purpose: the page's own heading and chip styles, nothing new.
 * Prices are the owner's own, in USD (formatUsd), kept left to right inside
 * Arabic text.
 */

type Doc = {
  subcategories?: unknown
  contact?: unknown
  facilities?: unknown
  popularFacilities?: unknown
  propertyHighlights?: unknown
  stay?: unknown
  features?: unknown
  seatingAreas?: unknown
}

const HEADING = 'text-ink-500 font-mono text-[11px] uppercase tracking-[0.16em]'
const CHIP = 'border-ink-100 text-ink-700 border px-3 py-1.5 text-xs'

const FEATURE_KEY: Record<StayFeature, string> = {
  musicAllowed: 'featureMusicAllowed',
  eventsHosted: 'featureEventsHosted',
  partiesAllowed: 'featurePartiesAllowed',
  gardenAccess: 'featureGardenAccess',
  barbecue: 'featureBarbecue',
  pool: 'featurePool',
}

const UNIT_KEY: Record<StayPackageUnit, string> = {
  'per-night': 'unitPerNight',
  'per-stay': 'unitPerStay',
  'per-person-per-night': 'unitPerPersonPerNight',
}

const AREA_KEY: Record<SeatingAreaKey, string> = {
  indoor: 'areaIndoor',
  'indoor-smoking': 'areaIndoorSmoking',
  outdoor: 'areaOutdoor',
  'outdoor-smoking': 'areaOutdoorSmoking',
}

export async function ListingExtras({ listing, locale }: { listing: Doc; locale: Locale }) {
  const links = contactLinks(listing.contact)
  const facilities = hotelFacilitiesView(listing, locale)
  const stay = stayFactsView(listing)
  const areas = seatingAreaViews(listing)
  if (links.length === 0 && !facilities && !stay && areas.length === 0) return null

  const t = await getTranslations('listingExtras')
  // A price is a number and a symbol: isolated left to right so it keeps its
  // shape inside Arabic text (a bidi isolate, not markup, so it fits a message).
  const price = (value: number) => `\u2066${formatUsd(value)}\u2069`

  return (
    <div>
      {links.length > 0 ? (
        <section className="mt-12" aria-labelledby="listing-contact">
          <h2 id="listing-contact" className={HEADING}>
            {t('contactTitle')}
          </h2>
          <ul className="mt-4 flex flex-wrap gap-2">
            {links.map((link) => {
              const isSocial = !['phone', 'whatsapp', 'email'].includes(link.field)
              return (
                <li key={link.field}>
                  <a
                    href={link.href}
                    {...(link.href.startsWith('https://')
                      ? { target: '_blank', rel: 'noopener noreferrer' }
                      : {})}
                    className="border-ink-100 text-ink-900 hover:bg-surface-raised focus-visible:ring-gold-300 inline-flex min-h-[44px] items-center gap-2 border px-4 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2"
                  >
                    <span className="text-ink-500 text-xs">{t(link.field)}</span>
                    {isSocial ? null : (
                      <span dir="ltr" className="tabular-nums">
                        {link.text}
                      </span>
                    )}
                  </a>
                </li>
              )
            })}
          </ul>
        </section>
      ) : null}

      {facilities ? (
        <section className="mt-12" aria-labelledby="listing-facilities">
          {facilities.highlights.length > 0 ? (
            <div>
              <h2 id="listing-facilities" className={HEADING}>
                {t('highlightsTitle')}
              </h2>
              <ul className="mt-4 flex flex-wrap gap-2">
                {facilities.highlights.map((label) => (
                  <li key={label} className={`${CHIP} text-ink-900 font-medium`}>
                    {label}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          {facilities.popular.length > 0 ? (
            <div className={facilities.highlights.length > 0 ? 'mt-8' : undefined}>
              {facilities.highlights.length > 0 ? (
                <h3 className={HEADING}>{t('popularTitle')}</h3>
              ) : (
                <h2 id="listing-facilities" className={HEADING}>
                  {t('popularTitle')}
                </h2>
              )}
              <ul className="mt-4 flex flex-wrap gap-2">
                {facilities.popular.map((label) => (
                  <li key={label} className={CHIP}>
                    {label}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          {facilities.others.length > 0 ? (
            <div
              className={
                facilities.highlights.length + facilities.popular.length > 0 ? 'mt-8' : undefined
              }
            >
              {facilities.highlights.length + facilities.popular.length > 0 ? (
                <h3 className={HEADING}>{t('facilitiesTitle')}</h3>
              ) : (
                <h2 id="listing-facilities" className={HEADING}>
                  {t('facilitiesTitle')}
                </h2>
              )}
              <ul className="mt-4 flex flex-wrap gap-2">
                {facilities.others.map((label) => (
                  <li key={label} className={CHIP}>
                    {label}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </section>
      ) : null}

      {stay ? (
        <section className="mt-12" aria-labelledby="listing-stay">
          <h2 id="listing-stay" className={HEADING}>
            {t('stayTitle')}
          </h2>
          <ul className="text-ink-700 mt-4 space-y-1.5 text-sm">
            {stay.nightlyPrice !== null ? (
              <li className="text-ink-900 font-medium">
                {t('pricePerNight', { price: price(stay.nightlyPrice) })}
              </li>
            ) : null}
            {stay.includedGuests !== null ? (
              <li>{t('includedGuests', { count: stay.includedGuests })}</li>
            ) : null}
            {stay.extraGuestFee !== null ? (
              <li>{t('extraGuest', { price: price(stay.extraGuestFee) })}</li>
            ) : null}
            {stay.maxGuests !== null ? <li>{t('maxGuests', { count: stay.maxGuests })}</li> : null}
            {stay.minNights !== null ? <li>{t('minStay', { count: stay.minNights })}</li> : null}
            {!stay.childrenCountAsGuests ? <li>{t('childrenNotCounted')}</li> : null}
          </ul>

          {stay.packages.length > 0 ? (
            <div className="mt-8">
              <h3 className={HEADING}>{t('packagesTitle')}</h3>
              <ul className="border-ink-100 divide-ink-100 mt-4 divide-y border-y">
                {stay.packages.map((pack) => (
                  <li key={pack.id} className="py-4">
                    <p dir="auto" className="text-ink-900 text-sm font-medium">
                      {pack.label}
                    </p>
                    <p className="text-ink-700 mt-1 text-sm">
                      {t('packagePrice', {
                        price: price(pack.price),
                        unit: t(UNIT_KEY[pack.unit]),
                      })}
                    </p>
                    {pack.description ? (
                      <p dir="auto" className="text-ink-500 mt-1 text-sm">
                        {pack.description}
                      </p>
                    ) : null}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {stay.features.length > 0 ? (
            <div className="mt-8">
              <h3 className={HEADING}>{t('featuresTitle')}</h3>
              <ul className="mt-4 flex flex-wrap gap-2">
                {stay.features.map((feature) => (
                  <li key={feature} className={CHIP}>
                    {t(FEATURE_KEY[feature])}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </section>
      ) : null}

      {areas.length > 0 ? (
        <section className="mt-12" aria-labelledby="listing-seating">
          <h2 id="listing-seating" className={HEADING}>
            {t('seatingTitle')}
          </h2>
          <ul className="mt-4 flex flex-wrap gap-2">
            {areas.map((area) => (
              <li key={area.key} className={CHIP} dir="auto">
                {area.label ? `${area.label} · ` : ''}
                {t(AREA_KEY[area.key])}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  )
}
