import { describe, expect, it } from 'vitest'
import {
  passwordResetEmail,
  resetUrl,
  siteOrigin,
  verificationEmail,
  verifyUrl,
} from './auth-email'

/**
 * The two emails that decide whether an account can ever be used.
 *
 * The bug these exist to prevent was not a crash. Payload's defaults build a
 * perfectly valid link to `/admin/customers/verify/<token>` - the staff panel,
 * which a customer cannot sign in to - and the mail sends successfully. Sign-up
 * completed, the email arrived, and the account could never be verified.
 *
 * So the assertion that matters most is the dullest one in the file: the link
 * does not point at /admin.
 */

const ORIGIN = 'https://vardenia.com'
const TOKEN = 'abc123def456'

describe('link building', () => {
  it('never points a customer at the admin panel', () => {
    expect(verifyUrl(TOKEN, ORIGIN)).not.toContain('/admin')
    expect(resetUrl(TOKEN, ORIGIN)).not.toContain('/admin')
  })

  it('points at the pages that exist', () => {
    expect(verifyUrl(TOKEN, ORIGIN)).toBe('https://vardenia.com/account/verify/abc123def456')
    expect(resetUrl(TOKEN, ORIGIN)).toBe('https://vardenia.com/account/reset/abc123def456')
  })

  it('escapes a token that would otherwise break out of the path', () => {
    expect(verifyUrl('a/b?c=d', ORIGIN)).toBe('https://vardenia.com/account/verify/a%2Fb%3Fc%3Dd')
  })
})

describe('siteOrigin', () => {
  it('strips a path and a trailing slash', () => {
    expect(siteOrigin('https://vardenia.com/')).toBe('https://vardenia.com')
    expect(siteOrigin('https://vardenia.com/directory')).toBe('https://vardenia.com')
  })

  it('falls back rather than building a link to undefined', () => {
    expect(siteOrigin(undefined)).toBe('http://localhost:3000')
    expect(siteOrigin('not a url')).toBe('http://localhost:3000')
  })
})

describe.each([
  ['verification', verificationEmail],
  ['password reset', passwordResetEmail],
])('the %s email', (_name, build) => {
  const mail = build(TOKEN, ORIGIN)

  it('carries a plain-text part as well as HTML', () => {
    expect(mail.text.length).toBeGreaterThan(0)
    expect(mail.html).toContain('<!doctype html>')
    // The text part must not be the HTML with tags left in it.
    expect(mail.text).not.toContain('<')
  })

  it('contains the link in both parts', () => {
    expect(mail.html).toContain(TOKEN)
    expect(mail.text).toContain(TOKEN)
  })

  /**
   * The URL is written out as readable text, not only wrapped in an anchor. A
   * message whose only clickable thing is a button saying "click here" is the
   * shape of phishing, and a reader has no way to check where it goes.
   */
  it('shows the address rather than hiding it behind a button', () => {
    const withoutAnchors = mail.html.replace(/<a\b[^>]*>[\s\S]*?<\/a>/g, '')
    expect(withoutAnchors).toContain(`${ORIGIN}/account`)
  })

  it('is written in both languages', () => {
    expect(mail.html).toContain('dir="rtl"')
    expect(/[؀-ۿ]/.test(mail.html)).toBe(true)
    expect(/[؀-ۿ]/.test(mail.text)).toBe(true)
    expect(/[a-z]/i.test(mail.text)).toBe(true)
  })

  it('names both languages in the subject, since we do not know which is read', () => {
    expect(/[؀-ۿ]/.test(mail.subject)).toBe(true)
    expect(/[a-z]/i.test(mail.subject)).toBe(true)
  })

  it('tells somebody who did not ask for it that they can ignore it', () => {
    expect(mail.text.toLowerCase()).toContain('ignore')
  })
})

describe('escaping', () => {
  it('does not let a token inject markup', () => {
    const mail = verificationEmail('"><script>alert(1)</script>', ORIGIN)
    expect(mail.html).not.toContain('<script>')
  })
})
