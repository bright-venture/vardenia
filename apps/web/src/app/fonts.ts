import {
  Amiri,
  Fraunces,
  IBM_Plex_Mono,
  Manrope,
  Noto_Sans_Arabic,
  Noto_Sans_Bengali,
  Noto_Sans_Devanagari,
  Noto_Sans_SC,
  Noto_Serif,
} from 'next/font/google'

/**
 * The brand faces, actually fetched.
 *
 * # What was wrong
 *
 * globals.css named Canela, Inter, Tajawal and IBM Plex Sans Arabic in its font
 * stacks, and nothing anywhere loaded any of them. A CSS font stack does not
 * fetch a face - it names one and hopes the machine already has it. None of
 * these are installed on a normal computer, so every heading on the site fell
 * through to Times New Roman and every paragraph to whatever `system-ui` maps
 * to. The site has never once rendered in its own typeface.
 *
 * `next/font` fixes the class of bug rather than the instance: it downloads each
 * face at build time, self-hosts it from our own origin, and emits a CSS
 * variable. There is no request to Google at runtime, which also keeps the fonts
 * out of the consent question a European visitor is entitled to ask.
 *
 * # Why `display: 'swap'`
 *
 * Text is readable in a fallback while the face downloads, rather than invisible
 * until it lands. On a Lebanese mobile connection the difference is a page you
 * can start reading and a page that is blank for a second.
 *
 * # Why the subsets differ
 *
 * Latin faces take `latin`, the Arabic ones take `arabic`. Asking Fraunces for
 * an Arabic subset would silently ship nothing, and asking Tajawal for latin
 * doubles its weight for glyphs Inter already covers.
 *
 * # Why the variable names are not the Tailwind names
 *
 * `--font-display` and `--font-body` are set in globals.css and switch on
 * `:lang(ar)`, because Latin display type has no Arabic coverage and falling
 * back mid-headline looks broken. These four variables are the raw faces; that
 * file decides which one a language gets.
 */

export const fraunces = Fraunces({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-fraunces',
  // The optical-size axis is what makes this face work at both 64px and 18px.
  // `auto` lets the browser drive it from the rendered size.
  axes: ['SOFT', 'WONK'],
})

export const manrope = Manrope({
  // Cyrillic rides along here so Russian body text renders in the brand face
  // rather than falling through to a system sans. Manrope covers it; the display
  // face (Fraunces) does not, which is why Russian headings get their own serif
  // below. The subset is only fetched for glyphs a page actually uses.
  subsets: ['latin', 'cyrillic'],
  display: 'swap',
  variable: '--font-manrope',
})

export const plexMono = IBM_Plex_Mono({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-plex-mono',
  // Only the two weights the reference codes and price marks use. The rest
  // would be kilobytes for glyphs nothing renders.
  weight: ['400', '500'],
})

/**
 * Amiri is a naskh serif, and that is the point of choosing it.
 *
 * Tajawal, which it replaces, is a geometric sans - correct next to Inter and
 * wrong next to Fraunces. An English headline in a serif beside an Arabic
 * headline in a sans does not read as one masthead in two languages, it reads
 * as two brands. Amiri carries the same editorial voice into Arabic.
 *
 * It has no 500 weight; 400 and 700 are the whole family.
 */
export const amiri = Amiri({
  subsets: ['arabic'],
  display: 'swap',
  variable: '--font-amiri',
  weight: ['400', '700'],
})

export const notoArabic = Noto_Sans_Arabic({
  subsets: ['arabic'],
  display: 'swap',
  variable: '--font-noto-arabic',
  weight: ['400', '500', '600'],
})

/**
 * Faces for the scripts the Latin and Arabic families do not cover.
 *
 * The UI is translated into ten languages (see @vardenia/i18n). Four carry
 * scripts nothing loaded above can draw: Russian (Cyrillic, body handled by
 * Manrope above, so only a display serif is needed here), Chinese, Hindi
 * (Devanagari) and Bengali. Each gets a Noto face, wired per language in
 * globals.css with a `:lang()` block exactly as Arabic is. A face is only
 * fetched by a reader whose page is in that language, so a French visitor never
 * downloads the Chinese one.
 *
 * `preload: false` on all of them: preloading pushes the font on the very first
 * paint of every page, which is right for the always-on brand faces and wrong
 * for these, which most visitors never see. They load when a page in their
 * language is served instead. Noto Sans SC in particular is large (Google slices
 * it into many unicode-range files), so preloading it site-wide would be a real
 * cost paid by everyone for a few.
 */
export const notoSerif = Noto_Serif({
  // A Cyrillic serif for Russian headings, so the masthead stays a serif the way
  // Fraunces is for Latin and Amiri is for Arabic, rather than switching to sans
  // mid-brand. Fraunces has no Cyrillic, which is the whole reason this exists.
  subsets: ['latin', 'cyrillic'],
  display: 'swap',
  variable: '--font-noto-serif',
  weight: ['400', '500'],
  preload: false,
})

export const notoSC = Noto_Sans_SC({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-noto-sc',
  weight: ['400', '500', '700'],
  preload: false,
})

export const notoDevanagari = Noto_Sans_Devanagari({
  subsets: ['devanagari', 'latin'],
  display: 'swap',
  variable: '--font-noto-devanagari',
  weight: ['400', '500', '700'],
  preload: false,
})

export const notoBengali = Noto_Sans_Bengali({
  subsets: ['bengali', 'latin'],
  display: 'swap',
  variable: '--font-noto-bengali',
  weight: ['400', '500', '700'],
  preload: false,
})

/** Every face, for the `<html>` class. Order does not matter; presence does. */
export const FONT_VARIABLES = [
  fraunces.variable,
  manrope.variable,
  plexMono.variable,
  amiri.variable,
  notoArabic.variable,
  notoSerif.variable,
  notoSC.variable,
  notoDevanagari.variable,
  notoBengali.variable,
].join(' ')
