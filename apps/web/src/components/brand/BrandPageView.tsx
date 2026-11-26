import { EnglishPageSchema } from '../EnglishPageSchema'
import { getTranslations } from 'next-intl/server'
import type { Locale } from '@vardenia/i18n'
import { Link } from '../../i18n/routing'
import type { PublicBrand } from '../../lib/brands'
import { placeLabel } from '../../lib/labels'
import { SHOW_LOCATION } from '../../lib/location-display'
import { Eyebrow } from '../ui'
import { ResilientPhoto } from '../ui/ResilientPhoto'

/**
 * A restaurant brand's public page (Task 12, item 5): the group's name and a
 * plain list of its branches, each linking to its own listing page. Built
 * from what lib/brands publicBrand returns (the same data GET
 * /brand-data/<slug> serves), so it holds nothing staff-only.
 *
 * Plain on purpose: the page's own heading and hairline-list styles. The
 * address and place follow SHOW_LOCATION like the listing page does.
 */
export async function BrandPageView({ brand, locale }: { brand: PublicBrand; locale: Locale }) {
  const t = await getTranslations({ locale, namespace: 'brandPage' })
  const tDirectory = await getTranslations({ locale, namespace: 'directory' })

  return (
    <main>
      <EnglishPageSchema
        locale={locale}
        path={`/brands/${brand.slug}`}
        name={brand.name}
        description={brand.description ?? t('description', { name: brand.name })}
        type="CollectionPage"
      />
      <article className="mx-auto max-w-3xl px-6 py-14 sm:py-20">
        <Link
          href="/directory"
          className="text-ink-500 hover:text-ink-900 mb-8 inline-flex min-h-[44px] w-fit items-center gap-2 font-mono text-[11px] uppercase tracking-[0.16em] transition-colors"
        >
          <span aria-hidden className="rtl:-scale-x-100">
            &larr;
          </span>
          {tDirectory('title')}
        </Link>

        <Eyebrow>{t('eyebrow')}</Eyebrow>
        <div className="mt-4 flex items-center gap-5">
          {brand.logo ? (
            <div className="bg-surface-sunken relative h-16 w-16 shrink-0 overflow-hidden">
              <ResilientPhoto
                src={brand.logo.url}
                alt={brand.logo.alt || brand.name}
                sizes="64px"
                className="object-contain"
              />
            </div>
          ) : null}
          <h1 dir="auto" className="text-ink-900 text-[clamp(2rem,6vw,3.5rem)] leading-[1.05]">
            {brand.name}
          </h1>
        </div>

        {brand.description ? (
          <p dir="auto" className="text-ink-700 mt-6 max-w-2xl whitespace-pre-line leading-relaxed">
            {brand.description}
          </p>
        ) : null}

        <section className="mt-12" aria-labelledby="brand-branches">
          <h2
            id="brand-branches"
            className="text-ink-500 font-mono text-[11px] uppercase tracking-[0.16em]"
          >
            {t('branches')}
          </h2>
          <ul className="border-ink-100 divide-ink-100 mt-4 divide-y border-y">
            {brand.branches.map((branch) => {
              const place = SHOW_LOCATION ? placeLabel(branch.governorate, branch.city, locale) : ''
              const address = SHOW_LOCATION ? branch.address : null
              return (
                <li key={branch.id} className="py-5">
                  <Link
                    href={`/directory/${branch.slug}`}
                    className="text-ink-900 hover:text-gold-700 inline-flex min-h-[44px] items-center text-lg font-medium underline-offset-4 hover:underline"
                    dir="auto"
                    aria-label={`${t('viewBranch')}: ${branch.name}`}
                  >
                    {branch.name}
                  </Link>
                  {place ? (
                    <p className="vd-branch-locality text-ink-700 mt-1 text-sm">{place}</p>
                  ) : null}
                  {address ? (
                    <p dir="auto" className="text-ink-500 mt-1 whitespace-pre-line text-sm">
                      {address}
                    </p>
                  ) : null}
                  {branch.bookingEnabled ? (
                    <p className="text-ink-500 mt-2 text-xs">{t('takesBookings')}</p>
                  ) : null}
                </li>
              )
            })}
          </ul>
        </section>
      </article>
    </main>
  )
}
