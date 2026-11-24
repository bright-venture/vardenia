import type { Where } from 'payload'
import { normaliseLebanesePhone } from './lebanese-phone'

/**
 * Finding a submission by the owner's phone, however either side was typed.
 *
 * # Design
 *
 * Owners type their number every way there is (`03 123 456`, `+961 3 123 456`,
 * `0096103123456`), and the admin search is a plain "contains" match on text
 * columns. Matching `03 123 456` against a stored `+961 3 123 456` therefore
 * cannot work on the raw text, in either direction.
 *
 * So two things are done, both with the one normaliser the payment check
 * already uses (lib/lebanese-phone):
 *
 * 1. On every save, a staff-only `submission.ownerPhoneSearch` holds the number
 *    in the normalised national shape (`03123456`). Written by
 *    hooks/syncOwnerPhoneSearch. A number that is not Lebanese keeps only its
 *    digits, so it is still searchable.
 * 2. On every staff search, the term aimed at that column is normalised the
 *    same way before the query runs (hooks/staffSearch). A part of a number
 *    ("123 456") that cannot be normalised falls back to its digits.
 *
 * The raw `ownerPhone` stays in the searched fields as well, for older rows
 * saved before the column existed.
 */

/** What is stored for searching: national form, or bare digits for anything else. */
export function phoneSearchValue(input: unknown): string | null {
  if (typeof input !== 'string') return null
  const normalised = normaliseLebanesePhone(input)
  if (normalised) return normalised
  const digits = input.replace(/\D/g, '')
  return digits.length > 0 ? digits : null
}

/**
 * The term to look for in the phone column. Text with letters is not a phone
 * search and is passed through unchanged (it simply matches nothing there).
 */
export function phoneSearchTerm(term: string): string {
  const trimmed = term.trim()
  if (!/^[+\d\s().-]+$/.test(trimmed)) return term
  return phoneSearchValue(trimmed) ?? term
}

const PHONE_FIELD = 'submission.ownerPhoneSearch'
const NUMBER_FIELD = 'listingNumber'

type Clause = Record<string, unknown>

const likeOf = (clause: Clause, field: string): string | null => {
  const condition = clause[field] as { like?: unknown } | undefined
  return typeof condition?.like === 'string' ? condition.like : null
}

/**
 * Makes the admin's search term mean the right thing for the two columns that
 * need help. The admin builds the search as `or: [{ field: { like: term } }]`
 * over listSearchableFields; this rewrites that and nothing else.
 *
 * - The phone column gets the normalised term.
 * - The page number is a number column. Payload turns `like` on a number into
 *   `equals`, and a term that is not a number (a name, VD-123) then becomes
 *   "is empty", which would list every unnumbered listing. So a number clause
 *   is kept only for a whole-number term, and removed otherwise.
 *
 * Returns the same object when there is nothing to rewrite.
 */
export function rewriteStaffSearch(where: Where | undefined): Where | undefined {
  if (!where || typeof where !== 'object') return where
  let changed = false

  const walk = (node: Where): Where => {
    const next: Record<string, unknown> = { ...node }
    for (const key of ['and', 'or'] as const) {
      const list = node[key]
      if (!Array.isArray(list)) continue
      const rewritten: Where[] = []
      for (const item of list) {
        const phone = likeOf(item as Clause, PHONE_FIELD)
        const number = likeOf(item as Clause, NUMBER_FIELD)
        if (phone !== null) {
          const term = phoneSearchTerm(phone)
          if (term !== phone) changed = true
          rewritten.push({ [PHONE_FIELD]: { like: term } })
        } else if (number !== null) {
          changed = true
          if (/^\s*\d{1,9}\s*$/.test(number)) {
            rewritten.push({ [NUMBER_FIELD]: { equals: Number(number) } })
          }
          // else: dropped, see above
        } else {
          rewritten.push(walk(item))
        }
      }
      // An `or` left empty would match everything; keep a clause that matches nothing.
      next[key] = rewritten.length > 0 ? rewritten : [{ id: { equals: 0 } }]
    }
    return next as Where
  }

  const result = walk(where)
  return changed ? result : where
}
