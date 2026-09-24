import { describe, expect, it } from 'vitest'
import { statementEmailContent } from './statement-email'
import { sameOrigin } from './billing-auth'

const content = statementEmailContent({
  number: 'VRD-2026-0007',
  businessName: 'Em Sherif',
  period: '2026-10',
  total: 312.5,
  lineCount: 41,
  dueAt: new Date('2026-11-23T10:00:00Z'),
  url: 'https://vardenia.com/partner/statements/7',
})

describe('the statement email', () => {
  it('says how much, for which month, and by when', () => {
    expect(content.subject).toBe('Vardenia statement VRD-2026-0007 - October 2026')
    expect(content.text).toContain('$312.50')
    expect(content.text).toContain('41 bookings at Em Sherif')
    expect(content.text).toContain('23 November 2026')
  })

  it('tells the venue it can question a line, and where', () => {
    expect(content.text).toContain('question it on the statement page within 7 days')
    expect(content.text).toContain('https://vardenia.com/partner/statements/7')
  })

  it('carries the Arabic too, since we have never asked a venue which it reads', () => {
    expect(content.html).toContain('dir="rtl"')
    expect(content.text).toContain('كشف حسابك')
  })

  it('escapes a venue name before it reaches the HTML', () => {
    const risky = statementEmailContent({
      number: 'VRD-2026-0008',
      businessName: '<b>Bar</b>',
      period: '2026-10',
      total: 1,
      lineCount: 1,
      dueAt: new Date('2026-11-23T10:00:00Z'),
      url: 'https://vardenia.com/partner/statements/8',
    })
    expect(risky.html).not.toContain('<b>Bar</b>')
    expect(risky.html).toContain('&lt;b&gt;Bar&lt;/b&gt;')
  })
})

describe('the staff billing forms', () => {
  const post = (origin?: string) =>
    new Request('https://vardenia.com/billing/generate', {
      method: 'POST',
      headers: origin ? { origin } : {},
    })

  it('accept a post from the site itself', () => {
    expect(sameOrigin(post('https://vardenia.com'))).toBe(true)
    expect(sameOrigin(post())).toBe(true)
  })

  it('refuse one from anywhere else', () => {
    expect(sameOrigin(post('https://evil.example'))).toBe(false)
  })
})
