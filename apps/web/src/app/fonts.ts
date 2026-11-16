/** Self-hosted web faces. Legacy Latin variable names keep every existing consumer compatible. */
import {
  Amiri,
  Playfair_Display,
  IBM_Plex_Mono,
  DM_Sans,
  Noto_Sans_Arabic,
  Noto_Sans_Bengali,
  Noto_Sans_Devanagari,
  Noto_Serif,
} from 'next/font/google'
export const fraunces = Playfair_Display({
  // Latin only. Russian pages set their display face in Noto Serif (see
  // :root:lang(ru) in globals.css), so a preloaded Cyrillic Playfair was a
  // download every English page made for nothing.
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-fraunces',
})
export const manrope = DM_Sans({ subsets: ['latin'], display: 'swap', variable: '--font-manrope' })
export const plexMono = IBM_Plex_Mono({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-plex-mono',
  weight: ['400', '500'],
  // Reference codes only: not worth a high-priority download on every page.
  preload: false,
})
export const amiri = Amiri({
  subsets: ['arabic'],
  display: 'swap',
  variable: '--font-amiri',
  weight: ['400', '700'],
  // Arabic pages fetch it as soon as their styles ask for it. Preloaded, it
  // was a high-priority download on every English page, ahead of the hero.
  preload: false,
})
export const notoArabic = Noto_Sans_Arabic({
  subsets: ['arabic'],
  display: 'swap',
  variable: '--font-noto-arabic',
  weight: ['400', '500', '600'],
  // As Amiri above.
  preload: false,
})
export const notoSerif = Noto_Serif({
  subsets: ['latin', 'cyrillic'],
  display: 'swap',
  variable: '--font-noto-serif',
  weight: ['400', '500'],
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
export const FONT_VARIABLES = [
  fraunces.variable,
  manrope.variable,
  plexMono.variable,
  amiri.variable,
  notoArabic.variable,
  notoSerif.variable,
  notoDevanagari.variable,
  notoBengali.variable,
].join(' ')
