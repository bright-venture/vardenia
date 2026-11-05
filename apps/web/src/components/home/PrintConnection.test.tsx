// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { NextIntlClientProvider } from 'next-intl'
import { getMessages } from '@vardenia/i18n/messages'
import { PrintConnection } from './PrintConnection'

vi.mock('../journey/browser-state', () => ({ useJourneyMotion: () => [false] }))
vi.mock('./usePrintScan', () => ({
  usePrintScan: () => ({ phase: 3, replay: vi.fn(), reveal: vi.fn() }),
}))
for (const locale of ['en', 'ar'] as const) {
  describe(`paper-to-place ${locale}`, () => {
    it('retains the actual QR, direct destination and accessible page in motion-off layout', () => {
      const root = document.createElement('div')
      root.innerHTML = renderToStaticMarkup(
        <NextIntlClientProvider
          locale={locale}
          messages={getMessages(locale)}
          timeZone="Asia/Beirut"
        >
          <PrintConnection
            qr="data:image/svg+xml,test"
            target={{
              title: 'Existing destination',
              image: null,
              href: '/listing/existing',
              liveCode: true,
            }}
          />
        </NextIntlClientProvider>,
      )
      expect(root.querySelectorAll('.vd-print-step-number')).toHaveLength(3)
      expect(root.querySelectorAll('.vd-print-steps [aria-current="step"]')).toHaveLength(1)
      expect(root.querySelector('.vd-print-symbol img')?.getAttribute('src')).toBe(
        'data:image/svg+xml,test',
      )
      expect(
        [...root.querySelectorAll('a')].every(
          (a) => a.getAttribute('href') === '/listing/existing',
        ),
      ).toBe(true)
      expect(root.querySelector('.vd-scan-live-page')?.getAttribute('aria-hidden')).toBe('false')
      expect(root.querySelector('.vd-scan-live-page')?.hasAttribute('inert')).toBe(false)
      expect(root.querySelector('.vd-scan-replay')).toBeNull()
    })
  })
}
