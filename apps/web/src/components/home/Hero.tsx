import { getTranslations } from 'next-intl/server'
import { ButtonLink, Eyebrow, Rule } from '../ui'

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
 * # Why the ground is cedar and not a photograph
 *
 * There are no photographs yet. A hero built around an image would be a grey
 * rectangle today and a redesign the day the shoot happens. A typographic
 * masthead on the brand ground is finished now and stays correct when a picture
 * arrives behind it, because the type already has a dark ground to sit on.
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
export async function Hero() {
  const t = await getTranslations('home')

  return (
    <header className="bg-cedar-900 relative isolate overflow-hidden">
      {/* Two soft washes, so the flat ground has some depth without an image.
          Behind the content on the z-axis, and inert to a screen reader. */}
      <div
        aria-hidden
        className="absolute inset-0 -z-10"
        style={{
          backgroundImage:
            'radial-gradient(120% 90% at 78% 8%, rgba(201,162,39,0.20), transparent 58%), radial-gradient(80% 70% at 8% 92%, rgba(27,68,56,0.9), transparent 62%)',
        }}
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

          <div className="mt-10 flex animate-[rise_0.9s_cubic-bezier(0,0,0,1)_0.58s_both] flex-wrap gap-3">
            <ButtonLink href="/directory" variant="gold" size="lg">
              {t('browse')}
            </ButtonLink>
            <ButtonLink
              href="/magazine"
              size="lg"
              className="border-gold-300/30 text-surface-base hover:border-gold-300/70 hover:bg-cedar-700 border bg-transparent"
            >
              {t('read')}
            </ButtonLink>
          </div>
        </div>
      </div>
    </header>
  )
}
