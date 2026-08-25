import { describe, expect, it } from 'vitest'
import { analyticsConfig } from './analytics'

/**
 * The only thing worth testing here is when analytics does *not* load.
 *
 * Everything else is a script tag. But a build that reports pageviews from a
 * developer's laptop, or from a preview deploy, quietly corrupts the numbers
 * somebody is going to show an advertiser - and it does it in a way nobody
 * notices, because the graph still looks plausible.
 */

describe('analytics stays off', () => {
  it('when nothing is configured', () => {
    expect(analyticsConfig(undefined, undefined, undefined)).toBeNull()
  })

  it('when the script is set but no site is identified', () => {
    expect(analyticsConfig('https://plausible.io/js/script.js', undefined, undefined)).toBeNull()
  })

  it('when a site is identified but there is no script to load it', () => {
    expect(analyticsConfig(undefined, 'vardenia.com', undefined)).toBeNull()
  })

  /**
   * Netlify sets empty strings for variables declared but left blank, which is
   * not the same as unset and would otherwise read as configured.
   */
  it('when the variables are present but empty', () => {
    expect(analyticsConfig('', '', '')).toBeNull()
    expect(analyticsConfig('   ', '   ', '   ')).toBeNull()
  })
})

describe('analytics loads', () => {
  it('for a Plausible-style domain', () => {
    expect(analyticsConfig('https://plausible.io/js/script.js', 'vardenia.com', undefined)).toEqual({
      src: 'https://plausible.io/js/script.js',
      domain: 'vardenia.com',
      websiteId: null,
    })
  })

  it('for a Umami-style website id', () => {
    const id = '3a1f9c22-0b7e-4d1a-9f00-2c6b8e4d1122'
    expect(analyticsConfig('https://cloud.umami.is/script.js', undefined, id)).toEqual({
      src: 'https://cloud.umami.is/script.js',
      domain: null,
      websiteId: id,
    })
  })

  it('trims whitespace pasted in from a dashboard', () => {
    const config = analyticsConfig('  https://plausible.io/js/script.js  ', ' vardenia.com ')
    expect(config?.src).toBe('https://plausible.io/js/script.js')
    expect(config?.domain).toBe('vardenia.com')
  })
})
