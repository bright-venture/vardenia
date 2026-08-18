import { describe, expect, it } from 'vitest'
import { allowedOrigins, counterpartOrigin, toOrigin } from './origins'

/**
 * The list behind `cors` and `csrf`.
 *
 * Since accounts exist, the csrf half of this is what stops a page on another
 * site making a request that carries a customer's or an owner's auth cookie. So
 * the tests that matter most are the ones proving nothing widens the list by
 * accident - a wildcard, a path-bearing value, an empty string turning into
 * "allow everything".
 */

describe('toOrigin', () => {
  it('keeps scheme, host and port', () => {
    expect(toOrigin('https://vardenia.com')).toBe('https://vardenia.com')
    expect(toOrigin('http://localhost:3000')).toBe('http://localhost:3000')
  })

  /**
   * The one that bites. Payload compares the Origin header literally, and a
   * value typed into a hosting dashboard eventually arrives with a slash - so a
   * trailing slash would mean every authenticated request is refused for
   * reasons that look nothing like a typo.
   */
  it('strips a trailing slash', () => {
    expect(toOrigin('https://vardenia.com/')).toBe('https://vardenia.com')
  })

  it('strips a path, query and fragment', () => {
    expect(toOrigin('https://vardenia.com/admin')).toBe('https://vardenia.com')
    expect(toOrigin('https://vardenia.com/?x=1#y')).toBe('https://vardenia.com')
  })

  it('tolerates surrounding whitespace, which a comma-separated list produces', () => {
    expect(toOrigin('  https://vardenia.com  ')).toBe('https://vardenia.com')
  })

  it('keeps a non-default port, which is part of the origin', () => {
    expect(toOrigin('http://localhost:8888')).toBe('http://localhost:8888')
  })

  it.each([undefined, null, '', '   ', 'vardenia.com', 'not a url', '//vardenia.com'])(
    'returns null for %o rather than something permissive',
    (value) => {
      expect(toOrigin(value)).toBeNull()
    },
  )

  /** Only http and https. A javascript: or data: origin is never ours. */
  it.each(['javascript:alert(1)', 'data:text/html,x', 'file:///etc/passwd', 'ftp://vardenia.com'])(
    'refuses the %o scheme',
    (value) => {
      expect(toOrigin(value)).toBeNull()
    },
  )
})

describe('counterpartOrigin', () => {
  it('pairs apex with www', () => {
    expect(counterpartOrigin('https://vardenia.com')).toBe('https://www.vardenia.com')
  })

  it('pairs www with apex', () => {
    expect(counterpartOrigin('https://www.vardenia.com')).toBe('https://vardenia.com')
  })

  it('keeps the scheme and port', () => {
    expect(counterpartOrigin('http://vardenia.com:3000')).toBe('http://www.vardenia.com:3000')
  })

  /**
   * Guessing beyond one level would invent origins. `vardenia.netlify.app` has
   * no meaningful www counterpart, and `www.vardenia.netlify.app` is not ours.
   */
  it.each([
    'https://vardenia.netlify.app',
    'https://staging.vardenia.com',
    'http://localhost:3000',
  ])('does not invent a counterpart for %o', (origin) => {
    expect(counterpartOrigin(origin)).toBeNull()
  })
})

describe('allowedOrigins', () => {
  it('includes the site and its www counterpart', () => {
    expect(allowedOrigins('https://vardenia.com', undefined)).toEqual([
      'https://vardenia.com',
      'https://www.vardenia.com',
    ])
  })

  it('adds extra origins from the environment', () => {
    const origins = allowedOrigins('https://vardenia.com', 'https://vardenia.netlify.app')
    expect(origins).toContain('https://vardenia.netlify.app')
    expect(origins).toContain('https://vardenia.com')
  })

  it('accepts a comma-separated list with untidy spacing', () => {
    const origins = allowedOrigins(
      'https://vardenia.com',
      ' https://a.example.com , https://b.example.com/ ',
    )
    expect(origins).toContain('https://a.example.com')
    expect(origins).toContain('https://b.example.com')
  })

  it('drops unusable entries instead of failing or widening', () => {
    const origins = allowedOrigins('https://vardenia.com', 'nonsense,,   ,javascript:alert(1)')
    expect(origins).toEqual(['https://vardenia.com', 'https://www.vardenia.com'])
  })

  it('never repeats an origin', () => {
    const origins = allowedOrigins(
      'https://vardenia.com',
      'https://vardenia.com,https://www.vardenia.com/',
    )
    expect(origins).toEqual([...new Set(origins)])
    expect(origins).toHaveLength(2)
  })

  /**
   * The whole point. Payload accepts '*' and it is the wrong answer once a
   * cookie is involved: it would let any site make requests as a logged-in
   * customer.
   */
  it('never returns a wildcard, whatever it is given', () => {
    for (const input of [undefined, null, '', '*', 'https://vardenia.com']) {
      const origins = allowedOrigins(input, '*')
      expect(origins).not.toContain('*')
    }
  })

  /** A misconfigured build must still serve its own admin panel. */
  it('falls back to localhost rather than an empty list', () => {
    expect(allowedOrigins(undefined, undefined)).toEqual(['http://localhost:3000'])
    expect(allowedOrigins('', '')).toEqual(['http://localhost:3000'])
    expect(allowedOrigins('nonsense', 'also nonsense')).toEqual(['http://localhost:3000'])
  })

  it('does not add localhost once a real origin is present', () => {
    expect(allowedOrigins('https://vardenia.com', undefined)).not.toContain('http://localhost:3000')
  })
})
