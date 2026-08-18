import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import robots from './robots'

/**
 * robots.txt in both states.
 *
 * The disallow list was already load-bearing before the indexing switch existed
 * - `/g/` in particular, because a crawler walking the printed QR redirects
 * would inflate the scan counts an advertiser's renewal is argued from. So the
 * point of these tests is that turning indexing on later restores those rules
 * rather than quietly leaving the site wide open.
 */

const ENV = process.env.NEXT_PUBLIC_ALLOW_INDEX
const SITE = process.env.NEXT_PUBLIC_SITE_URL

beforeEach(() => {
  process.env.NEXT_PUBLIC_SITE_URL = 'https://vardenia.com'
})

afterEach(() => {
  process.env.NEXT_PUBLIC_ALLOW_INDEX = ENV
  process.env.NEXT_PUBLIC_SITE_URL = SITE
})

/**
 * The single rule group robots() emits, or a failure.
 *
 * Throwing rather than returning undefined: a robots.txt with no rules is not a
 * case worth writing assertions around, it is a broken file.
 */
const firstRule = (result: ReturnType<typeof robots>) => {
  const rules = Array.isArray(result.rules) ? result.rules : [result.rules]
  const rule = rules[0]
  if (!rule) throw new Error('robots.txt produced no rules')
  return rule
}

/** The disallow field is a string or a list depending on the branch. */
const disallowList = (result: ReturnType<typeof robots>) => {
  const { disallow } = firstRule(result)
  if (!disallow) return []
  return Array.isArray(disallow) ? disallow : [disallow]
}

describe('robots.txt while indexing is held back', () => {
  beforeEach(() => {
    delete process.env.NEXT_PUBLIC_ALLOW_INDEX
  })

  it('disallows everything', () => {
    expect(firstRule(robots()).disallow).toBe('/')
  })

  /**
   * Withheld deliberately. The sitemap is generated from the database, so
   * advertising it now hands a crawler the list of pages we are asking it not
   * to take - and right now that list is almost empty anyway.
   */
  it('does not advertise the sitemap', () => {
    expect(robots().sitemap).toBeUndefined()
  })

  it('still declares the host', () => {
    expect(robots().host).toBe('https://vardenia.com')
  })
})

describe('robots.txt once indexing is allowed', () => {
  beforeEach(() => {
    process.env.NEXT_PUBLIC_ALLOW_INDEX = 'true'
  })

  it('allows the site', () => {
    expect(firstRule(robots()).allow).toBe('/')
  })

  it('advertises the sitemap again', () => {
    expect(robots().sitemap).toBe('https://vardenia.com/sitemap.xml')
  })

  /**
   * The rules that existed before the switch did. `/g/` is the one that costs
   * money if it regresses: those are the printed QR redirects, and a crawler
   * walking them counts as scans against a listing's performance.
   */
  it('keeps the paths that were always disallowed', () => {
    const disallow = disallowList(robots())

    for (const path of ['/admin', '/api/', '/g/', '/qr/', '/reports/', '/scan/'])
      expect(disallow).toContain(path)
  })

  /** Category pages are real, linkable, and exactly what someone searches for. */
  it('does not block the directory', () => {
    const disallow = disallowList(robots())
    expect(disallow).not.toContain('/directory')
    expect(disallow).not.toContain('/')
  })
})

describe('the trailing slash on the site URL', () => {
  it('does not produce a doubled slash in the sitemap URL', () => {
    process.env.NEXT_PUBLIC_ALLOW_INDEX = 'true'
    process.env.NEXT_PUBLIC_SITE_URL = 'https://vardenia.com/'
    expect(robots().sitemap).toBe('https://vardenia.com/sitemap.xml')
  })
})
