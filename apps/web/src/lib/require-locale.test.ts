import { describe, expect, it } from 'vitest'
import { LOCALES } from '@vardenia/i18n'
import { requireLocale } from './require-locale'

/**
 * The guard that keeps a URL segment out of the database.
 *
 * `/favicon.ico` is the case worth remembering: every browser asks for it, the
 * middleware skips any path with a dot in it, and the segment arrived at the
 * homepage as the locale. Production answered 500 to the first request a
 * visitor's browser makes, and WordPress scanners produced ninety more rows of
 * the same thing.
 */

describe('requireLocale', () => {
  it('returns every locale the site actually has', () => {
    for (const locale of LOCALES) {
      expect(requireLocale(locale)).toBe(locale)
    }
  })

  /**
   * `notFound()` works by throwing, which is what stops the page rendering. The
   * test is that it throws at all: if it ever returned, the caller would carry
   * on and query with whatever was in the URL.
   */
  it.each([
    ['favicon.ico', 'the one that broke production'],
    ['config.php', 'a WordPress scanner'],
    ['xmlrpc.php', 'the same'],
    ['fr', 'a locale we do not have'],
    ['EN', 'the right locale, wrong case'],
    ['en-GB', 'a region tag'],
    ['', 'nothing at all'],
    ['..', 'a traversal attempt'],
    ['en ', 'a trailing space'],
  ])('refuses %s (%s)', (segment) => {
    expect(() => requireLocale(segment)).toThrow()
  })

  it('does not accept a value that merely starts with a locale', () => {
    expect(() => requireLocale('english')).toThrow()
    expect(() => requireLocale('arabic')).toThrow()
  })
})
