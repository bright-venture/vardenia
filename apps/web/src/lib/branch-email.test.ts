import { describe, expect, it } from 'vitest'
import { branchRequestEmails } from './branch-email'

const args = {
  listingId: 77,
  branchName: 'Cafe <Nour> Jounieh',
  sourceName: 'Cafe "Nour"',
  brandName: 'Cafe Nour',
  brandCreated: true,
  governorate: 'keserwan',
  city: 'jounieh',
  address: 'Main road & sea',
  partnerName: 'Rita <script>',
  partnerEmail: 'owner@example.com',
  locale: 'en' as const,
  origin: 'https://vardenia.example',
}

describe('branchRequestEmails', () => {
  it('tells the team, with an admin link and every value escaped', () => {
    const { team } = branchRequestEmails(args)
    expect(team.subject).toBe('New branch requested: Cafe <Nour> Jounieh')
    expect(team.html).toContain('https://vardenia.example/admin/collections/businesses/77')
    expect(team.html).toContain('Cafe &lt;Nour&gt; Jounieh')
    expect(team.html).toContain('Rita &lt;script&gt;')
    expect(team.html).toContain('Main road &amp; sea')
    expect(team.html).not.toContain('<script>')
    expect(team.html).toContain('new brand')
  })

  it('keeps line breaks out of the subject', () => {
    const { team } = branchRequestEmails({ ...args, branchName: 'A\r\nBcc: x@y.z' })
    expect(team.subject).not.toMatch(/[\r\n]/)
  })

  it('thanks the partner in English, with no link', () => {
    const { partner } = branchRequestEmails(args)
    expect(partner.subject).toBe('We have received your new branch')
    expect(partner.html).toContain('dir="ltr"')
    expect(partner.html).toContain('Cafe &lt;Nour&gt; Jounieh')
    expect(partner.html).not.toContain('<a ')
  })

  it('writes to an Arabic partner in Arabic, right to left', () => {
    const { partner } = branchRequestEmails({ ...args, locale: 'ar' })
    expect(partner.html).toContain('dir="rtl"')
    expect(partner.html).toContain('lang="ar"')
    expect(partner.subject).toMatch(/[\u0600-\u06ff]/)
  })

  it('falls back to English for other languages', () => {
    const { partner } = branchRequestEmails({ ...args, locale: 'fr' })
    expect(partner.subject).toBe('We have received your new branch')
  })
})
