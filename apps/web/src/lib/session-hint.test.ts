import { afterEach, describe, expect, it, vi } from 'vitest'
import { SESSION_HINT, markSignedIn, markSignedOut, sessionAudience } from './session-hint'

/**
 * The header reads this to decide between "Sign in" and "Your account".
 *
 * It carries no identity and authorises nothing - every real check still runs
 * against the httpOnly token - so what matters here is narrower than security:
 * that it never reports a session that has been ended, that it never reports
 * the wrong audience, and that reading it on the server is safe, because the
 * header renders there first.
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
    expect(sessionAudience()).toBeNull()
  })

  it('reports a customer after a customer signs in', () => {
    cookieJar()
    markSignedIn('customer')
    expect(sessionAudience()).toBe('customer')
  })

  /**
   * The two audiences must not be confusable. A partner reading "Your account"
   * is sent to /account, which holds nothing of theirs and asks them to sign in
   * while they are already signed in.
   */
  it('reports a partner after a partner signs in', () => {
    cookieJar()
    markSignedIn('partner')
    expect(sessionAudience()).toBe('partner')
  })

  it('does not confuse the two', () => {
    cookieJar()
    markSignedIn('partner')
    expect(sessionAudience()).not.toBe('customer')
  })

  /**
   * The one that matters. A header still offering "Your account" after signing
   * out sends somebody to a page that asks them to sign in again, which reads as
   * the sign-out having failed.
   */
  it('is gone after signing out', () => {
    cookieJar()
    markSignedIn('customer')
    markSignedOut()
    expect(sessionAudience()).toBeNull()
  })

  it('survives other cookies sitting beside it', () => {
    cookieJar()
    document.cookie = 'NEXT_LOCALE=ar'
    markSignedIn('customer')
    document.cookie = 'something=else'
    expect(sessionAudience()).toBe('customer')
  })

  /**
   * `vd_session_other=c` must not read as `vd_session=c`. Whole-name matching
   * rather than a substring search, or a cookie added later could switch the
   * header on by accident.
   */
  it('does not match a cookie whose name merely starts the same way', () => {
    cookieJar()
    document.cookie = `${SESSION_HINT}_other=c`
    expect(sessionAudience()).toBeNull()
  })

  it('does not treat an unrecognised value as a session', () => {
    cookieJar()
    document.cookie = `${SESSION_HINT}=0`
    expect(sessionAudience()).toBeNull()
  })

  /**
   * Browsers are still carrying `1` from the version that meant only "somebody
   * is signed in". It must not read as a customer: staff and partners got that
   * same value, which is the bug this replaced. Reading as nobody is right - the
   * middleware rewrites it on the very next request.
   */
  it('does not treat the old value as a customer', () => {
    cookieJar()
    document.cookie = `${SESSION_HINT}=1`
    expect(sessionAudience()).toBeNull()
  })

  /**
   * The header is a server component first. These run during prerender, where
   * there is no document, and must not throw.
   */
  it('is safe on the server, where there is no document', () => {
    vi.stubGlobal('document', undefined)
    expect(sessionAudience()).toBeNull()
    expect(() => markSignedIn('customer')).not.toThrow()
    expect(() => markSignedOut()).not.toThrow()
  })
})
