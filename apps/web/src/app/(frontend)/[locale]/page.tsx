import { setRequestLocale } from 'next-intl/server'
import { getTranslations } from 'next-intl/server'
import { TAXONOMY } from '@vardenia/core'

export default async function HomePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params
  setRequestLocale(locale)
  const t = await getTranslations('nav')

  return (
    <main className="mx-auto max-w-5xl px-6 py-24">
      <p className="text-gold-700 text-sm uppercase tracking-[0.3em]">Discover Lebanon</p>
      <h1 className="font-display mt-4 text-5xl leading-tight md:text-6xl">Vardenia</h1>
      <p className="text-ink-500 mt-6 max-w-xl text-lg">
        Scaffold in place. The homepage, directory, and magazine surfaces are next - see{' '}
        <code className="text-ink-700">docs/ROADMAP.md</code>.
      </p>

      <nav className="mt-12 flex flex-wrap gap-6 text-sm">
        {(['discover', 'directory', 'magazine', 'regions'] as const).map((key) => (
          <span key={key} className="text-ink-700">
            {t(key)}
          </span>
        ))}
      </nav>

      <section className="mt-16">
        <h2 className="text-ink-500 text-xs uppercase tracking-widest">
          Directory categories ({TAXONOMY.length})
        </h2>
        <ul className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4">
          {TAXONOMY.map((category) => (
            <li key={category.slug} className="border-ink-100 rounded-lg border px-4 py-3 text-sm">
              <span className="block">{locale === 'ar' ? category.ar : category.en}</span>
              <span className="text-ink-300 text-xs">{category.children.length} subcategories</span>
            </li>
          ))}
        </ul>
      </section>
    </main>
  )
}
