import { beforeEach, describe, expect, it } from 'vitest'
import { __resetScanGuard, clientIp, evaluateScan } from './scan-guard'

/**
 * These assertions are commercial, not technical. Each one is a claim you would
 * have to defend if an advertiser questioned their scan numbers.
 */

const IP = '212.98.137.1'
const PHONE =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148'

beforeEach(() => __resetScanGuard())

describe('what counts as a scan', () => {
  it('counts a real phone', () => {
    expect(evaluateScan({ code: 'ABC1234', ip: IP, userAgent: PHONE }).count).toBe(true)
  })

  it('counts when the address is unknown, rather than losing a real scan', () => {
    expect(evaluateScan({ code: 'ABC1234', ip: null, userAgent: PHONE }).count).toBe(true)
  })
})

describe('link preview bots do not count', () => {
  // Sharing a listing in a group chat must not look like readers scanning it.
  const bots = [
    ['WhatsApp', 'WhatsApp/2.23.20.0'],
    ['Meta', 'facebookexternalhit/1.1'],
    ['Slack', 'Slackbot-LinkExpanding 1.0'],
    ['Telegram', 'TelegramBot (like TwitterBot)'],
    ['Google', 'Mozilla/5.0 (compatible; Googlebot/2.1)'],
    ['curl', 'curl/8.4.0'],
  ] as const

  for (const [name, ua] of bots) {
    it(`skips ${name}`, () => {
      const verdict = evaluateScan({ code: 'ABC1234', ip: IP, userAgent: ua })
      expect(verdict.count).toBe(false)
      expect(verdict.reason).toBe('bot')
    })
  }
})

describe('the same person refreshing', () => {
  it('counts once inside the dedupe window', () => {
    const now = Date.now()
    expect(evaluateScan({ code: 'ABC1234', ip: IP, userAgent: PHONE, now }).count).toBe(true)

    for (let i = 1; i <= 5; i++) {
      const verdict = evaluateScan({
        code: 'ABC1234',
        ip: IP,
        userAgent: PHONE,
        now: now + i * 1000,
      })
      expect(verdict.count).toBe(false)
      expect(verdict.reason).toBe('duplicate')
    }
  })

  it('counts again once the window has passed, because a return visit is real', () => {
    const now = Date.now()
    evaluateScan({ code: 'ABC1234', ip: IP, userAgent: PHONE, now })
    expect(
      evaluateScan({ code: 'ABC1234', ip: IP, userAgent: PHONE, now: now + 61_000 }).count,
    ).toBe(true)
  })

  it('does not confuse two different codes', () => {
    const now = Date.now()
    expect(evaluateScan({ code: 'AAAAAAA', ip: IP, userAgent: PHONE, now }).count).toBe(true)
    // A couple scanning the hotel then the restaurant next to it, seconds apart.
    expect(evaluateScan({ code: 'BBBBBBB', ip: IP, userAgent: PHONE, now: now + 500 }).count).toBe(
      true,
    )
  })

  it('does not confuse two different people', () => {
    const now = Date.now()
    expect(evaluateScan({ code: 'ABC1234', ip: IP, userAgent: PHONE, now }).count).toBe(true)
    expect(
      evaluateScan({ code: 'ABC1234', ip: '81.10.0.9', userAgent: PHONE, now: now + 500 }).count,
    ).toBe(true)
  })
})

describe('deliberate inflation', () => {
  it('stops counting after the burst limit, using distinct codes to dodge dedupe', () => {
    const now = Date.now()
    let counted = 0

    for (let i = 0; i < 60; i++) {
      const code = `CODE${String(i).padStart(3, '0')}`
      if (evaluateScan({ code, ip: IP, userAgent: PHONE, now: now + i }).count) counted++
    }

    expect(counted).toBe(20)
  })

  it('lets an honest visitor through even while another address is being blocked', () => {
    const now = Date.now()
    for (let i = 0; i < 60; i++) {
      evaluateScan({ code: `CODE${i}`, ip: IP, userAgent: PHONE, now: now + i })
    }
    expect(
      evaluateScan({ code: 'ABC1234', ip: '81.10.0.9', userAgent: PHONE, now: now + 100 }).count,
    ).toBe(true)
  })
})

describe('finding the client address', () => {
  it('takes the first entry of x-forwarded-for', () => {
    const headers = new Headers({ 'x-forwarded-for': `${IP}, 10.0.0.1, 10.0.0.2` })
    expect(clientIp(headers)).toBe(IP)
  })

  it('falls back to the Cloudflare header', () => {
    expect(clientIp(new Headers({ 'cf-connecting-ip': IP }))).toBe(IP)
  })

  it('returns null when nothing is present', () => {
    expect(clientIp(new Headers())).toBeNull()
  })
})
