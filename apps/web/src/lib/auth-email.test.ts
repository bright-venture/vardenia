import { describe, expect, it } from 'vitest'
import {
  PARTNER_INVITE_DAYS,
  emailChangedEmail,
  passwordChangedEmail,
  partnerResetEmail,
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

/** The customer reset email said "expires shortly" (QA case M2, 22 November 2026). */
describe('the customer reset email', () => {
  it('says the link lasts 1 hour, in both languages', () => {
    const mail = passwordResetEmail('tok123')
    expect(mail.text).toContain('for 1 hour')
    expect(mail.text).toContain('لمدة ساعة واحدة')
    expect(mail.html).toContain('for 1 hour')
    expect(mail.text).not.toContain('shortly')
  })
})

describe('escaping', () => {
  it('does not let a token inject markup', () => {
    const mail = verificationEmail('"><script>alert(1)</script>', ORIGIN)
    expect(mail.html).not.toContain('<script>')
  })
})

/**
 * The first set-password email is the invitation and lives for days; an
 * ordinary reset keeps Payload's default hour (20 November 2026). Each email
 * must say how long its own link works.
 */
describe('partner set-password links', () => {
  it('sets no lifetime on the collection, so an ordinary reset keeps the default hour', async () => {
    const { BusinessUsers } = await import('../collections/BusinessUsers')
    const auth = BusinessUsers.auth as { forgotPassword?: { expiration?: number } }
    expect(auth.forgotPassword?.expiration).toBeUndefined()
  })

  it('says the invitation lasts as many days as it does, in both languages', () => {
    expect(PARTNER_INVITE_DAYS).toBeGreaterThanOrEqual(2)
    const mail = partnerResetEmail('tok123', 'https://vardenia.com', { invite: true })
    expect(mail.subject).toContain('Set your Vardenia password')
    expect(mail.text).toContain(`works for ${PARTNER_INVITE_DAYS} days`)
    expect(mail.text).toContain(`لمدة ${PARTNER_INVITE_DAYS} أيام`)
    expect(mail.html).toContain(`works for ${PARTNER_INVITE_DAYS} days`)
  })

  it('says an ordinary reset lasts 1 hour, in both languages', () => {
    const mail = partnerResetEmail('tok123', 'https://vardenia.com')
    expect(mail.subject).toContain('Reset your Vardenia password')
    expect(mail.text).toContain('works for 1 hour')
    expect(mail.text).toContain('لمدة ساعة واحدة')
    expect(mail.text).not.toContain('days')
  })

  it('makes "forgot password" send the ordinary 1 hour reset email', async () => {
    const { BusinessUsers } = await import('../collections/BusinessUsers')
    const fp = (
      BusinessUsers.auth as { forgotPassword: { generateEmailHTML: (a: unknown) => string } }
    ).forgotPassword
    expect(fp.generateEmailHTML({ token: 't' })).toContain('1 hour')
  })
})

/** Notices after an account change (21 November 2026). */
describe('account change notices', () => {
  it('tells the account its password changed, and whom to contact, in both languages', () => {
    const mail = passwordChangedEmail('help@example.com')
    expect(mail.subject).toContain('password was changed')
    expect(mail.text).toContain('every other device was signed out')
    expect(mail.text).toContain('help@example.com')
    expect(mail.text).toContain('تواصل معنا')
    expect(mail.text).not.toMatch(/reply to this/i)
  })

  it('tells the old address where the email went, and whom to contact', () => {
    const mail = emailChangedEmail('new@example.com', 'help@example.com')
    expect(mail.text).toContain('new@example.com')
    expect(mail.text).toContain('help@example.com')
    expect(mail.text).not.toMatch(/reply to this/i)
    expect(mail.html).toContain('dir="rtl"')
  })

  it('does not let a typed address inject markup', () => {
    expect(emailChangedEmail('"><script>x</script>@a.co').html).not.toContain('<script>')
  })

  it('names the public contact address by default', () => {
    expect(passwordChangedEmail().text).toContain('contact@vardenia.com')
  })
})
