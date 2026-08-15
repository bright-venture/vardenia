import { setRequestLocale } from 'next-intl/server'
import { getTranslations } from 'next-intl/server'
import { TAXONOMY } from '@vardenia/core'

/**
 * The homepage.
 *
 * Still a holding page rather than a designed one, but it no longer says so.
 * The previous copy read "Scaffold in place" and pointed the public at
 * docs/ROADMAP.md, which is fine on localhost and not fine on the address
 * printed under a QR code.
 *
 * The strings that were hardcoded English are now translated. On /ar the
 * eyebrow, the intro and the category heading all rendered in English before,
 * which is worse on a bilingual title than a plain page.
 */
export default async function HomePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params
  setRequestLocale(locale)

  const nav = await getTranslations('nav')
  const t = await getTranslations('home')

  return (
    <main className="mx-auto max-w-5xl px-6 py-24">
      <p className="text-gold-700 text-sm uppercase tracking-[0.3em]">{t('eyebrow')}</p>
      <h1 className="font-display mt-4 text-5xl leading-tight md:text-6xl">Vardenia</h1>
      <p className="text-ink-500 mt-6 max-w-xl text-lg">{t('intro')}</p>

      <nav className="mt-12 flex flex-wrap gap-6 text-sm">
        {(['discover', 'directory', 'magazine', 'regions'] as const).map((key) => (
          <span key={key} className="text-ink-700">
            {nav(key)}
          </span>
        ))}
      </nav>

      <section className="mt-16">
        <h2 className="text-ink-500 text-xs uppercase tracking-widest">
          {t('categories')} ({TAXONOMY.length})
        </h2>
        <ul className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4">
          {TAXONOMY.map((category) => (
            <li key={category.slug} className="border-ink-100 rounded-lg border px-4 py-3 text-sm">
              <span className="block">{locale === 'ar' ? category.ar : category.en}</span>
              <span className="text-ink-300 text-xs">
                {t('subcategoryCount', { count: category.children.length })}
              </span>
            </li>
          ))}
        </ul>
      </section>
    </main>
  )
}
