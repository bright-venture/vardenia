import Image from 'next/image'
import { getLocale, getTranslations } from 'next-intl/server'
import { Search } from 'lucide-react'
import { SECTIONS } from '@vardenia/core'
import { HeroFilm, type HeroSlide } from './HeroFilm'

/**
 * The masthead, as redesigned in October 2026.
 *
 * # The cover lifts, then the film, then Lebanon
 *
 * On load a navy cover carrying the monogram lifts away like a magazine being
 * opened (CSS only, `.hero-curtain` in globals.css; finished instantly for a
 * reader who asked for less motion). Under it the approved film plays once and
 * hands over to six captioned photographs from Beirut to Baalbek. See
 * HeroFilm for the timing and what loads when.
 *
 * # The poster is the first paint
 *
 * The film's poster is a priority `next/image` underneath everything, so the
 * largest thing above the fold arrives fast and stays there if the film never
 * loads. `bg-cedar-900` on the element keeps the type legible before even that.
 *
 * # Fixed type over moving pictures
 *
 * The headline, search and figures never move while the pictures change. One
 * even navy wash and two gradients keep them legible on every frame and every
 * photograph, light sky or dark sea.
 *
 * # The figures are measured
 *
 * Places and printed codes are counted, not written: the page passes what it
 * fetched. "Places", not "verified places": only listings the team has visited
 * carry the Verified mark, and the count includes every published listing.
 */

/** Photographs in the order of the `heroSlides` captions. Free Pexels licence. */
const SLIDES = [
  { base: 'beirut', credit: 'Eyüpcan Timur' },
  { base: 'byblos', credit: 'YL Lew' },
  { base: 'bsharri', credit: 'Fady' },
  { base: 'baalbek', credit: 'Boris Ulzibat' },
  { base: 'sidon', credit: 'Ayşegül Aytören' },
  { base: 'harissa', credit: 'Soly Moses' },
] as const

export async function Hero({ places, codes }: { places: number; codes: number }) {
  const t = await getTranslations('home')
  /**
   * Read rather than passed: a plain GET form cannot use the localised `Link`,
   * so its `action` is the one thing here built by hand from the locale.
   */
  const locale = await getLocale()

  const captions = t.raw('heroSlides') as { place: string; note: string }[]
  const slides: HeroSlide[] = SLIDES.map((slide, i) => ({
    ...slide,
    place: captions[i]?.place ?? '',
    note: captions[i]?.note ?? '',
  }))

  return (
    <>
      {/* The cover. Decorative, fixed over the page for its first second, and
          gone (translated off-screen) once the animation ends. */}
      <div
        aria-hidden
        className="hero-curtain bg-cedar-900 pointer-events-none fixed inset-0 z-[80] flex items-center justify-center"
      >
        <Image
          src="/brand/monogram-ivory.png"
          alt=""
          width={51}
          height={56}
          priority
          className="opacity-90"
        />
      </div>

      <header
        aria-label={t('eyebrow')}
        className="bg-cedar-900 text-surface-base relative isolate flex h-[calc(100svh-4rem)] min-h-[560px] flex-col justify-end overflow-hidden"
      >
        <Image
          src="/hero/film-poster.webp"
          alt=""
          aria-hidden
          fill
          priority
          fetchPriority="high"
          quality={60}
          sizes="100vw"
          className="-z-20 object-cover"
        />

        <HeroFilm slides={slides} photoBy={t('heroPhotoBy')} />

        <div aria-hidden className="bg-cedar-900/45 absolute inset-0 -z-10" />
        <div
          aria-hidden
          className="from-cedar-900/80 via-cedar-900/25 to-cedar-900/10 absolute inset-0 -z-10 bg-gradient-to-t"
        />
        <div
          aria-hidden
          className="from-cedar-900/45 absolute inset-x-0 top-0 -z-10 h-40 bg-gradient-to-b to-transparent"
        />

        <div className="mx-auto w-full max-w-7xl px-5 pb-14 pt-28 lg:px-10 lg:pb-16">
          <p className="text-gold-300 animate-[rise_0.9s_cubic-bezier(0,0,0,1)_0.08s_both] font-mono text-[11px] uppercase tracking-[0.22em]">
            {t('eyebrow')}
          </p>

          {/* Three keys so one word can be set apart, rising in turn. */}
          <h1 className="text-surface-base mt-5 max-w-4xl text-[13.5vw] font-normal leading-[0.95] sm:text-7xl lg:text-[6.5rem]">
            <span className="inline-block animate-[rise_0.9s_cubic-bezier(0,0,0,1)_0.2s_both]">
              {t('headlineA')}
            </span>{' '}
            <span className="inline-block animate-[rise_0.9s_cubic-bezier(0,0,0,1)_0.36s_both]">
              {t('headlineB')}
            </span>{' '}
            <em className="text-gold-300 inline-block animate-[rise_0.9s_cubic-bezier(0,0,0,1)_0.52s_both] italic">
              {t('headlineEmphasis')}
            </em>
          </h1>

          <p className="text-surface-base/85 mt-6 max-w-xl animate-[rise_0.9s_cubic-bezier(0,0,0,1)_0.68s_both] text-base leading-relaxed">
            {t('intro')}
          </p>

          {/*
            A plain GET form, so it works with no JavaScript and its result is a
            real shareable URL - the same reason the directory filters are links.
          */}
          <form
            action={`/${locale}/search`}
            method="get"
            role="search"
            className="border-surface-base/25 bg-cedar-900/35 mt-9 flex max-w-xl animate-[rise_0.9s_cubic-bezier(0,0,0,1)_0.82s_both] items-stretch border backdrop-blur-md"
          >
            <input
              type="search"
              name="q"
              required
              minLength={2}
              aria-label={t('searchAction')}
              placeholder={t('searchPlaceholder')}
              className="text-surface-base placeholder:text-surface-base/55 w-full bg-transparent px-5 py-4 focus:outline-none"
            />
            <button
              type="submit"
              className="bg-gold-500 text-surface-base hover:bg-gold-700 flex items-center gap-2 px-6 text-sm font-semibold transition-colors"
            >
              <Search aria-hidden className="size-4" strokeWidth={2} />
              <span className="hidden sm:inline">{t('searchAction')}</span>
            </button>
          </form>

          <dl className="border-surface-base/20 mt-10 flex animate-[rise_0.9s_cubic-bezier(0,0,0,1)_0.96s_both] flex-wrap gap-x-10 gap-y-3 border-t pt-5">
            {/* Latin digits with a thousands separator in every language: the
                mono face is a Latin one, as are reference codes and prices. */}
            {[
              [places.toLocaleString('en-US'), t('statsPlaces')],
              [String(SECTIONS.length).padStart(2, '0'), t('statsSections')],
              [codes.toLocaleString('en-US'), t('statsCodes')],
            ].map(([value, label]) => (
              <div key={label} className="flex items-baseline gap-2.5">
                <dt className="sr-only">{label}</dt>
                <dd className="text-surface-base font-mono text-xl tabular-nums">{value}</dd>
                <span
                  aria-hidden
                  className="text-surface-base/50 font-mono text-[11px] uppercase tracking-[0.16em]"
                >
                  {label}
                </span>
              </div>
            ))}
          </dl>
        </div>
      </header>
    </>
  )
}
