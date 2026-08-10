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
 */
const CATALOGUES: Record<Locale, Messages> = { en, ar: ar as Messages }

export function getMessages(locale: Locale): Messages {
  return CATALOGUES[locale]
}
