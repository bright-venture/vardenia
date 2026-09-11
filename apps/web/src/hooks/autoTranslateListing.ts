import type { CollectionAfterChangeHook } from 'payload'
import { LOCALES, DEFAULT_LOCALE } from '@vardenia/i18n'
import { translationConfigured, translateText, translateRichText } from '../lib/translate'

/**
 * Fills a listing's tagline and description in the machine-translated locales
 * when its English source is written.
 *
 * # What it does, and the four rules that keep it safe
 *
 * 1. **English only.** It runs when the English (default-locale) source changes,
 *    never when a translation tab is saved - otherwise editing the French copy
 *    would trigger eight more translations off itself.
 * 2. **No self-trigger.** The per-locale writes it makes carry
 *    `context.skipAutoTranslate`, and the hook returns early when it sees it, so
 *    it cannot recurse into its own updates.
 * 3. **Never clobbers a human.** A target locale is filled only when it is
 *    empty. A description someone translated by hand is left exactly as it is;
 *    to refresh a machine one, clear the field and save the English again.
 * 4. **Off unless configured.** With no `LIBRETRANSLATE_URL` it is a no-op, so
 *    the CMS behaves as before until an engine is pointed at it. See lib/translate.
 *
 * Arabic is deliberately not a target: it is the editorial second language,
 * written by people, not filled from English.
 *
 * The translations are machine output and are worth a native review; this only
 * puts them in place so a new listing is not English-only in eight languages the
 * moment it is published.
 */

const TARGETS = LOCALES.filter(
  (locale) => locale !== 'en' && locale !== DEFAULT_LOCALE && locale !== 'ar',
)

const richIsEmpty = (value: unknown): boolean => {
  if (!value || typeof value !== 'object') return true
  const json = JSON.stringify(value)
  // A Lexical value with no non-empty text node reads as empty for our purpose.
  return !/"text":"[^"]/.test(json)
}

export const autoTranslateListing: CollectionAfterChangeHook = async ({
  doc,
  previousDoc,
  req,
  context,
}) => {
  if (!translationConfigured()) return doc
  if (context?.skipAutoTranslate) return doc
  // Only when the English source is what changed. A translation-tab save has a
  // non-default req.locale and must not translate off a translation.
  if (req.locale && req.locale !== DEFAULT_LOCALE) return doc

  const taglineSource = typeof doc.tagline === 'string' ? doc.tagline : ''
  const descriptionSource = doc.description
  const taglineChanged = taglineSource !== (previousDoc?.tagline ?? '')
  const descriptionChanged =
    JSON.stringify(descriptionSource ?? null) !== JSON.stringify(previousDoc?.description ?? null)

  if (
    (!taglineChanged || !taglineSource) &&
    (!descriptionChanged || richIsEmpty(descriptionSource))
  ) {
    return doc
  }

  // One read of every locale's current values, so we only fill what is empty.
  const current = (await req.payload.findByID({
    collection: 'businesses',
    id: doc.id,
    locale: 'all',
    depth: 0,
    overrideAccess: true,
    req,
  })) as { tagline?: Record<string, string>; description?: Record<string, unknown> }

  for (const target of TARGETS) {
    const data: Record<string, unknown> = {}

    try {
      if (taglineChanged && taglineSource && !current.tagline?.[target]) {
        const translated = await translateText(taglineSource, DEFAULT_LOCALE, target)
        if (translated) data.tagline = translated
      }
      if (
        descriptionChanged &&
        !richIsEmpty(descriptionSource) &&
        richIsEmpty(current.description?.[target])
      ) {
        const translated = await translateRichText(descriptionSource, DEFAULT_LOCALE, target)
        if (translated) data.description = translated
      }

      if (Object.keys(data).length === 0) continue

      await req.payload.update({
        collection: 'businesses',
        id: doc.id,
        locale: target,
        data,
        depth: 0,
        overrideAccess: true,
        context: { skipAutoTranslate: true },
        req,
      })
    } catch (error) {
      req.payload.logger.error(`autoTranslate ${doc.id} [${target}]: ${(error as Error).message}`)
    }
  }

  return doc
}
