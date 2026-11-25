import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getTranslations, setRequestLocale } from 'next-intl/server'
import { DEFAULT_LOCALE, LOCALE_META, dataLocale, dirFor, isLocale } from '@vardenia/i18n'
import { Link } from '../../../../../../../i18n/routing'
import { currentOwner, ownerListings } from '../../../../../../../lib/session'
import { ownerEditableListings } from '../../../../../../../lib/partner-listing-details'
import { LINK } from '../../../../../../../components/formStyles'
import { ListingDetailsForm } from '../../../../../../../components/partner/ListingDetailsForm'

/**
 * Where a partner edits what their listing says (Task 12a, 21 November 2026),
 * at /partner/listing/details, under the Listing tab (which stays lit here)
 * and reached from the listing page's "Edit listing details" link.
 *
 * The words, contact details, address and map link, amenities and payments,
 * and per kind of place the hotel facilities, the guest house's stay prices
 * and features, or the restaurant's seating areas.
 *
 * Read on the server with access overridden but limited to the partner's own
 * listings (lib/partner-listing-details); written from the browser through
 * Payload's REST update on `businesses`, where access and
 * hooks/guardPartnerListingWrite check the listing and every key again. One
 * section per listing, stacked, as the rest of the dashboard does.
 */

export const dynamic = 'force-dynamic'

interface Props {
  params: Promise<{ locale: string }>
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params
  const t = await getTranslations({ locale, namespace: 'partnerDetails' })
  return { title: t('title'), robots: { index: false, follow: false } }
}

export default async function PartnerDetailsPage({ params }: Props) {
  const { locale } = await params
  if (!isLocale(locale)) notFound()
  setRequestLocale(locale)

  const owner = await currentOwner()
  if (!owner) notFound()

  const t = await getTranslations('partnerDetails')
  const [listings, names] = await Promise.all([ownerEditableListings(locale), ownerListings()])
  const offDefault = dataLocale(locale) !== DEFAULT_LOCALE
  // The name in this language may be empty; the dashboard's own name is not.
  const nameOf = (id: number, local: string) =>
    local || names.find((listing) => listing.id === id)?.name || ''

  return (
    <section className="vd-partner-tools mt-10">
      <p className="text-sm">
        <Link href="/partner/listing" className={LINK}>
          {t('backToListing')}
        </Link>
      </p>
      <h2 className="font-display text-ink-900 mt-4 text-2xl">{t('title')}</h2>
      <p className="text-ink-500 mt-2 text-sm">{t('intro')}</p>
      <p className="text-ink-500 mt-1 text-sm">
        {t('editingLanguage', { language: LOCALE_META[locale].nativeLabel })}
      </p>

      {listings.length === 0 ? (
        <p className="text-ink-500 mt-6 text-sm">{t('none')}</p>
      ) : (
        listings.map((listing) => (
          <ListingDetailsForm
            key={listing.id}
            locale={locale}
            dir={dirFor(locale)}
            showName={listings.length > 1}
            listing={{
              id: listing.id,
              name: nameOf(listing.id, listing.name),
              kinds: listing.kinds,
              descriptionEditable: listing.descriptionEditable,
              // Off the default language, the name goes with every change
              // (lib/partner-listing-edit PatchOptions).
              requiredName: offDefault
                ? listing.requiredName || nameOf(listing.id, listing.name) || null
                : null,
              initial: listing.initial,
            }}
          />
        ))
      )}
    </section>
  )
}
