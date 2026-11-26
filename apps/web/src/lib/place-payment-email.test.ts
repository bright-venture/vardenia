import { describe, expect, it } from 'vitest'

import {
  emailDate,
  paymentEmail,
  unpaidTeamEmail,
  whatsappLink,
  withinDays,
  type PaymentEmailFacts,
} from './place-payment-email'
import { PAYMENT_EVENTS } from './place-payment-notify'

const BASE: PaymentEmailFacts = {
  locale: 'en',
  ownerName: 'Sami',
  businessName: 'Cafe Cedar',
  reference: 'VD-42',
  pageNumber: 17,
  price: 1000,
  downpaymentAmount: 500,
  received: 0,
  refunded: 0,
  stillToPay: 1000,
  currency: 'USD',
  downpaymentDueAt: '2026-12-01T12:00:00.000Z',
  balanceDueAt: '2026-12-24T12:00:00.000Z',
  balanceDeadlineDays: 30,
  contractEndsAt: '2027-11-24T12:00:00.000Z',
  whishNumber: '+96179300350',
  origin: 'https://vardenia.example',
  businessId: 42,
}

const AFTER_DOWN = { received: 500, stillToPay: 500 }
const OWNER_PHONE = '03123456'
const OWNER_EMAIL = 'sami@example.com'

const both = (event: (typeof PAYMENT_EVENTS)[number], over: Partial<PaymentEmailFacts> = {}) => ({
  en: paymentEmail(event, { ...BASE, ...over, locale: 'en' }),
  ar: paymentEmail(event, { ...BASE, ...over, locale: 'ar' }),
})

describe('every payment email', () => {
  it.each(PAYMENT_EVENTS)('%s carries the reference and page number, in en and ar', (event) => {
    const { en, ar } = both(event, AFTER_DOWN)
    for (const mail of [en, ar]) {
      expect(mail.html).toContain('VD-42')
      expect(mail.text).toContain('VD-42')
      expect(mail.html).toContain('17')
      expect(mail.subject).not.toMatch(/[\r\n]/)
      // Never the owner's own contact details.
      expect(mail.html).not.toContain(OWNER_PHONE)
      expect(mail.html).not.toContain(OWNER_EMAIL)
    }
    expect(en.html).toContain('dir="ltr"')
    expect(en.html).toContain('lang="en"')
    expect(ar.html).toContain('dir="rtl"')
    expect(ar.html).toContain('lang="ar"')
    expect(ar.subject).not.toBe(en.subject)
  })

  it('escapes the business name and owner name', () => {
    const evil = '<script>alert(1)</script>'
    for (const event of PAYMENT_EVENTS) {
      for (const locale of ['en', 'ar'] as const) {
        const mail = paymentEmail(event, {
          ...BASE,
          locale,
          businessName: evil,
          ownerName: evil,
          sharedReason: evil,
        })
        expect(mail.html).not.toMatch(/<script/i)
        expect(mail.html).toContain('&lt;script&gt;')
      }
    }
  })

  it('any other language falls back to English copy (the caller passes en)', () => {
    expect(paymentEmail('E1', BASE).subject).toBe('Pay the downpayment for Cafe Cedar')
  })
})

describe('E1: submitted, pay the downpayment', () => {
  it('asks for the downpayment by Whish to the company number, with the deadline', () => {
    const { en, ar } = both('E1')
    expect(en.html).toContain('$500')
    expect(en.html).toContain('$1000')
    expect(en.html).toContain('+96179300350')
    expect(en.html).toContain('1 December 2026')
    expect(en.html).toContain('Page number 17 is reserved for you.')
    expect(en.text).toContain('the rest ($500) within 1 month (30 days) of acceptance')
    // The first version's promise is gone: the downpayment comes first now.
    expect(en.html).not.toMatch(/pay only if we accept/i)
    expect(ar.html).toContain('$500')
    expect(ar.html).toContain('+96179300350')
    expect(ar.html).toContain('الدفعة الأولى')
    expect(ar.html).toContain('2026')
  })

  it('has the WhatsApp link for owners who paid from another number', () => {
    const { en, ar } = both('E1')
    const link = whatsappLink({ ...BASE, locale: 'en' })
    expect(en.html).toContain(link.replace(/&/g, '&amp;'))
    expect(en.text).toContain(link)
    expect(ar.text).toContain(whatsappLink({ ...BASE, locale: 'ar' }))
  })
})

describe('the WhatsApp link', () => {
  it('goes to the company digits with the business, reference and "I paid from"', () => {
    const link = whatsappLink({
      whishNumber: '+961 79 300-350',
      businessName: 'Cafe & Cedar',
      reference: 'VD-42',
      locale: 'en',
    })
    const url = new URL(link)
    expect(`${url.origin}${url.pathname}`).toBe('https://wa.me/96179300350')
    expect([...url.searchParams.keys()]).toEqual(['text'])
    expect(url.searchParams.get('text')).toBe('Cafe & Cedar - VD-42 - I paid from: ')
    // Encoded: the ampersand does not start a new parameter.
    expect(link).toContain('Cafe%20%26%20Cedar')
  })

  it('in Arabic, says it in Arabic', () => {
    const url = new URL(
      whatsappLink({
        whishNumber: '+96179300350',
        businessName: 'X',
        reference: 'VD-1',
        locale: 'ar',
      }),
    )
    expect(url.searchParams.get('text')).toBe('X - VD-1 - دفعت من الرقم: ')
  })

  it('never carries the owner phone or email', () => {
    for (const event of PAYMENT_EVENTS) {
      const mail = paymentEmail(event, BASE)
      const links = mail.text.match(/https:\/\/wa\.me\/\S+/g) ?? []
      for (const l of links) {
        expect(decodeURIComponent(l)).not.toContain(OWNER_PHONE)
        expect(decodeURIComponent(l)).not.toContain(OWNER_EMAIL)
        expect(decodeURIComponent(l)).not.toContain('Sami')
      }
    }
  })

  it('is in every email asking for money, and in no other', () => {
    for (const event of PAYMENT_EVENTS) {
      const has = paymentEmail(event, BASE).text.includes('https://wa.me/96179300350?text=')
      expect([event, has]).toEqual([event, ['E1', 'E1c', 'E3', 'E4'].includes(event)])
    }
  })
})

describe('E1c: downpayment reminder', () => {
  it('reminds of the amount, the number and the deadline', () => {
    const { en, ar } = both('E1c')
    expect(en.subject).toBe('Reminder: the downpayment for Cafe Cedar')
    expect(en.html).toContain('$500')
    expect(en.html).toContain('+96179300350')
    expect(en.html).toContain('1 December 2026')
    expect(ar.subject).toContain('تذكير')
    expect(ar.html).toContain('$500')
  })
})

describe('E2: downpayment received', () => {
  it('says what was received and that the review starts', () => {
    const { en, ar } = both('E2', AFTER_DOWN)
    expect(en.html).toContain('We received your downpayment of $500 for Cafe Cedar')
    expect(en.html).toMatch(/reviewing your business/)
    expect(ar.html).toContain('وصلتنا دفعتك الأولى وقدرها $500')
    // No payment is asked for here.
    expect(en.html).not.toContain('+96179300350')
  })
})

describe('E3: accepted, pay the rest', () => {
  it('asks for price - received, by Whish, within the Settings days, with the date', () => {
    const { en, ar } = both('E3', { received: 400, stillToPay: 600 })
    expect(en.html).toContain(
      'Pay the rest, $600, by Whish to +96179300350 within 1 month (30 days)',
    )
    expect(en.html).toContain('24 December 2026')
    expect(en.text).toContain('https://wa.me/96179300350?text=')
    expect(ar.html).toContain('$600')
    expect(ar.html).toContain('+96179300350')
    expect(ar.text).toContain('https://wa.me/96179300350?text=')
  })
})

describe('E4: reminder of the rest', () => {
  it('reminds of what is still to pay and when', () => {
    const { en, ar } = both('E4', AFTER_DOWN)
    expect(en.subject).toBe('Reminder: the rest for Cafe Cedar is due on 24 December 2026')
    expect(en.html).toContain('$500')
    expect(en.html).toContain('+96179300350')
    expect(ar.html).toContain('$500')
  })
})

describe('E5: not accepted, refund coming', () => {
  it('says the downpayment goes back by Whish to the number paid from', () => {
    const { en, ar } = both('E5', AFTER_DOWN)
    expect(en.html).toContain('We will return your $500 by Whish to the number you paid from.')
    expect(en.html).toContain('17 (released)')
    expect(ar.html).toContain('سنعيد إليك $500 عبر Whish إلى الرقم الذي دفعت منه')
  })

  it('counts what was already sent back, and shows the reason only when shared', () => {
    const partial = paymentEmail('E5', { ...BASE, received: 500, refunded: 200 })
    expect(partial.html).toContain('$300')
    expect(paymentEmail('E5', { ...BASE, ...AFTER_DOWN }).html).not.toContain('The reason')
    expect(paymentEmail('E5', { ...BASE, sharedReason: 'Closed in winter' }).html).toContain(
      'The reason: Closed in winter',
    )
  })
})

describe('E6: did not pay the rest', () => {
  it('owner: the deadline is over, submit a new form', () => {
    const { en, ar } = both('E6', { ...AFTER_DOWN, now: '2026-12-24T12:15:00.000Z' })
    expect(en.html).toContain('24 December 2026')
    expect(en.html).toMatch(/please submit a new form/)
    expect(en.html).toContain('https://vardenia.example/magazine-places')
    expect(ar.html).toContain('https://vardenia.example/ar/magazine-places')
    expect(ar.html).toContain('نموذج جديد')
  })

  it('rejected by staff before the deadline: no "the deadline was" for a future date', () => {
    const early = { ...AFTER_DOWN, now: '2026-12-10T12:00:00.000Z' }
    const { en, ar } = both('E6', early)
    expect(en.html).not.toContain('24 December 2026')
    expect(en.html).toContain('We did not receive the rest of the price for Cafe Cedar.')
    expect(en.html).toContain('Your application has ended')
    expect(ar.html).toContain('لم يصلنا المبلغ المتبقي')
    expect(unpaidTeamEmail({ ...BASE, ...early }).html).toContain('before the deadline')
    // At the deadline exactly, the job's wording.
    const late = both('E6', { ...AFTER_DOWN, now: '2026-12-24T12:00:00.000Z' })
    expect(late.en.html).toContain('was 24 December 2026')
  })

  it('team: English, with the admin link and the amounts', () => {
    const team = unpaidTeamEmail({ ...BASE, ...AFTER_DOWN })
    expect(team.subject).toBe('Did not pay the rest: Cafe Cedar')
    expect(team.html).toContain('https://vardenia.example/admin/collections/businesses/42')
    expect(team.html).toContain('$500')
    expect(team.html).toContain('VD-42')
  })
})

describe('E7: lapsed', () => {
  it('says the downpayment time is over, the number released, submit a new form', () => {
    const { en, ar } = both('E7')
    expect(en.subject).toBe('The time to pay the downpayment is over')
    expect(en.html).toContain('17 (released)')
    expect(en.html).toContain('1 December 2026')
    expect(en.html).toMatch(/submit a new form/)
    expect(ar.html).toContain('تم تحرير رقم الصفحة')
  })
})

describe('E8: published', () => {
  it('congratulates, says until when, and sends no password link of its own', () => {
    const { en, ar } = both('E8', { received: 1000, stillToPay: 0 })
    expect(en.html).toContain('Congratulations')
    expect(en.html).toContain('24 November 2027')
    expect(en.html).not.toMatch(/reset|set-password|token=/i)
    expect(en.html).not.toContain('<a ')
    expect(ar.html).toContain('مبروك')
  })
})

describe('emailDate', () => {
  it('reads the day in Beirut', () => {
    // 23:30 UTC on the 30th is already the 1st in Beirut.
    expect(emailDate('2026-11-30T23:30:00.000Z', 'en')).toBe('1 December 2026')
    expect(emailDate(null, 'en')).toBe('')
    expect(emailDate('nonsense', 'ar')).toBe('')
  })
})

describe('withinDays: the Settings days in words', () => {
  it.each([
    [1, 'within 1 day', 'خلال يوم واحد'],
    [2, 'within 2 days', 'خلال يومين'],
    [7, 'within 7 days', 'خلال 7 أيام'],
    [30, 'within 1 month (30 days)', 'خلال شهر واحد (30 يومًا)'],
    [45, 'within 45 days', 'خلال 45 يومًا'],
    [60, 'within 2 months (60 days)', 'خلال شهرين (60 يومًا)'],
  ])('%i days', (days, en, ar) => {
    expect(withinDays(days, 'en')).toBe(en)
    expect(withinDays(days, 'ar')).toBe(ar)
  })

  it('E1 and E3 follow the days of the submission, not a fixed month', () => {
    const facts = { ...BASE, ...AFTER_DOWN, balanceDeadlineDays: 45 }
    for (const event of ['E1', 'E3'] as const) {
      const en = paymentEmail(event, facts)
      expect(en.text, event).toContain('within 45 days')
      expect(en.text, event).not.toMatch(/one month|1 month/)
      expect(paymentEmail(event, { ...facts, locale: 'ar' }).text, event).toContain('خلال 45 يومًا')
    }
  })

  it('E3paid: accepted and already fully paid, nothing more to pay, no Whish request', () => {
    const facts = { ...BASE, received: 1000, stillToPay: 0 }
    const en = paymentEmail('E3paid', facts)
    expect(en.subject).toBe('Cafe Cedar is accepted')
    expect(en.text).toContain('nothing more to pay')
    expect(en.text).not.toContain('+96179300350')
    expect(paymentEmail('E3paid', { ...facts, locale: 'ar' }).text).toContain('لا يتبقى عليك شيء')
  })
})
