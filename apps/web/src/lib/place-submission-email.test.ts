import { describe, expect, it } from 'vitest'
import { placeSubmissionEmails } from './place-submission-email'

const BASE = {
  businessId: 42,
  businessName: 'Cafe Cedar',
  governorate: 'beirut',
  listingNumber: 17,
  issueTitle: 'Summer 2027',
  ownerName: 'Sami Khoury',
  ownerEmail: 'sami@example.com',
  ownerPhone: '+961 70 123456',
  locale: 'en' as const,
  origin: 'https://vardenia.example',
}

describe('the team email', () => {
  const { team } = placeSubmissionEmails(BASE)

  it('names the business, area, number, issue and owner', () => {
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

  it('links to the listing in the admin', () => {
    expect(team.html).toContain('https://vardenia.example/admin/collections/businesses/42')
  })
})

describe('the owner email', () => {
  it('thanks them, says it is under review and carries no admin link', () => {
    const { owner } = placeSubmissionEmails(BASE)
    expect(owner.html).toMatch(/under review/i)
    expect(owner.html).toMatch(/nothing is public/i)
    expect(owner.html).not.toContain('/admin')
    expect(owner.html).toContain('dir="ltr"')
    expect(owner.html).toContain('lang="en"')
  })

  it('has a plain-text part, in its language, with no admin link', () => {
    const en = placeSubmissionEmails(BASE).owner.text
    expect(en).toMatch(/under review/i)
    expect(en).not.toContain('/admin')
    const ar = placeSubmissionEmails({ ...BASE, locale: 'ar' }).owner.text
    expect(ar).toContain('قيد المراجعة')
    expect(ar).not.toMatch(/under review/i)
  })

  it('is right to left in Arabic', () => {
    const { owner } = placeSubmissionEmails({ ...BASE, locale: 'ar' })
    expect(owner.html).toContain('dir="rtl"')
    expect(owner.html).toContain('lang="ar"')
    expect(owner.html).not.toMatch(/under review/i)
    expect(owner.html).not.toContain('/admin')
  })

  it('falls back to English copy, in a matching direction, for other languages', () => {
    const { owner } = placeSubmissionEmails({ ...BASE, locale: 'ur' })
    expect(owner.html).toMatch(/under review/i)
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
      })
      for (const mail of [team, owner]) {
        expect(mail.html).not.toContain('<script>')
        expect(mail.html).not.toContain(evil)
      }
      expect(team.html).toContain('&lt;script&gt;')
      expect(owner.html).toContain('&lt;script&gt;')
      expect(team.subject).not.toMatch(/[\r\n]/)
    })
  }
})
