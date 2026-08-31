import { Amiri, Fraunces, IBM_Plex_Mono, Manrope, Noto_Sans_Arabic } from 'next/font/google'

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
  subsets: ['latin'],
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

/** Every face, for the `<html>` class. Order does not matter; presence does. */
export const FONT_VARIABLES = [
  fraunces.variable,
  manrope.variable,
  plexMono.variable,
  amiri.variable,
  notoArabic.variable,
].join(' ')
