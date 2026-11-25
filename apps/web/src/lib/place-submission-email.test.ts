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

describe('no owner email here', () => {
  it('builds only the team alert: the owner gets E1 (lib/place-payment-email) instead', () => {
    expect(Object.keys(placeSubmissionEmails(BASE))).toEqual(['team'])
  })
})

describe('user-supplied text is escaped', () => {
  const evil = '<script>alert(1)</script>'
  it('in the team email', () => {
    const { team } = placeSubmissionEmails({
      ...BASE,
      businessName: evil,
      ownerName: evil,
      ownerPhone: evil,
      issueTitle: evil,
      reference: evil,
    })
    expect(team.html).not.toContain(evil)
    // No raw tag survives anywhere a value was inserted.
    expect(team.html).not.toMatch(/<script/i)
    expect(team.html.replace(/<[a-z/!][^>]*>/gi, '')).not.toContain('<')
    expect(team.html).toContain('&lt;script&gt;')
    expect(team.subject).not.toMatch(/[\r\n]/)
  })
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
