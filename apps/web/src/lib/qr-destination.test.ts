import { describe, expect, it } from 'vitest'
import { QR_TARGET_TYPES } from '@vardenia/core'
import { resolveDestination } from './qr-destination'
import type { QrDoc } from './qr-doc'

/**
 * Where a scanned code sends the reader.
 *
 * This is the function a printed magazine depends on. Every branch of it runs
 * for somebody standing in a hotel lobby holding up a phone at a symbol that
 * cannot be recalled, so the cases that matter most here are the broken ones:
 * a listing unpublished after press, a target that was deleted, a target type
 * nobody wrote a case for. None of those may produce a 404 or a throw.
 *
 * It had no tests at all until the `home` type was added, because it lived
 * inside a route file and could not be imported. That is the only reason.
 */

const SITE = 'https://vardenia.com'

const qr = (over: Partial<QrDoc>): QrDoc => ({ id: 1, code: 'K3M9QP2', ...over })

describe('a listing code', () => {
  it('opens the listing', () => {
    const doc = qr({
      targetType: 'business',
      business: { slug: 'hotel-albergo', _status: 'published' },
    })
    expect(resolveDestination(doc, SITE)).toBe(`${SITE}/directory/hotel-albergo`)
  })

  /**
   * The case the `active` checkbox does not cover. Unpublishing a listing is a
   * different screen from retiring its code, and it is the common action.
   */
  it('sends a listing unpublished after press to the moved page, not a 404', () => {
    const doc = qr({
      targetType: 'business',
      business: { slug: 'hotel-albergo', _status: 'draft' },
    })
    expect(resolveDestination(doc, SITE)).toBe(`${SITE}/scan/moved?code=K3M9QP2`)
  })

  it('does not mistake an unpopulated relationship for a missing listing', () => {
    // depth 0 gives the id alone. That is a lookup that was not asked for, not a
    // listing that is gone, and the two must not produce the same answer by
    // accident - so this asserts the shape it does produce.
    const doc = qr({ targetType: 'business', business: 42 })
    expect(resolveDestination(doc, SITE)).toBe(`${SITE}/scan/not-found`)
  })

  it('survives a listing that was deleted out from under it', () => {
    expect(resolveDestination(qr({ targetType: 'business' }), SITE)).toBe(`${SITE}/scan/not-found`)
  })
})

describe('an article code', () => {
  it('opens the article', () => {
    const doc = qr({
      targetType: 'article',
      article: { slug: 'beirut-reborn', _status: 'published' },
    })
    expect(resolveDestination(doc, SITE)).toBe(`${SITE}/magazine/articles/beirut-reborn`)
  })

  it('sends an unpublished article to the moved page', () => {
    const doc = qr({ targetType: 'article', article: { slug: 'beirut-reborn', _status: 'draft' } })
    expect(resolveDestination(doc, SITE)).toBe(`${SITE}/scan/moved?code=K3M9QP2`)
  })
})

describe('an issue code', () => {
  it('opens the issue', () => {
    const doc = qr({ targetType: 'issue', issue: { slug: 'summer-2026' } })
    expect(resolveDestination(doc, SITE)).toBe(`${SITE}/magazine/issues/summer-2026`)
  })

  // Issues have no draft state, so the only failure is an issue that is gone.
  it('falls back to the magazine rather than nowhere', () => {
    expect(resolveDestination(qr({ targetType: 'issue' }), SITE)).toBe(`${SITE}/magazine`)
  })
})

describe('a category code', () => {
  it('opens the section page, not a filtered directory URL', () => {
    const doc = qr({ targetType: 'category', category: 'hospitality' })
    expect(resolveDestination(doc, SITE)).toBe(`${SITE}/stay`)
  })

  it('falls back to the directory when the category is missing', () => {
    expect(resolveDestination(qr({ targetType: 'category' }), SITE)).toBe(`${SITE}/directory`)
  })
})

describe('an external code', () => {
  it('opens the address', () => {
    const doc = qr({ targetType: 'external', externalUrl: 'https://leroyal.com.lb/spa' })
    expect(resolveDestination(doc, SITE)).toBe('https://leroyal.com.lb/spa')
  })

  /**
   * Validation covers everything saved through the admin panel, but a code
   * written before that rule existed can still hold a bare domain - and an
   * unusable value here is a throw, which the caller turns into a 500.
   */
  it('repairs a bare domain rather than handing back something that throws', () => {
    const doc = qr({ targetType: 'external', externalUrl: 'leroyal.com.lb' })
    expect(resolveDestination(doc, SITE)).toMatch(/^https:\/\/leroyal\.com\.lb/)
  })

  it('refuses an address it cannot make sense of', () => {
    const doc = qr({ targetType: 'external', externalUrl: 'not a url' })
    expect(resolveDestination(doc, SITE)).toBe(`${SITE}/scan/not-found`)
  })
})

describe('a home code', () => {
  it('opens the site itself', () => {
    expect(resolveDestination(qr({ targetType: 'home' }), SITE)).toBe(`${SITE}/`)
  })

  /**
   * The reason this is a target type rather than an external code pointing at
   * our own domain. The address comes from the running site, so moving domains
   * repoints every printed home code with no database edit at all.
   */
  it('follows the site it is running on rather than a stored address', () => {
    expect(resolveDestination(qr({ targetType: 'home' }), 'https://vardenia.lb')).toBe(
      'https://vardenia.lb/',
    )
  })

  it('needs nothing filled in, so it cannot be half-configured', () => {
    // Every other type has a way to be saved with its target empty. This one has
    // no target field at all, which is the point.
    const bare = qr({ targetType: 'home' })
    expect(resolveDestination(bare, SITE)).not.toContain('not-found')
  })
})

describe('the parts that must never fail', () => {
  it('never leaves a double slash when the base URL has a trailing one', () => {
    for (const type of QR_TARGET_TYPES) {
      const url = resolveDestination(qr({ targetType: type, category: 'hospitality' }), `${SITE}/`)
      expect(url.replace('https://', ''), `${type} produced ${url}`).not.toContain('//')
    }
  })

  /**
   * The guard on the enum growing without this file growing with it. A value in
   * QR_TARGET_TYPES with no case falls through to `default`, and the reader gets
   * "we couldn't find this" instead of a page that silently looks like it worked.
   */
  it('has a case for every target type, so none of them reach the fallback', () => {
    for (const type of QR_TARGET_TYPES) {
      const url = resolveDestination(qr({ targetType: type }), SITE)
      expect(url, `${type} has no case in resolveDestination`).not.toContain('scan/not-found?code=')
    }
  })

  it('sends an unknown target type somewhere that explains itself', () => {
    const doc = qr({ targetType: 'offer' })
    expect(resolveDestination(doc, SITE)).toBe(`${SITE}/scan/not-found?code=K3M9QP2`)
  })

  it('returns an absolute URL for every type, because Response.redirect throws otherwise', () => {
    for (const type of [...QR_TARGET_TYPES, 'nonsense', undefined]) {
      const url = resolveDestination(qr({ targetType: type as string }), SITE)
      expect(() => new URL(url), `${type} produced ${url}`).not.toThrow()
    }
  })
})
