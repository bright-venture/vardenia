/**
 * Slug field with auto-generation.
 *
 * Slugs are NOT localized. One listing = one URL, with `?lang=` or a locale
 * prefix switching the copy. Localized slugs would mean an Arabic URL and an
 * English URL for the same hotel, splitting SEO authority and - worse - making
 * the printed QR destination ambiguous.
 */

import type { Field } from 'payload'

/**
 * Arabic to Latin, roughly. Not a scholarly romanisation.
 *
 * The job here is a stable, typeable, URL-safe string - not something a linguist
 * would sign off. `مطعم بيروت` becoming `mtam-byrwt` is ugly, and it is still
 * enormously better than what happened before this existed: every Arabic
 * character was stripped, the slug came out empty, and because the field is
 * required the editor got a validation error that never mentioned the real
 * cause. On a bilingual Lebanese product that is not an edge case.
 *
 * Emphatic and plain consonants collapse to the same letter (ص and س both `s`),
 * which can collide. The slug field is `unique`, so a collision surfaces as a
 * save error the editor can resolve by typing a slug, rather than as two
 * listings quietly sharing a URL.
 */
const ARABIC_MAP: Record<string, string> = {
  ا: 'a',
  أ: 'a',
  إ: 'i',
  آ: 'a',
  ب: 'b',
  ت: 't',
  ث: 'th',
  ج: 'j',
  ح: 'h',
  خ: 'kh',
  د: 'd',
  ذ: 'dh',
  ر: 'r',
  ز: 'z',
  س: 's',
  ش: 'sh',
  ص: 's',
  ض: 'd',
  ط: 't',
  ظ: 'z',
  ع: 'a',
  غ: 'gh',
  ف: 'f',
  ق: 'q',
  ك: 'k',
  ل: 'l',
  م: 'm',
  ن: 'n',
  ه: 'h',
  ة: 'a',
  و: 'w',
  ؤ: 'w',
  ي: 'y',
  ئ: 'y',
  ى: 'a',
  ء: '',
  لا: 'la',
  '٠': '0',
  '١': '1',
  '٢': '2',
  '٣': '3',
  '٤': '4',
  '٥': '5',
  '٦': '6',
  '٧': '7',
  '٨': '8',
  '٩': '9',
}

/** Harakat and other combining marks carry no information in a URL. */
const ARABIC_DIACRITICS = /[ً-ْٰـ]/g

function transliterateArabic(input: string): string {
  return input
    .replace(ARABIC_DIACRITICS, '')
    .split('')
    .map((char) => ARABIC_MAP[char] ?? char)
    .join('')
}

/** Strip to the URL-safe subset. Returns '' when nothing survives. */
function toLatinSlug(input: string): string {
  return (
    input
      .normalize('NFKD')
      // Strip combining accent marks left behind by NFKD, so "Byblos Cafe"
      // and "Byblos Cafe" with an acute accent produce the same slug.
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/[\s_-]+/g, '-')
      .replace(/^-+|-+$/g, '')
  )
}

/**
 * Latin first, then transliteration for anything left.
 *
 * Trying Latin first keeps "Café 33" as `cafe-33` rather than routing it through
 * a map it does not need.
 */
export function slugify(input: string): string {
  const direct = toLatinSlug(input)
  if (direct) return direct
  return toLatinSlug(transliterateArabic(input))
}

/**
 * Last resort when a title yields nothing at all - a script we do not
 * transliterate, or a name made entirely of punctuation.
 *
 * A generated slug is poor, but it saves. Failing the save instead would block
 * an editor on a required field with no way to satisfy it.
 */
function fallbackSlug(): string {
  return `item-${Math.random().toString(36).slice(2, 8)}`
}

/** Prefer English, then any other locale that actually has text. */
function textFrom(source: unknown): string | undefined {
  if (typeof source === 'string') return source || undefined
  if (typeof source !== 'object' || source === null) return undefined

  const values = source as Record<string, unknown>
  const candidates = [values.en, ...Object.values(values)]
  return candidates.find((v): v is string => typeof v === 'string' && v.trim().length > 0)
}

export const slugField = (sourceField = 'name'): Field => ({
  name: 'slug',
  type: 'text',
  required: true,
  unique: true,
  index: true,
  admin: {
    position: 'sidebar',
    description: 'Permanent URL segment. Changing it breaks existing links and printed QR codes.',
  },
  hooks: {
    beforeValidate: [
      ({ value, originalDoc, data }) => {
        if (typeof value === 'string' && value.length > 0) return slugify(value)

        // Never regenerate over an existing slug: it is the printed destination.
        if (typeof originalDoc?.slug === 'string' && originalDoc.slug.length > 0) {
          return originalDoc.slug
        }

        const text = textFrom(data?.[sourceField] ?? originalDoc?.[sourceField])
        if (!text) return value

        return slugify(text) || fallbackSlug()
      },
    ],
  },
})
