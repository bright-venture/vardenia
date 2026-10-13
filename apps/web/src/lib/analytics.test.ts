import { describe, expect, it } from 'vitest'
import {
  analyticsConfig,
  BEFORE_SEND,
  beforeSendScript,
  isSecretUrl,
  redactSecretUrl,
} from './analytics'

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
    expect(analyticsConfig('https://plausible.io/js/script.js', 'vardenia.com', undefined)).toEqual(
      {
        src: 'https://plausible.io/js/script.js',
        domain: 'vardenia.com',
        websiteId: null,
      },
    )
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

describe('pages whose address is a secret', () => {
  it('recognises reset and confirmation links, with or without a language', () => {
    expect(isSecretUrl('https://vardenia.com/account/reset/abc123')).toBe(true)
    expect(isSecretUrl('https://vardenia.com/ar/account/verify/abc123?x=1')).toBe(true)
    expect(isSecretUrl('/fr/partner/reset/abc123')).toBe(true)
    expect(isSecretUrl('https://vardenia.com/account/reset')).toBe(false)
    expect(isSecretUrl('https://vardenia.com/stay')).toBe(false)
    expect(isSecretUrl(null)).toBe(false)
  })

  it('takes the token out of a URL that still has to be sent', () => {
    expect(redactSecretUrl('https://vardenia.com/account/reset/abc123')).toBe(
      'https://vardenia.com/account/reset/[token]',
    )
  })

  /**
   * The browser copy of the rule, run as the browser would. It is written out as
   * a string because it must exist before the tracker loads, so this is what
   * stops it drifting from isSecretUrl.
   */
  it('cancels events from a token page and scrubs referrers in the browser hook', () => {
    const win: Record<string, (type: string, payload: Record<string, unknown>) => unknown> = {}
    new Function('window', beforeSendScript())(win)
    const hook = win[BEFORE_SEND]!

    expect(hook('event', { url: '/ar/account/reset/abc123' })).toBe(false)
    expect(
      hook('event', { url: '/stay', referrer: 'https://vardenia.com/account/verify/abc123' }),
    ).toEqual({ url: '/stay', referrer: 'https://vardenia.com/account/verify/[token]' })
    expect(hook('event', { url: '/stay' })).toEqual({ url: '/stay' })
  })
})
