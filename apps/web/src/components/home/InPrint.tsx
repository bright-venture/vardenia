import Image from 'next/image'
import { getTranslations } from 'next-intl/server'
import { ArrowUpRight, QrCode } from 'lucide-react'
import { Link } from '../../i18n/routing'
import { Accent } from '../Accent'

/**
 * In print: the issue as it sits on a table, and one of its codes, live.
 *
 * Replaces the dark print interlude in the October 2026 redesign. The code
 * shown is a real one, the printed code of the listing the scan sequence above
 * just opened, so pressing it goes through the same redirect a phone camera
 * would. With no code to show, the section offers the magazine instead.
 */
export async function InPrint({ code }: { code: string | null }) {
  const t = await getTranslations('home')

  return (
    <section className="bg-surface-base overflow-hidden">
      <div className="mx-auto max-w-7xl px-5 py-24 lg:px-10 lg:py-32">
        <div className="grid items-center gap-12 lg:grid-cols-2 lg:gap-20">
          <div className="relative">
            <div
              aria-hidden
              className="border-gold-500/40 absolute -inset-3 rotate-[-2deg] border"
            />
            <Image
              src="/images/issue.jpg"
              alt={t('printImageAlt')}
              width={1080}
              height={680}
              sizes="(min-width: 1024px) 50vw, 100vw"
              className="shadow-cedar-900/20 relative w-full shadow-2xl"
            />
          </div>

          <div>
            <p className="text-gold-700 font-mono text-[11px] uppercase tracking-[0.16em]">
              {t('printEyebrow')}
            </p>
            <h2 className="text-ink-900 mt-3 max-w-lg text-4xl leading-[1.05] lg:text-6xl">
              <Accent text={t('printTitle')} accent="المطبعة" />
            </h2>
            <p className="text-ink-700 mt-6 max-w-md leading-relaxed">{t('printBody')}</p>

            {code ? (
              // A plain anchor: /g/ is a route handler outside the localised
              // pages, so the i18n Link would put a language prefix on it.
              <a
                href={`/g/${code}`}
                className="border-ink-100 hover:border-gold-500 group mt-10 inline-flex items-center gap-4 border px-5 py-4 transition-colors"
              >
                <span
                  aria-hidden
                  className="border-gold-500/50 text-gold-700 flex h-11 w-11 items-center justify-center border"
                >
                  <QrCode className="size-5" strokeWidth={1.5} />
                </span>
                <span>
                  <span className="text-ink-500 block font-mono text-[10px] uppercase tracking-[0.18em]">
                    {t('issueCodeLabel')}
                  </span>
                  <span
                    dir="ltr"
                    className="text-ink-900 group-hover:text-gold-700 mt-0.5 block font-mono text-base tracking-[0.22em] transition-colors rtl:text-right"
                  >
                    /g/{code}
                  </span>
                </span>
                <ArrowUpRight
                  aria-hidden
                  className="text-ink-500 group-hover:text-gold-700 ms-2 size-4 transition-colors rtl:-scale-x-100"
                />
              </a>
            ) : (
              <Link
                href="/magazine"
                className="border-ink-900 text-ink-900 hover:bg-ink-900 hover:text-surface-base mt-10 inline-flex items-center gap-2 border px-5 py-3 text-sm font-semibold transition-colors"
              >
                {t('printCta')}
              </Link>
            )}
          </div>
        </div>
      </div>
    </section>
  )
}
