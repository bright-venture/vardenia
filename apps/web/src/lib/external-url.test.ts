import { describe, expect, it } from 'vitest'
import { normalizeExternalUrl } from './external-url'

describe('normalizeExternalUrl', () => {
  it('accepts a full https address unchanged in substance', () => {
    expect(normalizeExternalUrl('https://vardenia.com/offers')).toBe('https://vardenia.com/offers')
  })

  it('accepts http, since not every partner has TLS', () => {
    expect(normalizeExternalUrl('http://example.com')).toBe('http://example.com/')
  })

  /**
   * The failure this module exists to prevent. A bare domain is how people type
   * a URL, and it used to throw inside the scan route, turning a printed code
   * into a 500.
   */
  it('adds a scheme to a bare domain', () => {
    expect(normalizeExternalUrl('vardenia.com')).toBe('https://vardenia.com/')
    expect(normalizeExternalUrl('www.leroyal.com.lb/spa')).toBe('https://www.leroyal.com.lb/spa')
  })

  it('tolerates surrounding whitespace from a copy and paste', () => {
    expect(normalizeExternalUrl('  https://vardenia.com  ')).toBe('https://vardenia.com/')
  })

  it('rejects empty and non-string input', () => {
    for (const v of ['', '   ', null, undefined, 42, {}]) {
      expect(normalizeExternalUrl(v)).toBeNull()
    }
  })

  it('rejects schemes that are not web addresses', () => {
    expect(normalizeExternalUrl('javascript:alert(1)')).toBeNull()
    expect(normalizeExternalUrl('data:text/html,<script>alert(1)</script>')).toBeNull()
    expect(normalizeExternalUrl('file:///etc/passwd')).toBeNull()
  })

  it('does not smuggle a bad scheme through by prefixing it', () => {
    // `https://javascript:alert(1)` would parse; it must not be produced.
    const result = normalizeExternalUrl('javascript:alert(1)')
    expect(result).toBeNull()
  })

  it('rejects hosts a reader could never reach', () => {
    expect(normalizeExternalUrl('localhost:3000')).toBeNull()
    expect(normalizeExternalUrl('https://localhost')).toBeNull()
    expect(normalizeExternalUrl('not a url')).toBeNull()
  })

  it('keeps query strings and fragments, which campaign links rely on', () => {
    expect(normalizeExternalUrl('leroyal.com/book?utm_source=vardenia')).toBe(
      'https://leroyal.com/book?utm_source=vardenia',
    )
  })

  it('produces something Response.redirect accepts', () => {
    for (const input of ['vardenia.com', 'https://vardenia.com/x', 'www.a.co/b?c=1']) {
      const normalized = normalizeExternalUrl(input)
      expect(normalized).not.toBeNull()
      expect(() => Response.redirect(normalized as string, 302)).not.toThrow()
    }
  })
})
