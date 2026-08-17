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
  /**
   * This block previously asserted that the LEFTMOST x-forwarded-for entry was
   * used, which is the one part of the request the caller writes. Six requests
   * from one machine with six invented addresses produced six counted scans.
   * The tests encoded the bug, so they are rewritten alongside the fix.
   */
  it('prefers the platform header over anything the caller can write', () => {
    const headers = new Headers({
      'x-forwarded-for': '203.0.113.9',
      'cf-connecting-ip': IP,
    })
    expect(clientIp(headers)).toBe(IP)
  })

  it('uses x-real-ip when Cloudflare is not in front', () => {
    expect(clientIp(new Headers({ 'x-real-ip': IP, 'x-forwarded-for': '203.0.113.9' }))).toBe(IP)
  })

  /**
   * Netlify writes its own header rather than the ones Cloudflare and Vercel use.
   * Without it the function falls through to x-forwarded-for, which happens to
   * work on Netlify but only because their edge appends - a weaker guarantee than
   * a header the platform overwrites outright.
   */
  it('uses the Netlify header, which the platform overwrites', () => {
    const headers = new Headers({
      'x-forwarded-for': '203.0.113.9',
      'x-nf-client-connection-ip': IP,
    })
    expect(clientIp(headers)).toBe(IP)
  })

  /** Cloudflare in front of Netlify: the outermost proxy is the one to trust. */
  it('prefers Cloudflare over Netlify when both are present', () => {
    const headers = new Headers({
      'cf-connecting-ip': IP,
      'x-nf-client-connection-ip': '203.0.113.9',
    })
    expect(clientIp(headers)).toBe(IP)
  })

  it('takes the nearest hop from x-forwarded-for, not the caller-supplied one', () => {
    // A client sending its own header gets it prepended; the proxy appends the
    // address it actually saw.
    const headers = new Headers({ 'x-forwarded-for': `203.0.113.9, 10.0.0.1, ${IP}` })
    expect(clientIp(headers)).toBe(IP)
  })

  it('handles a single-entry x-forwarded-for', () => {
    expect(clientIp(new Headers({ 'x-forwarded-for': IP }))).toBe(IP)
  })

  it('ignores empty segments and stray whitespace', () => {
    expect(clientIp(new Headers({ 'x-forwarded-for': `10.0.0.1, , ${IP} ,` }))).toBe(IP)
  })

  it('returns null when nothing is present', () => {
    expect(clientIp(new Headers())).toBeNull()
  })

  it('returns null rather than an empty string for a blank header', () => {
    expect(clientIp(new Headers({ 'x-forwarded-for': '   ' }))).toBeNull()
  })

  /** The attack, end to end: distinct forged addresses must not defeat dedupe. */
  it('collapses forged addresses to one counted scan when a proxy appended the real one', () => {
    __resetScanGuard()
    const now = Date.now()
    const counted = [1, 2, 3, 4, 5, 6].filter((n) => {
      const headers = new Headers({
        'x-forwarded-for': `203.0.113.${n}, ${IP}`,
      })
      return evaluateScan({
        code: 'ABC1234',
        ip: clientIp(headers),
        userAgent: PHONE,
        now: now + n,
      }).count
    })
    expect(counted).toHaveLength(1)
  })
})

/**
 * The guard that holds when the address cannot be trusted at all - no proxy in
 * front, so every hop in x-forwarded-for is written by the caller.
 */
describe('per-code ceiling', () => {
  it('bounds inflation from perfectly forged addresses', () => {
    __resetScanGuard()
    const now = Date.now()

    let counted = 0
    for (let n = 0; n < 500; n++) {
      // A different invented address every time: dedupe and the per-address
      // ceiling are both defeated by construction.
      const verdict = evaluateScan({
        code: 'ABC1234',
        ip: `203.0.113.${n % 255}.${Math.floor(n / 255)}`,
        userAgent: PHONE,
        now: now + n,
      })
      if (verdict.count) counted++
    }

    expect(counted).toBeLessThanOrEqual(60)
  })

  it('reports why it stopped counting', () => {
    __resetScanGuard()
    const now = Date.now()
    let last = evaluateScan({ code: 'X', ip: '1.1.1.1', userAgent: PHONE, now })
    for (let n = 1; n < 200; n++) {
      last = evaluateScan({ code: 'X', ip: `9.9.${n}.1`, userAgent: PHONE, now: now + n })
    }
    expect(last.count).toBe(false)
    expect(last.reason).toBe('code-burst')
  })

  it('keeps each code on its own allowance', () => {
    __resetScanGuard()
    const now = Date.now()
    for (let n = 0; n < 200; n++) {
      evaluateScan({ code: 'BUSY', ip: `9.9.${n}.1`, userAgent: PHONE, now: now + n })
    }
    expect(
      evaluateScan({ code: 'QUIET', ip: '5.5.5.5', userAgent: PHONE, now: now + 300 }).count,
    ).toBe(true)
  })

  it('recovers once the window passes, so a real spike is not silenced forever', () => {
    __resetScanGuard()
    const now = Date.now()
    for (let n = 0; n < 200; n++) {
      evaluateScan({ code: 'SPIKE', ip: `9.9.${n}.1`, userAgent: PHONE, now: now + n })
    }
    const later = evaluateScan({
      code: 'SPIKE',
      ip: '4.4.4.4',
      userAgent: PHONE,
      now: now + 61_000,
    })
    expect(later.count).toBe(true)
  })
})
