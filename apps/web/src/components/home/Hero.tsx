import Image from 'next/image'
import { getLocale, getTranslations } from 'next-intl/server'
import { SECTIONS } from '@vardenia/core'
import { Eyebrow, Rule } from '../ui'

/**
 * The masthead.
 *
 * # What it has to say in one screen
 *
 * That this is Lebanon, that it is a magazine as well as a website, and that
 * the listings were checked by a person. The last one is the whole proposition:
 * anyone can scrape a list of restaurants, and the reason to trust this one is
 * that somebody went. So the promise is in the sub-line rather than buried on
 * the about page.
 *
 * # The photograph, and the navy still underneath it
 *
 * This used to argue for a typographic masthead on a flat ground, because there
 * were no photographs. There is one now - supplied with the commissioned design
 * - so the prediction in that argument gets to come true: the type already had
 * a dark ground to sit on, and the picture went behind it without a redesign.
 *
 * The gradient over it is not decoration. It is what keeps the headline legible
 * whatever the image does, and it is why the navy is still declared on the
 * element: if the file ever fails to load, the masthead is the old flat ground
 * rather than white type on white.
 *
 * # The load sequence
 *
 * Four elements rise in order over about half a second. It is the one
 * orchestrated moment on the site; everything else moves only to confirm a
 * press. The whole thing is CSS animation on a server-rendered element, so the
 * page stays static and there is no client component in the masthead.
 *
 * Anyone who has asked their machine for less movement gets none of it - see
 * the reduced-motion rule in globals.css, which cancels the animation rather
 * than merely shortening it.
 *
 * # The headline is three keys, not one
 *
 * Because one word of it is set in italic gold and the line breaks in a chosen
 * place. A single string would either lose the emphasis or embed markup in the
 * message catalogue, which is worse: a translator would have to reproduce tags
 * correctly to avoid breaking the page.
 *
 * # No locale prop
 *
 * `getTranslations` reads the locale the page already set with
 * `setRequestLocale`, so passing it again would be a second source of truth for
 * the same fact. Components that take a `locale` do so because they format a
 * date or pick a label synchronously; this one only reads strings.
 */
export async function Hero({ places }: { places: number }) {
  const t = await getTranslations('home')
  /**
   * Read rather than passed, so the "no locale prop" rule above still holds.
   * It is needed for one thing only: a plain GET form cannot use the localised
   * `Link`, so its action has to be built by hand.
   */
  const locale = await getLocale()

  return (
    <header className="bg-cedar-900 relative isolate overflow-hidden">
      {/* Two soft washes, so the flat ground has some depth without an image.
          Behind the content on the z-axis, and inert to a screen reader.

          The two rgba values are gold.500 and cedar.700 written out, because a
          gradient stop cannot take a Tailwind colour class. That makes them the
          one place on this page a rebrand does not reach on its own: the 2026
          palette change turned the whole site navy and left this corner green,
          because these still held the old #c9a227 and #1b4438. If you change
          the palette, grep the components for `rgba(` before believing it. */}
      <div
        aria-hidden
        className="absolute inset-0 -z-10"
        style={{
          backgroundImage:
            'radial-gradient(120% 90% at 78% 8%, rgba(155,106,32,0.20), transparent 58%), radial-gradient(80% 70% at 8% 92%, rgba(21,34,78,0.9), transparent 62%)',
        }}
      />

      {/*
        `alt=""` and aria-hidden together, because this is the ground the
        masthead sits on rather than content. A description of it would be read
        out before the headline and tell a screen reader nothing it needs.

        `priority` because it is the largest element above the fold on the
        busiest page: without it the browser discovers the file late and the
        masthead flashes navy first.
      */}
      <Image
        src="/images/hero.jpg"
        alt=""
        aria-hidden
        fill
        priority
        sizes="100vw"
        className="-z-10 object-cover"
      />

      {/*
        Dense at the foot where the type is, thinning towards the top so the
        picture is still a picture. Same direction as the design's.
      */}
      <div
        aria-hidden
        className="from-cedar-900 via-cedar-900/60 to-cedar-900/25 absolute inset-0 -z-10 bg-gradient-to-t"
      />

      <div className="mx-auto max-w-6xl px-6 py-20 sm:py-28">
        <div className="max-w-3xl">
          <div className="animate-[rise_0.9s_cubic-bezier(0,0,0,1)_0.05s_both]">
            <Eyebrow inverse>{t('eyebrow')}</Eyebrow>
          </div>

          <h1 className="text-surface-base mt-5 animate-[rise_0.9s_cubic-bezier(0,0,0,1)_0.18s_both] text-[clamp(2.75rem,8vw,5.5rem)] font-normal">
            {t('headlineA')}
            <br />
            {t('headlineB')} <em className="text-gold-300 italic">{t('headlineEmphasis')}</em>
          </h1>

          <Rule
            inverse
            className="mt-8 origin-left animate-[foil_1.1s_cubic-bezier(0,0,0,1)_0.5s_both]"
          />

          <p className="text-cedar-100/75 mt-7 max-w-[52ch] animate-[rise_0.9s_cubic-bezier(0,0,0,1)_0.42s_both] text-base leading-relaxed sm:text-lg">
            {t('intro')}
          </p>

          {/*
            A search field where two buttons used to be, which is the design's
            call and the right one: the header already carries Discover and
            Magazine, so the buttons were a second copy of the navigation. A
            reader who knows what they are looking for could not say so from the
            front page at all.

            A plain GET form, so it works with no JavaScript and its result is a
            real shareable URL - the same reason the directory filters are links
            rather than state. `action` is built by hand because a form cannot
            use the localised `Link`.
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
            Two figures, both true and both read from what the page already has.

            The design shows a third - a count of printed codes - and it is
            invented there. Every other number on this site is measured, so
            rather than fabricate one or add a database round trip to the
            homepage for a vanity figure, there are two.
          */}
          <dl className="border-cedar-100/20 mt-10 flex animate-[rise_0.9s_cubic-bezier(0,0,0,1)_0.7s_both] flex-wrap gap-x-10 gap-y-3 border-t pt-5">
            {[
              [places, t('statsPlaces')],
              [SECTIONS.length, t('statsSections')],
            ].map(([value, label]) => (
              <div key={String(label)} className="flex items-baseline gap-2.5">
                <dt className="sr-only">{label}</dt>
                <dd className="text-surface-base font-mono text-xl tabular-nums">{value}</dd>
                <span
                  aria-hidden
                  className="text-cedar-100/70 font-mono text-[11px] uppercase tracking-[0.16em]"
                >
                  {label}
                </span>
              </div>
            ))}
          </dl>
        </div>
      </div>
    </header>
  )
}
