import type { CollectionAfterChangeHook } from 'payload'
import { LOCALES, DEFAULT_LOCALE } from '@vardenia/i18n'
import {
  TranslateHttpError,
  translationConfigured,
  translateText,
  translateRichText,
} from '../lib/translate'
import { reportError } from '../lib/report'

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
 *
 * # Bounded, because partners save too (Task 3, 20 November 2026)
 *
 * A partner's dashboard edit runs this like a staff save, inside their request.
 * It costs nothing unless the English tagline or description changed and a
 * target is still empty, so a partner editing an already translated listing
 * pays one database read and no translation. On top of the four rules:
 *
 * 5. **Stops when the engine is unreachable** (a timeout or a network error)
 *    for the rest of this save, instead of waiting on a dead engine once per
 *    language. An error status for one language pair moves on to the next.
 *    The empty targets are tried again on the next English save.
 * 6. **Refuses a huge description**: more than MAX_DESCRIPTION_TEXT_NODES text
 *    nodes is not machine-translated at all (one request per node per
 *    language). lib/translate also puts a timeout on each request.
 * 7. **Never fails the save**: reading the current values is caught like the
 *    writes, and logged. An error that is not the engine's (a bug, a failed
 *    write) goes to reportError, and the next language is tried.
 * 8. **One budget per save**: TRANSLATE_BUDGET_MS of wall time and
 *    MAX_TRANSLATED_CHARS_PER_SAVE characters across all languages; each
 *    request also gets the remaining time as its timeout, and lib/translate
 *    skips a single text node over MAX_TEXT_CHARS.
 */

/**
 * A timeout (ours or fetch's), an abort, or a network failure: the engine is
 * out of reach and the rest of this save is not worth waiting on. Undici
 * reports a network failure as `TypeError('fetch failed')`; any other
 * TypeError is a bug in our code and is not counted here.
 */
const engineUnreachable = (error: unknown): boolean => {
  const name = (error as { name?: unknown } | null)?.name
  if (name === 'TimeoutError' || name === 'AbortError') return true
  return error instanceof TypeError && error.message === 'fetch failed'
}

/**
 * One deadline for the whole save. The hook runs inside the save's request
 * and transaction, so the transaction stays open while it translates; this
 * bounds that, whatever the engine and the description do. Languages not
 * reached stay empty (the listing falls back to English) and are filled on
 * the next English save.
 */
export const TRANSLATE_BUDGET_MS = 20_000

/** Characters sent to the engine per save, across all languages. */
export const MAX_TRANSLATED_CHARS_PER_SAVE = 30_000

/** Characters a rich text value would send, summed over its text nodes. */
const richTextChars = (value: unknown): number => {
  if (!value || typeof value !== 'object') return 0
  const node = value as { type?: unknown; text?: unknown; children?: unknown; root?: unknown }
  let total = node.type === 'text' && typeof node.text === 'string' ? node.text.length : 0
  if (node.root) total += richTextChars(node.root)
  if (Array.isArray(node.children)) for (const child of node.children) total += richTextChars(child)
  return total
}

/** Text nodes in a description beyond which it is not machine-translated. */
export const MAX_DESCRIPTION_TEXT_NODES = 100

const countTextNodes = (value: unknown): number => {
  if (!value || typeof value !== 'object') return 0
  const node = value as { type?: unknown; text?: unknown; children?: unknown; root?: unknown }
  let count = node.type === 'text' && typeof node.text === 'string' ? 1 : 0
  if (node.root) count += countTextNodes(node.root)
  if (Array.isArray(node.children)) {
    for (const child of node.children) count += countTextNodes(child)
  }
  return count
}

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
    JSON.stringify(descriptionSource ?? null) !==
      JSON.stringify(previousDoc?.description ?? null) &&
    countTextNodes(descriptionSource) <= MAX_DESCRIPTION_TEXT_NODES

  if (
    (!taglineChanged || !taglineSource) &&
    (!descriptionChanged || richIsEmpty(descriptionSource))
  ) {
    return doc
  }

  // One read of every locale's current values, so we only fill what is empty.
  let current: { tagline?: Record<string, string>; description?: Record<string, unknown> }
  try {
    current = (await req.payload.findByID({
      collection: 'businesses',
      id: doc.id,
      locale: 'all',
      depth: 0,
      overrideAccess: true,
      req,
    })) as typeof current
  } catch (error) {
    req.payload.logger.error(`autoTranslate ${doc.id}: ${(error as Error).message}`)
    return doc
  }

  const deadline = Date.now() + TRANSLATE_BUDGET_MS
  let charsSent = 0

  for (const target of TARGETS) {
    const data: Record<string, unknown> = {}

    const wantsTagline = Boolean(taglineChanged && taglineSource && !current.tagline?.[target])
    const wantsDescription =
      descriptionChanged &&
      !richIsEmpty(descriptionSource) &&
      richIsEmpty(current.description?.[target])
    if (!wantsTagline && !wantsDescription) continue

    // Rule 8: one deadline and one character budget for the whole save.
    const cost =
      (wantsTagline ? taglineSource.length : 0) +
      (wantsDescription ? richTextChars(descriptionSource) : 0)
    if (Date.now() >= deadline || charsSent + cost > MAX_TRANSLATED_CHARS_PER_SAVE) {
      req.payload.logger.error(
        `autoTranslate ${doc.id}: budget for this save used up at [${target}]; the rest stay untranslated`,
      )
      break
    }
    charsSent += cost

    try {
      if (wantsTagline) {
        const translated = await translateText(taglineSource, DEFAULT_LOCALE, target, { deadline })
        // The tagline field is capped at 120 chars; a translation can run longer.
        if (translated)
          data.tagline =
            translated.length > 120 ? `${translated.slice(0, 119).trimEnd()}…` : translated
      }
      if (wantsDescription) {
        const translated = await translateRichText(descriptionSource, DEFAULT_LOCALE, target, {
          deadline,
        })
        if (translated) data.description = translated
      }

      if (Object.keys(data).length === 0) continue

      // `name` is a required localized field, so a per-locale update must carry
      // it or validation rejects the write. Names are proper nouns and stay
      // English; this keeps the English name in the target locale's slot.
      if (typeof doc.name === 'string') data.name = doc.name

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
      // Rule 5: an engine that is down or too slow, or the save's deadline,
      // ends this save's translating. A refusal for one language pair (an
      // error status) does not: the next language may well have a model.
      if (engineUnreachable(error)) break
      // Anything else is not the engine: a bug, or a failed write. Reported
      // to the error log so it is seen, then the next language is tried. Not
      // rethrown: the listing itself has saved and must stay saved.
      if (!(error instanceof TranslateHttpError)) {
        void reportError(error, {
          source: 'autoTranslateListing',
          extra: { listing: doc.id, target },
        })
      }
    }
  }

  return doc
}
