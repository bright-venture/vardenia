import { describe, expect, it, vi } from 'vitest'
import { getMessages } from '@vardenia/i18n/messages'

vi.mock('next-intl/server', () => ({
  getTranslations: async ({ locale }: { locale: 'en' | 'ar' }) => {
    const messages = getMessages(locale).scan
    return (key: keyof typeof messages) => messages[key]
  },
  setRequestLocale: vi.fn(),
}))
vi.mock('../i18n/routing', () => ({ Link: 'a' }))

import { generateMetadata as moved } from '../app/(frontend)/[locale]/scan/moved/page'
import { generateMetadata as missing } from '../app/(frontend)/[locale]/scan/not-found/page'

describe('localized QR recovery metadata', () => {
  for (const locale of ['en', 'ar'] as const) {
    it(`uses the existing ${locale} copy and keeps recovery pages out of search`, async () => {
      const params = Promise.resolve({ locale })
      expect(await moved({ params })).toEqual({
        title: getMessages(locale).scan.moved,
        robots: { index: false, follow: false },
      })
      expect(await missing({ params })).toEqual({
        title: getMessages(locale).scan.notFound,
        robots: { index: false, follow: false },
      })
    })
  }
})
