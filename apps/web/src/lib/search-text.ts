/**
 * The text matching behind site search: fold a string to a comparable form, and
 * score how close two strings are.
 *
 * # Why this exists
 *
 * The old search was a SQL `LIKE`: the query had to appear verbatim. "resturant"
 * found nothing though the catalogue is full of restaurants, and "Beruit" found
 * nothing though half of it is in Beirut. On a phone, where autocorrect and haste
 * make typos the norm, a search that answers "nothing" to a near-miss reads as
 * broken. And it served Arabic no better than an accident: a word typed with or
 * without its diacritics, or with one of alef's forms, would miss.
 *
 * These two functions fix both. `normalizeForSearch` folds away the differences
 * that should not matter - case, Latin accents, Arabic harakat and the alef and
 * hamza variants - so a name and a query land on one form. `scoreMatch` then
 * measures closeness with trigram overlap and edit distance, so a typo scores
 * high rather than zero.
 *
 * # Why in JavaScript rather than the database
 *
 * Postgres has the `pg_trgm` extension and a GIN index for this, and it was long
 * assumed to be a drop-in replacement. It is not. Tried against the cases pinned
 * in search-text.test (September 2026, 1,277 published listings), pg_trgm's
 * operators missed "beruit" for Beirut and "byblso" for Byblos - trigrams alone
 * underrate a transposition, which is why `editSimilarity` exists - and missed
 * two of the three Arabic folding cases, a hamza on the alef and full harakat,
 * because it compares the code points as written.
 *
 * So in memory is still the right place, over a candidate set lib/search caches
 * per locale. Ranking in memory also keeps the draft filter where it belongs, in
 * Payload's access control. When the catalogue outgrows that, the way to use
 * pg_trgm without losing these is as a coarse filter over a column already folded
 * by `normalizeForSearch`, with this file still doing the ranking.
 */

/**
 * Below this, a match is more noise than signal. Real one- and two-letter typos
 * of the words people search score from about 0.6 up (a transposition is the
 * worst case and still clears it), so this sits well under them while cutting the
 * loose half-matches that a lower floor let through. Substring hits never reach
 * here - they score from 0.88.
 */
export const SIMILARITY_THRESHOLD = 0.45

// Built from escaped strings rather than regex literals so the code points stay
// visible in source; a literal here would be an invisible combining character.
const LATIN_MARKS = new RegExp('[\\u0300-\\u036f]', 'g')
// Arabic harakat, the combining hamza/madda that NFKD produces, superscript alef.
const ARABIC_MARKS = new RegExp('[\\u064b-\\u065f\\u0670]', 'g')
const TATWEEL = new RegExp('\\u0640', 'g')
const ALEF_MAKSURA = new RegExp('\\u0649', 'g') // -> ya (ي)
const TA_MARBUTA = new RegExp('\\u0629', 'g') // -> ha (ه)
const NON_WORD = /[^\p{L}\p{N}\s]/gu

/**
 * Fold a string to the form search compares against.
 *
 * NFKD decomposition does most of the Arabic work for free: alef-with-hamza,
 * alef-madda and the hamza-carrier letters each decompose to a base letter plus
 * a combining mark, so stripping the marks leaves the bare letter and two
 * spellings of the same name become one string. The two Arabic letters with no
 * decomposition - alef maksura and ta marbuta - are folded by hand to the forms
 * people most often substitute for them. Latin accents fall to the same strip.
 */
export function normalizeForSearch(input: string): string {
  return input
    .normalize('NFKD')
    .toLowerCase()
    .replace(LATIN_MARKS, '') // cafe with an accent -> cafe
    .replace(ARABIC_MARKS, '')
    .replace(TATWEEL, '') // a decorative stretch that carries no meaning
    .replace(ALEF_MAKSURA, 'ي')
    .replace(TA_MARBUTA, 'ه')
    .replace(NON_WORD, ' ') // any punctuation becomes a break
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * The set of trigrams in a string, space-padded so the first and last letters
 * carry the same weight as the middle ones. A string shorter than a trigram is
 * kept whole, so two-letter searches still compare.
 */
function trigrams(value: string): Set<string> {
  const set = new Set<string>()
  if (!value) return set
  if (value.length < 3) {
    set.add(value)
    return set
  }
  const padded = ` ${value} `
  for (let i = 0; i < padded.length - 2; i += 1) set.add(padded.slice(i, i + 3))
  return set
}

/** Dice coefficient over two trigram sets: 0 (nothing shared) to 1 (identical). */
function diceCoefficient(a: string, b: string): number {
  const first = trigrams(a)
  const second = trigrams(b)
  if (first.size === 0 || second.size === 0) return 0
  let shared = 0
  for (const gram of first) if (second.has(gram)) shared += 1
  return (2 * shared) / (first.size + second.size)
}

/**
 * Levenshtein edit distance, two rows of state. The rows are Int32Arrays so
 * their reads type as `number` under noUncheckedIndexedAccess; the indices here
 * are all provably in range.
 */
function editDistance(a: string, b: string): number {
  if (a === b) return 0
  if (!a.length) return b.length
  if (!b.length) return a.length

  const n = b.length
  let previous = new Int32Array(n + 1)
  let current = new Int32Array(n + 1)
  for (let j = 0; j <= n; j += 1) previous[j] = j

  for (let i = 1; i <= a.length; i += 1) {
    current[0] = i
    for (let j = 1; j <= n; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      const deletion = (previous[j] as number) + 1
      const insertion = (current[j - 1] as number) + 1
      const substitution = (previous[j - 1] as number) + cost
      current[j] = Math.min(deletion, insertion, substitution)
    }
    const swap = previous
    previous = current
    current = swap
  }
  return previous[n] as number
}

/**
 * Edit-distance similarity, 0 to 1. Trigrams alone underrate a transposition -
 * "beruit" for "beirut" shares almost no trigrams though it is one swap away - so
 * the two measures are taken together and the kinder wins.
 */
function editSimilarity(a: string, b: string): number {
  const longest = Math.max(a.length, b.length)
  if (longest === 0) return 0
  return 1 - editDistance(a, b) / longest
}

/** The better of trigram overlap and edit similarity. */
function fuzzy(a: string, b: string): number {
  return Math.max(diceCoefficient(a, b), editSimilarity(a, b))
}

/**
 * How well a query matches a field, from 0 to 1. Both are normalized first.
 *
 * A substring hit is treated as certain and graded by how much of the field it
 * is: an exact field scores 1, a prefix a shade less, a contained run less
 * again - so "gray" ranks "Le Gray" above a place that merely mentions grey. Only
 * when there is no substring hit does it fall back to fuzzy similarity, taken as
 * the best match against the whole field or any single word in it, so a typo in
 * one word of a long name still scores.
 */
export function scoreMatch(query: string, field: string): number {
  const q = normalizeForSearch(query)
  const f = normalizeForSearch(field)
  if (!q || !f) return 0

  if (f.includes(q)) {
    if (f === q) return 1
    if (f.startsWith(q)) return 0.96
    return 0.88
  }

  let best = fuzzy(q, f)
  for (const word of f.split(' ')) {
    if (!word) continue
    const score = fuzzy(q, word)
    if (score > best) best = score
  }
  return best
}

/**
 * The best score of a query against several fields (name and tagline, say),
 * which is how a listing that matches on either is ranked.
 */
export function bestFieldScore(query: string, fields: (string | null | undefined)[]): number {
  let best = 0
  for (const field of fields) {
    if (!field) continue
    const score = scoreMatch(query, field)
    if (score > best) best = score
  }
  return best
}
