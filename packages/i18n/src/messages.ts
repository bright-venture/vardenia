import type { Locale } from './index'

import en from './messages/en.json'
import ar from './messages/ar.json'

export type Messages = typeof en

/**
 * Message loader.
 *
 * The imports live here rather than in the consuming app on purpose: a dynamic
 * `import('@vardenia/i18n/messages/' + locale)` from outside the package forces
 * the bundler to resolve a subpath pattern it cannot statically analyse, and the
 * build fails. Keeping it inside the package keeps the paths relative and static.
 *
 * Both catalogues are small and always shipped, so an explicit map beats lazy
 * loading - one fewer request on a mobile connection in a hotel lobby.
 *
 * # English is the fallback
 *
 * Only the translated locales have a catalogue here. Every other supported locale
 * (see LOCALES) resolves to English, so its pages render in English rather than
 * throwing on a missing catalogue. Writing a translation is then two steps and no
 * code change: add `xx.json` beside these, and add it to the map below. A partial
 * file would need a deep merge over English here; none exists yet, so this stays a
 * plain lookup with a fallback.
 */
const CATALOGUES: Partial<Record<Locale, Messages>> = { en, ar: ar as Messages }

export function getMessages(locale: Locale): Messages {
  return CATALOGUES[locale] ?? en
}
