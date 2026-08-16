import { describe, expect, it } from 'vitest'
import { externalLinkField } from './externalLink'

/**
 * Eight fields on a listing are rendered straight into an href and none were
 * validated. The failure that will actually happen is an editor typing
 * `www.hotel.com`, which a browser reads as a path on this site - so the
 * Website button on a paying advertiser's page 404s and looks fine in the admin.
 *
 * The failure that matters more is `javascript:` reaching a public page.
 */

const field = externalLinkField({ name: 'website' })

/** Payload hands validate a value plus context; only the value is read here. */
const check = (value: unknown) =>
  (field.validate as (v: unknown, ...rest: never[]) => true | string)(value)

const save = (value: unknown) => {
  const hook = field.hooks?.beforeChange?.[0] as (args: { value: unknown }) => unknown
  return hook({ value })
}

describe('externalLinkField validation', () => {
  it('accepts a full address', () => {
    expect(check('https://albergobeirut.com')).toBe(true)
    expect(check('http://example.com/menu?lang=en')).toBe(true)
  })

  it('accepts a bare domain, because that is how people write one', () => {
    expect(check('albergobeirut.com')).toBe(true)
    expect(check('www.hotel.com')).toBe(true)
  })

  it('accepts empty, since every one of these fields is optional', () => {
    expect(check('')).toBe(true)
    expect(check(null)).toBe(true)
    expect(check(undefined)).toBe(true)
  })

  it.each(['javascript:alert(1)', 'data:text/html,<script>', 'file:///etc/passwd'])(
    'refuses %o',
    (value) => {
      expect(check(value)).not.toBe(true)
    },
  )

  it('refuses a host that could never resolve for a reader', () => {
    expect(check('localhost:3000')).not.toBe(true)
    expect(check('intranet')).not.toBe(true)
  })

  it('tells the editor what to type rather than what was wrong', () => {
    expect(String(check('javascript:alert(1)'))).toMatch(/https:\/\/example\.com/)
  })
})

describe('externalLinkField normalisation on save', () => {
  /**
   * The point of storing the normalised form: what ends up in the database is
   * something a browser can use, not something that only looks like a URL.
   */
  it('adds the scheme a person leaves out', () => {
    expect(save('albergobeirut.com')).toBe('https://albergobeirut.com/')
    expect(save('www.hotel.com')).toBe('https://www.hotel.com/')
  })

  it('leaves a complete address alone apart from canonicalising it', () => {
    expect(save('https://albergobeirut.com/')).toBe('https://albergobeirut.com/')
  })

  it('preserves the path and query, which carry the booking reference', () => {
    expect(save('hotel.com/book?ref=vardenia')).toBe('https://hotel.com/book?ref=vardenia')
  })

  it('passes empty through untouched rather than inventing a value', () => {
    expect(save('')).toBe('')
    expect(save(null)).toBeNull()
    expect(save(undefined)).toBeUndefined()
  })

  /**
   * Never re-prefix a scheme we refuse: turning `javascript:alert(1)` into
   * `https://javascript:alert(1)` would hide the problem rather than surface
   * it. Validation rejects these first, so the raw value is only what a hook
   * that cannot destroy data returns.
   */
  it('does not disguise a refused scheme', () => {
    expect(save('javascript:alert(1)')).toBe('javascript:alert(1)')
  })
})

describe('externalLinkField shape', () => {
  it('carries the name through', () => {
    expect(externalLinkField({ name: 'menuUrl' }).name).toBe('menuUrl')
  })

  it('keeps a caller label and omits it otherwise', () => {
    expect(externalLinkField({ name: 'menuUrl', label: 'Menu link' }).label).toBe('Menu link')
    expect(externalLinkField({ name: 'menuUrl' }).label).toBeUndefined()
  })

  it('lets a caller override the placeholder without losing the rest', () => {
    const custom = externalLinkField({
      name: 'instagram',
      admin: { placeholder: 'https://instagram.com/yourhandle' },
    })

    expect(custom.admin?.placeholder).toBe('https://instagram.com/yourhandle')
  })
})
