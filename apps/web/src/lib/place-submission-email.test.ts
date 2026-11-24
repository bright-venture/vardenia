import { describe, expect, it } from 'vitest'
import { placeRejectionEmail, placeSubmissionEmails } from './place-submission-email'

const BASE = {
  businessId: 42,
  businessName: 'Cafe Cedar',
  governorate: 'beirut',
  listingNumber: 17,
  issueTitle: 'Summer 2027',
  ownerName: 'Sami Khoury',
  ownerEmail: 'sami@example.com',
  ownerPhone: '+961 70 123456',
  reference: 'VD-42',
  price: 20,
  currency: 'USD',
  locale: 'en' as const,
  origin: 'https://vardenia.example',
}

describe('the team email', () => {
  const { team } = placeSubmissionEmails(BASE)

  it('names the business, region, number, issue and owner', () => {
    expect(team.subject).toContain('Cafe Cedar')
    for (const text of [
      'Cafe Cedar',
      'Beirut',
      '17',
      'Summer 2027',
      'Sami Khoury',
      'sami@example.com',
      '+961 70 123456',
    ]) {
      expect(team.html).toContain(text)
    }
  })

  it('names the governorate, not its slug (QA, 22 November 2026)', () => {
    expect(placeSubmissionEmails({ ...BASE, governorate: 'keserwan' }).team.html).toContain(
      'Keserwan',
    )
    expect(placeSubmissionEmails({ ...BASE, governorate: 'keserwan' }).team.html).not.toContain(
      'keserwan',
    )
  })

  it('has a plain-text part with the same details and link', () => {
    for (const text of ['Cafe Cedar', 'Beirut', '17', 'Summer 2027', 'sami@example.com']) {
      expect(team.text).toContain(text)
    }
    expect(team.text).toContain('https://vardenia.example/admin/collections/businesses/42')
    expect(team.text).not.toContain('<')
  })

  it('shows the reference', () => {
    expect(team.html).toContain('VD-42')
  })

  it('links to the listing in the admin', () => {
    expect(team.html).toContain('https://vardenia.example/admin/collections/businesses/42')
  })
})

describe('the owner email', () => {
  it('says we received it, the agreed price, pay only if accepted, with reference and page', () => {
    const { owner } = placeSubmissionEmails(BASE)
    expect(owner.html).toMatch(/received your business/i)
    expect(owner.html).toMatch(/get back to you/i)
    expect(owner.html).toContain('The price agreed is $20 a year.')
    expect(owner.html).toMatch(/pay only if we accept your business/i)
    expect(owner.html).toContain('VD-42')
    expect(owner.html).toContain('>17<')
    expect(owner.html).toContain('dir="ltr"')
    expect(owner.html).toContain('lang="en"')
  })

  it('carries no link of any kind, and no admin address', () => {
    for (const locale of ['en', 'ar'] as const) {
      const { owner } = placeSubmissionEmails({ ...BASE, locale })
      expect(owner.html).not.toContain('<a ')
      expect(owner.html).not.toContain('/admin')
      expect(owner.text).not.toContain('http')
    }
  })

  it('uses the price and currency from Settings', () => {
    const eur = placeSubmissionEmails({ ...BASE, price: 35, currency: 'eur' }).owner
    expect(eur.html).toContain('35 EUR a year')
    expect(eur.html).not.toContain('$')
  })

  it('has a plain-text part, in its language', () => {
    const en = placeSubmissionEmails(BASE).owner.text
    expect(en).toContain('The price agreed is $20 a year.')
    expect(en).toContain('Reference: VD-42')
    const ar = placeSubmissionEmails({ ...BASE, locale: 'ar' }).owner.text
    expect(ar).toContain('لن تدفع إلا إذا قبلنا مكانك')
    expect(ar).toContain('$20')
    expect(ar).toContain('VD-42')
    expect(ar).not.toMatch(/pay only/i)
  })

  it('is right to left in Arabic', () => {
    const { owner } = placeSubmissionEmails({ ...BASE, locale: 'ar' })
    expect(owner.html).toContain('dir="rtl"')
    expect(owner.html).toContain('lang="ar"')
    expect(owner.html).not.toMatch(/pay only/i)
  })

  it('falls back to English copy, in a matching direction, for other languages', () => {
    const { owner } = placeSubmissionEmails({ ...BASE, locale: 'ur' })
    expect(owner.html).toMatch(/pay only if we accept/i)
    expect(owner.html).toContain('dir="ltr"')
  })
})

describe('user-supplied text is escaped', () => {
  const evil = '<script>alert(1)</script>'
  for (const locale of ['en', 'ar'] as const) {
    it(`in both emails (${locale})`, () => {
      const { team, owner } = placeSubmissionEmails({
        ...BASE,
        locale,
        businessName: evil,
        ownerName: evil,
        ownerPhone: evil,
        issueTitle: evil,
        reference: evil,
        currency: evil,
      })
      for (const mail of [team, owner]) {
        expect(mail.html).not.toContain('<script>')
        expect(mail.html).not.toContain(evil)
        // No raw tag survives anywhere a value was inserted.
        expect(mail.html).not.toMatch(/<script/i)
        expect(mail.html.replace(/<[a-z/!][^>]*>/gi, '')).not.toContain('<')
      }
      expect(owner.html).toContain('&lt;SCRIPT&gt;') // the currency, upper-cased and escaped
      expect(team.html).toContain('&lt;script&gt;')
      expect(owner.html).toContain('&lt;script&gt;')
      expect(team.subject).not.toMatch(/[\r\n]/)
    })
  }
})

describe('placeRejectionEmail', () => {
  const REJECT = {
    ownerName: 'Sami Khoury',
    businessName: 'Cafe Cedar',
    reference: 'VD-42',
    reason: 'The address could not be found.',
    shareReason: false,
    locale: 'en' as const,
    origin: 'https://vardenia.example',
  }

  it('says it was not accepted, with the reference and how to apply again', () => {
    const mail = placeRejectionEmail(REJECT)
    expect(mail.subject).toBe('About your Vardenia listing')
    for (const part of [mail.html, mail.text]) {
      expect(part).toContain('Cafe Cedar')
      expect(part).toContain('VD-42')
      expect(part).toContain('https://vardenia.example/magazine-places')
    }
  })

  it('leaves the reason out unless staff chose to share it', () => {
    const hidden = placeRejectionEmail(REJECT)
    expect(hidden.html).not.toContain('address could not be found')
    expect(hidden.text).not.toContain('address could not be found')
    const shared = placeRejectionEmail({ ...REJECT, shareReason: true })
    expect(shared.html).toContain('address could not be found')
    expect(shared.text).toContain('address could not be found')
  })

  it('escapes staff text and the business name', () => {
    const mail = placeRejectionEmail({
      ...REJECT,
      businessName: '<b>Cafe</b>',
      reason: '<script>alert(1)</script>',
      shareReason: true,
    })
    expect(mail.html).not.toContain('<script>')
    expect(mail.html).not.toContain('<b>Cafe</b>')
    expect(mail.html).toContain('&lt;script&gt;')
  })

  it('has no payment wording and no admin link', () => {
    const mail = placeRejectionEmail({ ...REJECT, shareReason: true })
    expect(`${mail.html}${mail.text}`).not.toMatch(/pay|whish|\$|admin/i)
  })

  it('is in Arabic, right to left, with the Arabic apply link, and falls back to English otherwise', () => {
    const ar = placeRejectionEmail({ ...REJECT, locale: 'ar' })
    expect(ar.html).toContain('lang="ar"')
    expect(ar.html).toContain('dir="rtl"')
    expect(ar.html).toContain('https://vardenia.example/ar/magazine-places')
    expect(ar.subject).not.toBe('About your Vardenia listing')
    const fr = placeRejectionEmail({ ...REJECT, locale: 'fr' })
    expect(fr.subject).toBe('About your Vardenia listing')
    expect(fr.html).toContain('dir="ltr"')
  })
})
