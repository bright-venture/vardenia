/**
 * Slug field with auto-generation.
 *
 * Slugs are NOT localized. One listing = one URL, with `?lang=` or a locale
 * prefix switching the copy. Localized slugs would mean an Arabic URL and an
 * English URL for the same hotel, splitting SEO authority and - worse - making
 * the printed QR destination ambiguous.
 */

import type { Field } from 'payload'

export function slugify(input: string): string {
  return (
    input
      .normalize('NFKD')
      // Strip combining accent marks left behind by NFKD, so "Byblos Cafe"
      // and "Byblos Cafe" with an acute accent produce the same slug.
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/[\s_-]+/g, '-')
      .replace(/^-+|-+$/g, '')
  )
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
        const source = (data?.[sourceField] ?? originalDoc?.[sourceField]) as unknown
        // Localized source fields arrive as an object keyed by locale.
        const text =
          typeof source === 'string'
            ? source
            : typeof source === 'object' && source !== null
              ? ((source as Record<string, string>).en ?? Object.values(source)[0])
              : undefined
        return text ? slugify(text) : value
      },
    ],
  },
})
