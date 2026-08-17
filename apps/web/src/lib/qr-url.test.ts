import { describe, expect, it } from 'vitest'
import { isPrintSafeBaseUrl } from './qr-url'

/**
 * The check that stands between a proof sheet and 20,000 unfixable magazines.
 *
 * It had no tests, which is the wrong shape of gap: everything else in the QR
 * path fails visibly and can be regenerated, and this one fails silently and
 * cannot. `scanUrl` is covered in qr-image.test.ts, so only this half is here.
 *
 * The argument is passed explicitly throughout rather than through
 * NEXT_PUBLIC_SITE_URL, so the suite never depends on the developer's own .env.
 */

describe('isPrintSafeBaseUrl', () => {
  describe('accepts a real domain', () => {
    it('accepts the live site', () => {
      expect(isPrintSafeBaseUrl('https://vardenia.com')).toBe(true)
    })

    it('accepts a subdomain and a trailing slash', () => {
      expect(isPrintSafeBaseUrl('https://www.vardenia.com')).toBe(true)
      expect(isPrintSafeBaseUrl('https://vardenia.com/')).toBe(true)
    })

    /** Nothing about a hostname containing a denied word makes the domain temporary. */
    it('does not match a denied name appearing inside our own domain', () => {
      expect(isPrintSafeBaseUrl('https://vercel.app.vardenia.com')).toBe(true)
      expect(isPrintSafeBaseUrl('https://localhost.vardenia.com')).toBe(true)
      expect(isPrintSafeBaseUrl('https://myngrok.io.vardenia.com')).toBe(true)
    })
  })

  describe('rejects anything not served over https', () => {
    it('rejects http', () => {
      expect(isPrintSafeBaseUrl('http://vardenia.com')).toBe(false)
    })

    it('rejects a missing or empty value', () => {
      expect(isPrintSafeBaseUrl(undefined)).toBe(false)
      expect(isPrintSafeBaseUrl('')).toBe(false)
    })

    it('rejects a value that is not a URL at all', () => {
      expect(isPrintSafeBaseUrl('vardenia.com')).toBe(false)
      expect(isPrintSafeBaseUrl('https://')).toBe(false)
    })
  })

  describe('rejects a developer machine', () => {
    it('rejects localhost, with and without a port', () => {
      expect(isPrintSafeBaseUrl('https://localhost')).toBe(false)
      expect(isPrintSafeBaseUrl('https://localhost:3000')).toBe(false)
    })

    it('rejects loopback addresses', () => {
      expect(isPrintSafeBaseUrl('https://127.0.0.1:3000')).toBe(false)
      expect(isPrintSafeBaseUrl('https://[::1]:3000')).toBe(false)
    })

    /** A LAN address is how a phone reaches a laptop, and is not a public host. */
    it('rejects a bare IP address', () => {
      expect(isPrintSafeBaseUrl('https://192.168.1.20:3000')).toBe(false)
      expect(isPrintSafeBaseUrl('https://10.0.0.5')).toBe(false)
    })
  })

  /**
   * The reason this file exists.
   *
   * Every host below serves real pages over real HTTPS, so the old check passed
   * all of them. A sheet generated against one looks finished and is not: the
   * address stops being ours the moment the domain is pointed elsewhere, and by
   * then the codes are on paper.
   */
  describe('rejects a host we do not keep', () => {
    it('rejects a deploy preview', () => {
      expect(isPrintSafeBaseUrl('https://vardenia.vercel.app')).toBe(false)
      expect(isPrintSafeBaseUrl('https://vardenia-git-main-bright.vercel.app')).toBe(false)
      expect(isPrintSafeBaseUrl('https://vardenia.netlify.app')).toBe(false)
      expect(isPrintSafeBaseUrl('https://vardenia.pages.dev')).toBe(false)
    })

    it('rejects other hosting platforms before a domain is attached', () => {
      expect(isPrintSafeBaseUrl('https://vardenia.onrender.com')).toBe(false)
      expect(isPrintSafeBaseUrl('https://vardenia.up.railway.app')).toBe(false)
      expect(isPrintSafeBaseUrl('https://vardenia.fly.dev')).toBe(false)
    })

    it('rejects a tunnel, which is the only way a laptop gets an https address', () => {
      expect(isPrintSafeBaseUrl('https://a1b2c3.ngrok-free.app')).toBe(false)
      expect(isPrintSafeBaseUrl('https://a1b2c3.ngrok.io')).toBe(false)
      expect(isPrintSafeBaseUrl('https://brave-cat-runs.trycloudflare.com')).toBe(false)
    })

    it('rejects a cloud development environment', () => {
      expect(isPrintSafeBaseUrl('https://fuzzy-space-1234.app.github.dev')).toBe(false)
      expect(isPrintSafeBaseUrl('https://vardenia.replit.dev')).toBe(false)
    })

    it('ignores case, since a hostname is case-insensitive', () => {
      expect(isPrintSafeBaseUrl('https://Vardenia.Vercel.App')).toBe(false)
      expect(isPrintSafeBaseUrl('https://LOCALHOST:3000')).toBe(false)
    })
  })
})
