import { describe, expect, it } from 'vitest'
import { LOCALES } from '@vardenia/i18n'
import { attendanceEmailContent } from './attendance-email'

describe('the "Did you go?" email', () => {
  const args = {
    name: 'Rima',
    place: 'Bonsoir Zaza',
    start: new Date('2026-11-02T18:00:00Z'),
    yesUrl: 'https://vardenia.com/visit/1.abc?answer=came',
    noUrl: 'https://vardenia.com/visit/1.abc?answer=did-not-come',
  }

  it.each(LOCALES)('is written in %s with the place and both answers', (locale) => {
    const mail = attendanceEmailContent({ ...args, locale })
    expect(mail.subject).toContain('Bonsoir Zaza')
    expect(mail.html).toContain('answer=came')
    expect(mail.html).toContain('answer=did-not-come')
    expect(mail.text).toContain(args.noUrl)
  })

  it('lays Arabic and Urdu out right to left', () => {
    expect(attendanceEmailContent({ ...args, locale: 'ar' }).html).toContain('dir="rtl"')
    expect(attendanceEmailContent({ ...args, locale: 'ur' }).html).toContain('dir="rtl"')
    expect(attendanceEmailContent({ ...args, locale: 'en' }).html).toContain('dir="ltr"')
  })

  it('shows the visit in Beirut time', () => {
    // 18:00 UTC is 20:00 in Beirut in November.
    expect(attendanceEmailContent({ ...args, locale: 'en' }).text).toContain('20:00')
  })
})
