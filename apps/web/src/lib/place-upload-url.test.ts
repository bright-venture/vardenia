import { describe, expect, it } from 'vitest'
import { placeUploadUrl, tokenFromHash } from './place-upload-url'

describe('placeUploadUrl', () => {
  it('puts the token in the fragment, never the query, under the locale', () => {
    const url = placeUploadUrl('https://vardenia.com', 'abc_DEF-123', 'ar')
    expect(url).toBe('https://vardenia.com/ar/magazine-places/upload#t=abc_DEF-123')
    const parsed = new URL(url)
    expect(parsed.search).toBe('')
    expect(parsed.hash).toBe('#t=abc_DEF-123')
    expect(parsed.pathname).not.toContain('abc_DEF')
  })
  it('does not double a trailing slash on the origin', () => {
    expect(placeUploadUrl('https://x.test/', 't', 'en')).toBe(
      'https://x.test/en/magazine-places/upload#t=t',
    )
  })
  it('encodes anything unusual so the fragment stays one value', () => {
    const url = placeUploadUrl('https://x.test', 'a b&c#d', 'en')
    expect(new URL(url).search).toBe('')
    expect(tokenFromHash(new URL(url).hash)).toBe('a b&c#d')
  })
})

describe('tokenFromHash', () => {
  it('reads t from a fragment', () => {
    expect(tokenFromHash('#t=abc')).toBe('abc')
    expect(tokenFromHash('t=abc')).toBe('abc')
    expect(tokenFromHash('#x=1&t=abc')).toBe('abc')
  })
  it('is null when there is none, or it is empty or malformed', () => {
    expect(tokenFromHash('')).toBeNull()
    expect(tokenFromHash('#')).toBeNull()
    expect(tokenFromHash('#t=')).toBeNull()
    expect(tokenFromHash('#t=%E0%A4%A')).toBeNull()
    expect(tokenFromHash('#other=1')).toBeNull()
  })
})
