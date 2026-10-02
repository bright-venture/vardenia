import { getTranslations } from 'next-intl/server'
import { BadgeCheck } from 'lucide-react'
import { Accent } from '../Accent'

/**
 * What the Verified mark means, in three steps.
 *
 * From the October 2026 redesign, worded to match how the mark is actually
 * given: an admin sets it after someone from Vardenia has been to the place, and
 * no tier or payment sets it (see Businesses `verified` and ui/Tier). The
 * designer's draft claimed it for every listing; most imported listings do not
 * carry it, so the copy describes the mark rather than the whole catalogue.
 */
export async function Verified() {
  const t = await getTranslations('home')
  const steps = t.raw('verifiedSteps') as { title: string; sub: string }[]

  return (
    <section className="bg-surface-base">
      <div className="mx-auto max-w-7xl px-5 py-24 lg:px-10 lg:py-32">
        <div className="flex flex-wrap items-end justify-between gap-6">
          <div>
            <p className="text-gold-700 font-mono text-[11px] uppercase tracking-[0.16em]">
              {t('verifiedEyebrow')}
            </p>
            <h2 className="text-ink-900 mt-3 max-w-2xl text-4xl leading-[1.05] lg:text-6xl">
              <Accent text={t('verifiedTitle')} accent="«موثّق»" />
            </h2>
          </div>
          <p className="text-ink-500 max-w-sm text-sm leading-relaxed">{t('verifiedNote')}</p>
        </div>

        <ol className="border-ink-100 bg-ink-100 mt-14 grid gap-px border lg:grid-cols-3">
          {steps.map((step, i) => (
            <li
              key={step.title}
              className="bg-surface-base hover:bg-surface-raised group p-8 transition-colors duration-500 lg:p-10"
            >
              <div className="flex items-center justify-between">
                <span className="text-gold-700 font-mono text-xs tracking-[0.2em]">
                  {String(i + 1).padStart(2, '0')}
                </span>
                <BadgeCheck
                  aria-hidden
                  strokeWidth={1.5}
                  className="text-gold-500/60 group-hover:text-gold-500 size-[18px] transition-colors duration-500"
                />
              </div>
              <h3 className="text-ink-900 group-hover:text-gold-700 mt-16 text-2xl leading-tight transition-colors duration-500 lg:mt-24">
                {step.title}
              </h3>
              <p className="text-ink-500 mt-3 text-sm leading-relaxed">{step.sub}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  )
}
