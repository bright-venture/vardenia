import { getLocale, getTranslations } from 'next-intl/server'
import { KineticType } from './KineticType'

/**
 * The dark pause.
 *
 * One sentence of large type on the navy ground: the whole proposition, with no
 * link and no image, because everything around it asks the reader to go
 * somewhere. In the October 2026 redesign the sentence composes word by word as
 * the reader scrolls, the accent word stamping last in gold (see KineticType).
 *
 * `manifestoAccent` names that word in each language, exactly as it appears in
 * the sentence; if it is not found, nothing is gold and the rest still works.
 */
export async function Manifesto() {
  const t = await getTranslations('home')
  const locale = await getLocale()

  return (
    <section className="bg-cedar-900 text-surface-base">
      <div className="mx-auto max-w-5xl px-5 lg:px-10">
        <KineticType
          text={t('manifesto')}
          accent={t('manifestoAccent')}
          locale={locale}
          className="font-display text-surface-base max-w-4xl text-center text-4xl leading-[1.12] sm:text-6xl lg:text-7xl"
        />
        <div className="pb-28 pt-4 text-center lg:pb-36">
          <p className="text-surface-base/70 mx-auto max-w-xl leading-relaxed">
            {t('manifestoSub')}
          </p>
          {/* A short gold rule, the full stop that closes a dark band. */}
          <span aria-hidden className="bg-gold-500 mx-auto mt-10 block h-px w-16" />
        </div>
      </div>
    </section>
  )
}
