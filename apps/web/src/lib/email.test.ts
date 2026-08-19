import { describe, expect, it } from 'vitest'
import { emailSettings, emailWarning, type EmailEnv } from './email'

/**
 * Email configuration.
 *
 * Two failures matter and they pull in opposite directions. Unconfigured means
 * password resets are written to a log and never delivered, which looks from the
 * outside like a request nobody made. Configured with an override left on means
 * every send succeeds and every customer gets nothing - a failure with no error
 * anywhere, which is the harder of the two to notice.
 */

const FULL: EmailEnv = {
  RESEND_API_KEY: 're_abc123',
  EMAIL_FROM: 'noreply@vardenia.com',
}

describe('emailSettings', () => {
  it('reads a complete configuration', () => {
    expect(emailSettings(FULL)).toEqual({
      apiKey: 're_abc123',
      from: 'noreply@vardenia.com',
      fromName: 'Vardenia',
    })
  })

  it('uses EMAIL_FROM_NAME when given', () => {
    expect(emailSettings({ ...FULL, EMAIL_FROM_NAME: 'Vardenia Bookings' })?.fromName).toBe(
      'Vardenia Bookings',
    )
  })

  it('falls back to Vardenia for a blank name', () => {
    expect(emailSettings({ ...FULL, EMAIL_FROM_NAME: '   ' })?.fromName).toBe('Vardenia')
  })

  it('trims values, because a pasted key carries whitespace', () => {
    const settings = emailSettings({
      RESEND_API_KEY: '  re_abc123  ',
      EMAIL_FROM: ' noreply@vardenia.com ',
    })
    expect(settings?.apiKey).toBe('re_abc123')
    expect(settings?.from).toBe('noreply@vardenia.com')
  })

  /**
   * Null rather than a half-filled object. An adapter holding a key and no from
   * address fails on every send, at the far end, with an error nobody reads.
   */
  it.each([
    ['nothing set', {}],
    ['no key', { EMAIL_FROM: 'noreply@vardenia.com' }],
    ['no from', { RESEND_API_KEY: 're_abc123' }],
    ['empty key', { RESEND_API_KEY: '   ', EMAIL_FROM: 'noreply@vardenia.com' }],
    ['from is a name', { RESEND_API_KEY: 're_abc123', EMAIL_FROM: 'Vardenia' }],
    ['from has no domain dot', { RESEND_API_KEY: 're_abc123', EMAIL_FROM: 'noreply@localhost' }],
    ['from has a space', { RESEND_API_KEY: 're_abc123', EMAIL_FROM: 'no reply@vardenia.com' }],
    ['from has two at signs', { RESEND_API_KEY: 're_abc123', EMAIL_FROM: 'a@b@vardenia.com' }],
  ])('returns null when %s', (_label, env) => {
    expect(emailSettings(env as EmailEnv)).toBeNull()
  })

  it('carries the override when it is a real address', () => {
    expect(emailSettings({ ...FULL, EMAIL_OVERRIDE_TO: 'dev@vardenia.com' })?.overrideTo).toBe(
      'dev@vardenia.com',
    )
  })

  /** A malformed override must not silently become "send to everyone". */
  it('ignores an override that is not an address', () => {
    expect(emailSettings({ ...FULL, EMAIL_OVERRIDE_TO: 'me' })?.overrideTo).toBeUndefined()
    expect(emailSettings({ ...FULL, EMAIL_OVERRIDE_TO: '  ' })?.overrideTo).toBeUndefined()
  })
})

describe('emailWarning', () => {
  it('says nothing when properly configured', () => {
    expect(emailWarning(FULL)).toBeNull()
  })

  it('explains what is missing when nothing is set', () => {
    const warning = emailWarning({})
    expect(warning).toContain('RESEND_API_KEY')
    expect(warning).toContain('EMAIL_FROM')
  })

  /** Naming the one that is missing saves a round of guessing. */
  it('distinguishes a missing key from a missing address', () => {
    expect(emailWarning({ EMAIL_FROM: 'noreply@vardenia.com' })).toContain('RESEND_API_KEY')
    expect(emailWarning({ RESEND_API_KEY: 're_abc123' })).toContain('EMAIL_FROM')
  })

  /**
   * The one that would otherwise go unnoticed. Every send succeeds, so nothing
   * errors, and every customer receives nothing.
   */
  it('warns loudly while all mail is being redirected', () => {
    const warning = emailWarning({ ...FULL, EMAIL_OVERRIDE_TO: 'dev@vardenia.com' })
    expect(warning).toContain('dev@vardenia.com')
    expect(warning).toMatch(/customers are receiving nothing/i)
    expect(warning).toContain('EMAIL_OVERRIDE_TO')
  })

  it('always names the variable to change', () => {
    for (const env of [
      {},
      { EMAIL_FROM: 'noreply@vardenia.com' },
      { RESEND_API_KEY: 're_abc123' },
      { ...FULL, EMAIL_OVERRIDE_TO: 'dev@vardenia.com' },
    ]) {
      expect(emailWarning(env as EmailEnv)).toMatch(/EMAIL_|RESEND_/)
    }
  })
})
