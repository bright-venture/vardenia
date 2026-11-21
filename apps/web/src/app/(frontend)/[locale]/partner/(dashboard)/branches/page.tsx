import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getTranslations, setRequestLocale } from 'next-intl/server'
import { MAX_BRANCHES_PER_BRAND, MAX_NEW_BRANCHES_PER_DAY } from '@vardenia/core'
import { isLocale } from '@vardenia/i18n'
import { currentOwner, ownerBrandGroups } from '../../../../../../lib/session'
import { ownerEditableListings } from '../../../../../../lib/partner-listing-details'
import { BranchForm } from '../../../../../../components/partner/BranchForm'

/**
 * Where a partner sees their restaurants by brand and adds a branch (Task 12a,
 * 21 November 2026), through `POST /partner-data/branches` (Task 9). The
 * branch is created as a draft; the team reviews and publishes it.
 *
 * Restaurants only: a partner with none gets a sentence saying so (the tab
 * is not offered to them either, but the address still answers).
 */

export const dynamic = 'force-dynamic'

interface Props {
  params: Promise<{ locale: string }>
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params
  const t = await getTranslations({ locale, namespace: 'partnerBranches' })
  return { title: t('title'), robots: { index: false, follow: false } }
}

export default async function PartnerBranchesPage({ params }: Props) {
  const { locale } = await params
  if (!isLocale(locale)) notFound()
  setRequestLocale(locale)

  const owner = await currentOwner()
  if (!owner) notFound()

  const t = await getTranslations('partnerBranches')
  const [groups, editable] = await Promise.all([
    ownerBrandGroups(locale),
    ownerEditableListings(locale),
  ])
  const restaurantIds = new Set(editable.filter((l) => l.restaurant).map((l) => l.id))
  const sources = groups
    .flatMap((group) => group.listings)
    .filter((listing) => restaurantIds.has(listing.id))
    .map((listing) => ({ id: listing.id, name: listing.name }))

  return (
    <section className="mt-10">
      <h2 className="font-display text-ink-900 text-2xl">{t('title')}</h2>

      {sources.length === 0 ? (
        <p className="border-ink-100 text-ink-700 mt-4 border-s-2 ps-4 text-sm">
          {t('onlyRestaurants')}
        </p>
      ) : (
        <>
          <p className="text-ink-500 mt-2 text-sm">{t('intro')}</p>

          <section className="mt-8" aria-labelledby="your-listings">
            <h3
              id="your-listings"
              className="text-ink-500 font-mono text-[11px] uppercase tracking-[0.14em]"
            >
              {t('yourListings')}
            </h3>
            {groups.map((group) => (
              <div key={group.brand?.id ?? 'none'} className="mt-4">
                <p className="text-ink-900 text-sm font-semibold">
                  {group.brand?.name || t('noBrand')}
                </p>
                <ul className="border-ink-100 mt-2 divide-y border">
                  {group.listings.map((listing) => (
                    <li
                      key={listing.id}
                      className="text-ink-900 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 px-4 py-3 text-sm"
                    >
                      <span dir="auto" className="min-w-0">
                        {listing.name}
                      </span>
                      {listing.published ? null : (
                        <span className="text-ink-500 text-xs">{t('notPublished')}</span>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </section>

          <section className="border-ink-100 mt-10 border-t pt-8" aria-labelledby="add-branch">
            <h3
              id="add-branch"
              className="text-ink-500 font-mono text-[11px] uppercase tracking-[0.14em]"
            >
              {t('addTitle')}
            </h3>
            <BranchForm
              sources={sources}
              locale={locale}
              limits={{ brand: MAX_BRANCHES_PER_BRAND, day: MAX_NEW_BRANCHES_PER_DAY }}
            />
          </section>
        </>
      )}
    </section>
  )
}
