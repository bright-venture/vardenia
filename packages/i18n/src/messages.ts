import type { Locale } from './index'

import en from './messages/en.json'
import ar from './messages/ar.json'
import fr from './messages/fr.json'
import es from './messages/es.json'
import pt from './messages/pt.json'
import ru from './messages/ru.json'
import zh from './messages/zh.json'
import hi from './messages/hi.json'
import bn from './messages/bn.json'
import ur from './messages/ur.json'

export type Messages = typeof en

/**
 * Message loader.
 *
 * The imports live here rather than in the consuming app on purpose: a dynamic
 * `import('@vardenia/i18n/messages/' + locale)` from outside the package forces
 * the bundler to resolve a subpath pattern it cannot statically analyse, and the
 * build fails. Keeping it inside the package keeps the paths relative and static.
 *
 * The catalogues are small and always shipped, so an explicit map beats lazy
 * loading - one fewer request on a mobile connection in a hotel lobby.
 *
 * # Every locale is translated; English is still the fallback
 *
 * All ten locales in LOCALES now have a catalogue, so the UI reads in the
 * reader's language throughout. `getMessages` still falls back to English if a
 * locale is ever missing here (for example a new locale added to LOCALES before
 * its file lands), so a page renders in English rather than throwing.
 *
 * Each non-English JSON is cast to `Messages`: a JSON import is typed by its
 * literal string values, so `fr.title` is the type `"Vardenia - Découvrez le
 * Liban"`, not `string`, and would not be assignable to English's literal
 * without the cast. The cast means TypeScript does not check key parity here, so
 * parity is guarded by the check in `scripts/` and the shared `Messages` type at
 * every call site instead.
 *
 * # A note for whoever reads zh, hi, bn or ru on the site
 *
 * Those four carry scripts the loaded fonts do not fully cover. Their catalogues
 * are correct, but a face for each script still has to be added in
 * apps/web/src/app/fonts.ts before the text renders cleanly rather than as
 * fallback glyphs. The Latin locales (en, es, fr, pt) and the Arabic-script ones
 * (ar, ur) already have their fonts.
 */
const CATALOGUES: Partial<Record<Locale, Messages>> = {
  en,
  ar: ar as Messages,
  fr: fr as Messages,
  es: es as Messages,
  pt: pt as Messages,
  ru: ru as Messages,
  zh: zh as Messages,
  hi: hi as Messages,
  bn: bn as Messages,
  ur: ur as Messages,
}

export function getMessages(locale: Locale): Messages {
  return CATALOGUES[locale] ?? en
}
