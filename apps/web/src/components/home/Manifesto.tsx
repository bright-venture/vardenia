import { getTranslations } from 'next-intl/server'

/**
 * The dark pause.
 *
 * One line of large type on the navy ground, between the featured places and the
 * print interlude. It carries no link and no image on purpose: everything around
 * it is asking the reader to go somewhere, and a single unhurried claim - the
 * whole proposition in a sentence - reads louder for having nothing to click.
 *
 * Server-rendered like the rest of the page; the only motion is the section
 * scrolling into view, which the reader's browser does for free.
 */
export async function Manifesto() {
  const t = await getTranslations('home')

  return (
    <section className="bg-cedar-900 text-surface-base">
      <div className="mx-auto max-w-4xl px-6 py-24 text-center sm:py-32">
        <h2 className="text-surface-base text-3xl leading-[1.12] sm:text-5xl lg:text-6xl">
          {t('manifesto')}
        </h2>
        <p className="text-cedar-100/70 mx-auto mt-8 max-w-xl leading-relaxed">
          {t('manifestoSub')}
        </p>
        {/* A short gold rule, the same full stop the print interlude and the
            footer use to close a dark band. */}
        <span aria-hidden className="bg-gold-300 mx-auto mt-10 block h-px w-16" />
      </div>
    </section>
  )
}
