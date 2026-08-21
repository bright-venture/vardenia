import { afterEach, describe, expect, it, vi } from 'vitest'
import { SESSION_HINT, hasSessionHint, markSignedIn, markSignedOut } from './session-hint'

/**
 * The header reads this to decide between "Sign in" and "Your account".
 *
 * It carries no identity and authorises nothing - every real check still runs
 * against the httpOnly token - so what matters here is narrower than security:
 * that it never reports a session that has been ended, and that reading it on
 * the server is safe, because the header renders there first.
 */

const cookieJar = () => {
  let jar: string[] = []

  vi.stubGlobal('document', {
    get cookie() {
      return jar.join('; ')
    },
    set cookie(value: string) {
      const [pair] = value.split(';')
      const [name] = (pair ?? '').split('=')
      jar = jar.filter((entry) => !entry.startsWith(`${name}=`))
      // A max-age of zero is a deletion, which is how markSignedOut works.
      if (!/max-age=0(;|$)/.test(value)) jar.push(pair as string)
    },
  })

  vi.stubGlobal('location', { protocol: 'https:' })
}

afterEach(() => vi.unstubAllGlobals())

describe('session hint', () => {
  it('is absent until somebody signs in', () => {
    cookieJar()
    expect(hasSessionHint()).toBe(false)
  })

  it('is present after signing in', () => {
    cookieJar()
    markSignedIn()
    expect(hasSessionHint()).toBe(true)
  })

  /**
   * The one that matters. A header still offering "Your account" after signing
   * out sends somebody to a page that asks them to sign in again, which reads as
   * the sign-out having failed.
   */
  it('is gone after signing out', () => {
    cookieJar()
    markSignedIn()
    markSignedOut()
    expect(hasSessionHint()).toBe(false)
  })

  it('survives other cookies sitting beside it', () => {
    cookieJar()
    document.cookie = 'NEXT_LOCALE=ar'
    markSignedIn()
    document.cookie = 'something=else'
    expect(hasSessionHint()).toBe(true)
  })

  /**
   * `vd_session_other=1` must not read as `vd_session=1`. Whole-pair matching
   * rather than a substring search, or a cookie added later could switch the
   * header on by accident.
   */
  it('does not match a cookie whose name merely starts the same way', () => {
    cookieJar()
    document.cookie = `${SESSION_HINT}_other=1`
    expect(hasSessionHint()).toBe(false)
  })

  it('does not treat any value as signed in', () => {
    cookieJar()
    document.cookie = `${SESSION_HINT}=0`
    expect(hasSessionHint()).toBe(false)
  })

  /**
   * The header is a server component first. These run during prerender, where
   * there is no document, and must not throw.
   */
  it('is safe on the server, where there is no document', () => {
    vi.stubGlobal('document', undefined)
    expect(hasSessionHint()).toBe(false)
    expect(() => markSignedIn()).not.toThrow()
    expect(() => markSignedOut()).not.toThrow()
  })
})
