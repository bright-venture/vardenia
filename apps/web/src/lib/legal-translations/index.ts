import type { Locale } from '@vardenia/i18n'
import type { LegalEdition } from '../legal'
import { ar } from './ar'
import { bn } from './bn'
import { es } from './es'
import { fr } from './fr'
import { hi } from './hi'
import { pt } from './pt'
import { ru } from './ru'
import { ur } from './ur'
import { zh } from './zh'

/**
 * The privacy policy and terms in every language but English, added on 9
 * November 2026. lib/legal is the original and governs; each of these says so
 * at the top of its page and links to it.
 *
 * A Record over every locale, so a language added to the site without a
 * translation here fails to compile instead of falling back to English
 * unannounced. legal.test.ts checks each one line for line against English.
 */
export const LEGAL_TRANSLATIONS: Record<Exclude<Locale, 'en'>, LegalEdition> = {
  ar,
  fr,
  es,
  pt,
  ru,
  zh,
  hi,
  bn,
  ur,
}
