import { describe, expect, it } from 'vitest'
import { comingSoonConfig, comingSoonDecision } from './coming-soon'

describe('comingSoonConfig', () => {
  it('is on only for the exact string true', () => {
    expect(comingSoonConfig({ COMING_SOON: 'true' }).enabled).toBe(true)
    for (const value of ['', 'false', 'TRUE', '1', 'yes', undefined]) {
      expect(comingSoonConfig({ COMING_SOON: value }).enabled).toBe(false)
    }
  })

  it('treats an empty token as no token', () => {
    expect(comingSoonConfig({ COMING_SOON_PREVIEW_TOKEN: '' }).token).toBe(undefined)
    expect(comingSoonConfig({}).token).toBe(undefined)
    expect(comingSoonConfig({ COMING_SOON_PREVIEW_TOKEN: 's3cret' }).token).toBe('s3cret')
  })
})

describe('comingSoonDecision', () => {
  const token = 's3cret'

  it('passes everything through when the gate is off', () => {
    expect(
      comingSoonDecision({ enabled: false, token, queryToken: null, cookieToken: undefined }),
    ).toBe('pass')
    // Even a would-be gated visitor is untouched while it is off.
    expect(
      comingSoonDecision({ enabled: false, token, queryToken: 'wrong', cookieToken: 'wrong' }),
    ).toBe('pass')
  })

  it('gates a plain visitor when the gate is on', () => {
    expect(
      comingSoonDecision({ enabled: true, token, queryToken: null, cookieToken: undefined }),
    ).toBe('gate')
  })

  it('grants when the preview link matches, so the cookie can be set', () => {
    expect(
      comingSoonDecision({ enabled: true, token, queryToken: token, cookieToken: undefined }),
    ).toBe('grant')
  })

  it('re-grants on the link even when a stale cookie is present', () => {
    expect(
      comingSoonDecision({ enabled: true, token, queryToken: token, cookieToken: 'old' }),
    ).toBe('grant')
  })

  it('passes a returning previewer holding the cookie', () => {
    expect(comingSoonDecision({ enabled: true, token, queryToken: null, cookieToken: token })).toBe(
      'pass',
    )
  })

  it('gates a wrong link and a wrong cookie', () => {
    expect(
      comingSoonDecision({ enabled: true, token, queryToken: 'nope', cookieToken: 'nope' }),
    ).toBe('gate')
  })

  it('gates everyone when no token is configured, link or cookie notwithstanding', () => {
    expect(
      comingSoonDecision({
        enabled: true,
        token: undefined,
        queryToken: 'anything',
        cookieToken: 'anything',
      }),
    ).toBe('gate')
  })
})
