import Image from 'next/image'
import { getLocale, getTranslations } from 'next-intl/server'
import { SECTIONS } from '@vardenia/core'
import { HeroFilm } from './HeroFilm'

/**
 * The masthead.
 *
 * # A film, pinned to a clock rather than the scrollbar
 *
 * The commissioned redesign opens on cinematic Lebanon footage - five clips
 * cross-faded in sequence. The prototype drove that sequence from scroll
 * position, which is the behaviour the designer asked us to drop: scrubbing a
 * video with the scrollbar makes it jump and restart. So the sequence advances
 * on its own timer and reads nothing from scroll - see components/home/HeroFilm,
 * the one small client island in an otherwise server-rendered masthead. Scroll
 * touches the hero not at all, so the film plays straight through under it.
 *
 * The poster underneath is the real first paint. It is a `next/image` with
 * `priority`, so it is the LCP element and arrives fast; the 10MB clip streams in
 * behind the type afterwards and fades over the still once it can play. If the
 * clip never loads - a slow line, a blocked request - the poster is simply what
 * stays, which is the same still the video would have shown.
 *
 * A reader who asked their system for less motion gets the poster and no video
 * at all; see the `.hero-video` rule in globals.css, which removes it rather
 * than merely slowing it, because autoplay does not honour the preference on its
 * own.
 *
 * # The navy underneath everything
 *
 * `bg-cedar-900` is declared on the element so that before the poster decodes,
 * and if it never does, the masthead is the brand navy with white type on it
 * rather than white type on white. The gradients over the video are not
 * decoration: they are what keeps the headline legible whatever frame the clip
 * is on.
 *
 * # The headline is three keys, not one
 *
 * One word is set in italic gold and the line breaks in a chosen place. A single
 * string would either lose the emphasis or embed markup in the message
 * catalogue, which a translator would then have to reproduce to avoid breaking
 * the page.
 */
export async function Hero({ places, codes }: { places: number; codes: number }) {
  const t = await getTranslations('home')
  /**
   * Read rather than passed: a plain GET form cannot use the localised `Link`,
   * so its `action` is the one thing here built by hand from the locale.
   */
  const locale = await getLocale()

  return (
    <header className="bg-cedar-900 text-surface-base relative isolate flex min-h-[88svh] flex-col justify-end overflow-hidden">
      {/*
        The poster, and the LCP. `priority` + an explicit `fetchPriority` for the
        same reason the old still had them: it is the largest thing above the
        fold on the busiest page, and `priority` alone emits the preload link but
        not the priority hint. `aria-hidden` because it is the ground the type
        sits on, not content.
      */}
      <Image
        src="/videos/hero-sea-poster.jpg"
        alt=""
        aria-hidden
        fill
        priority
        fetchPriority="high"
        quality={60}
        sizes="100vw"
        className="-z-20 object-cover"
      />

      {/*
        The film - five clips cross-faded on a timer - sits over the poster and,
        once the first frame can play, hides it. The layers carry no `poster`
        attribute: an unloaded video is transparent, so the `next/image` poster
        behind shows through until the first frame is ready. Removed entirely
        under reduced motion, leaving that poster. See components/home/HeroFilm.
      */}
      <HeroFilm />

      {/*
        Dense navy at the foot where the type is, thinning upward so the clip is
        still a clip. A top wash and a start-edge wash keep the header nav and the
        first line legible over a bright frame. `rtl:` mirrors the side wash so it
        always falls on the reading edge.
      */}
      <div
        aria-hidden
        className="from-cedar-900 via-cedar-900/40 to-cedar-900/15 absolute inset-0 -z-10 bg-gradient-to-t"
      />
      <div
        aria-hidden
        className="from-cedar-900/55 absolute inset-x-0 top-0 -z-10 h-56 bg-gradient-to-b to-transparent"
      />
      <div
        aria-hidden
        className="from-cedar-900/40 absolute inset-0 -z-10 bg-gradient-to-r to-transparent rtl:bg-gradient-to-l"
      />

      <div className="mx-auto w-full max-w-6xl px-6 pt-40 pb-16 sm:pb-24">
        <div className="max-w-3xl">
          <p className="text-gold-300 animate-[rise_0.9s_cubic-bezier(0,0,0,1)_0.05s_both] font-mono text-[11px] tracking-[0.2em] uppercase">
            {t('eyebrow')}
          </p>

          <h1 className="text-surface-base mt-5 animate-[rise_0.9s_cubic-bezier(0,0,0,1)_0.18s_both] text-[clamp(2.75rem,8vw,5.5rem)] leading-[0.98] font-normal">
            {t('headlineA')}
            <br />
            {t('headlineB')} <em className="text-gold-300 italic">{t('headlineEmphasis')}</em>
          </h1>

          <p className="text-cedar-100/80 mt-7 max-w-[52ch] animate-[rise_0.9s_cubic-bezier(0,0,0,1)_0.42s_both] text-base leading-relaxed sm:text-lg">
            {t('intro')}
          </p>

          {/*
            A plain GET form, so it works with no JavaScript and its result is a
            real shareable URL - the same reason the directory filters are links.
            `action` is built by hand because a form cannot use the localised
            `Link`.
          */}
          <form
            action={`/${locale}/search`}
            method="get"
            role="search"
            className="border-gold-300/30 bg-cedar-900/40 mt-10 flex max-w-xl animate-[rise_0.9s_cubic-bezier(0,0,0,1)_0.58s_both] items-stretch border backdrop-blur-md"
          >
            <input
              type="search"
              name="q"
              required
              minLength={2}
              aria-label={t('searchAction')}
              placeholder={t('searchPlaceholder')}
              className="text-surface-base placeholder:text-cedar-100/70 w-full bg-transparent px-5 py-4 focus:outline-none"
            />
            <button
              type="submit"
              className="bg-gold-700 text-surface-base hover:bg-gold-500 px-6 text-sm font-semibold transition-colors"
            >
              {t('searchAction')}
            </button>
          </form>

          {/*
            Three figures, all read from what the page already has: two counts it
            fetched anyway, and the code count from its own cached query. The
            design's third stat used to be invented; see lib/listings countCodes
            for why it is now measured instead.
          */}
          <dl className="border-cedar-100/20 mt-10 flex animate-[rise_0.9s_cubic-bezier(0,0,0,1)_0.7s_both] flex-wrap gap-x-10 gap-y-3 border-t pt-5">
            {/* Latin digits with a thousands separator in both languages: a
                reference code and a price mark are Latin here too, and the mono
                face is a Latin one. */}
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
                  className="text-cedar-100/60 font-mono text-[11px] tracking-[0.16em] uppercase"
                >
                  {label}
                </span>
              </div>
            ))}
          </dl>
        </div>
      </div>

      {/* The one persistent cue. `animate-bounce` is stilled under reduced motion
          by the blanket rule in globals.css. */}
      <div
        aria-hidden
        className="text-cedar-100/70 pointer-events-none absolute end-6 bottom-5 flex items-center gap-3 lg:end-10"
      >
        <span className="font-mono text-[11px] tracking-[0.16em] uppercase">{t('scroll')}</span>
        <span className="animate-bounce">&darr;</span>
      </div>
    </header>
  )
}
