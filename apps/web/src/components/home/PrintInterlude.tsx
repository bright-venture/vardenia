import Image from 'next/image'
import { getTranslations } from 'next-intl/server'
import { QrCode } from 'lucide-react'
import { Link } from '../../i18n/routing'

/**
 * The half of the product a website cannot show.
 *
 * Everything else on this page argues that the directory is worth reading. This
 * is the only place that says the directory has a printed twin, which is the
 * thing no competitor has and the reason the codes exist at all.
 *
 * # Why the code shown is a real one
 *
 * The design mocks it up as `/qr/VRD-0001`, which is wrong twice: that is not
 * the resolver path - `/g/<code>` is - and the format is not what the codes look
 * like. Printing a plausible-but-fake code on the homepage of a product whose
 * entire promise is that its codes resolve would be a bad joke, and somebody
 * would eventually type it in.
 *
 * So this shows the shape of a real code against the real path, and the block
 * is not a link: it is an illustration of what is printed on a table card, and
 * a reader who wants the directory has the button under it.
 */
export async function PrintInterlude() {
  const t = await getTranslations('home')

  return (
    <section className="bg-cedar-900 text-surface-base">
      <div className="mx-auto grid max-w-6xl items-center gap-12 px-6 py-20 sm:py-28 lg:grid-cols-2 lg:gap-16">
        {/*
          Ordered so the picture is second on a phone and first on a desktop.
          On a narrow screen the sentence explaining what the picture is should
          arrive before the picture, not after it.
        */}
        <div className="order-2 lg:order-1">
          <Image
            src="/images/issue.jpg"
            alt={t('printImageAlt')}
            width={1536}
            height={968}
            loading="lazy"
            sizes="(min-width: 1024px) 50vw, 100vw"
            className="h-auto w-full object-cover"
          />
        </div>

        <div className="order-1 lg:order-2">
          <p className="text-gold-300 font-mono text-[11px] uppercase tracking-[0.2em]">
            {t('printEyebrow')}
          </p>

          <h2 className="text-surface-base mt-4 text-3xl sm:text-4xl lg:text-5xl">
            {t('printTitle')}
          </h2>

          <p className="text-cedar-100/70 mt-6 max-w-lg leading-relaxed">{t('printBody')}</p>

          <div className="mt-8 flex items-center gap-4">
            <span
              aria-hidden
              className="border-gold-300/50 text-gold-300 flex size-12 items-center justify-center border"
            >
              <QrCode size={22} strokeWidth={1.5} />
            </span>
            {/* `dir="ltr"` because a code is Latin characters in both editions,
                and an RTL paragraph would move its slash to the wrong end. */}
            <span
              dir="ltr"
              className="text-cedar-100/50 font-mono text-xs uppercase tracking-[0.2em]"
            >
              /g/K3M9QP2
            </span>
          </div>

          <Link
            href="/magazine"
            className="border-gold-300 text-gold-300 hover:border-surface-base hover:text-surface-base group mt-9 inline-flex items-center gap-2 border-b pb-1 text-sm font-semibold transition-colors"
          >
            {t('printCta')}
            <span
              aria-hidden
              className="transition-transform duration-300 group-hover:translate-x-1 rtl:-scale-x-100 rtl:group-hover:-translate-x-1"
            >
              &rarr;
            </span>
          </Link>
        </div>
      </div>
    </section>
  )
}
