// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { createTranslator, NextIntlClientProvider } from 'next-intl'
import { getMessages } from '@vardenia/i18n/messages'
import type { HideablePage } from '../lib/hideable-pages'

const hidden = vi.hoisted(() => ({ pages: [] as HideablePage[] }))

vi.mock('next-intl/server', () => ({
  // The footer asks for the whole catalogue and for the journey's namespace.
  getTranslations: async (namespace?: string) =>
    createTranslator({ locale: 'en', messages: getMessages('en'), namespace: namespace as never }),
}))
vi.mock('../lib/hidden-pages', async () => {
  const actual =
    await vi.importActual<typeof import('../lib/hideable-pages')>('../lib/hideable-pages')
  return { withoutHidden: actual.withoutHidden, hiddenPages: async () => hidden.pages }
})

const { SiteFooter } = await import('./SiteFooter')

async function footerLinks(pages: HideablePage[]): Promise<string[]> {
  hidden.pages = pages
  const root = document.createElement('div')
  root.innerHTML = renderToStaticMarkup(
    <NextIntlClientProvider locale="en" messages={getMessages('en')} timeZone="Asia/Beirut">
      {await SiteFooter({ locale: 'en' })}
    </NextIntlClientProvider>,
  )
  return [...root.querySelectorAll('a')].map((a) => a.textContent ?? '')
}

describe('the site footer and hidden pages', () => {
  it('shows every link when nothing is hidden', async () => {
    const links = await footerLinks([])
    for (const label of [
      'Stay',
      'Magazine',
      'Directory',
      'About',
      'Contact',
      'Add your business',
      'Partner sign in',
      'Privacy',
      'Terms',
      'Credits',
    ])
      expect(links).toContain(label)
  })

  /**
   * The Settings list on 11 November 2026: Partner sign in, a business page and
   * Contact were hidden, and the footer has to follow it. (Partner with us was
   * merged into Add your business on 25 November 2026.)
   */
  it('leaves out what Settings hides', async () => {
    const links = await footerLinks(['partner-sign-in', 'add-your-business', 'contact', 'faq'])
    expect(links).not.toContain('Partner sign in')
    expect(links).not.toContain('Add your business')
    expect(links).not.toContain('Contact')
    expect(links).not.toContain('Questions')
    expect(links).toContain('About')
    expect(links).toContain('Privacy')
  })

  it('takes Privacy, Terms and Credits out of the small print when hidden', async () => {
    const links = await footerLinks(['privacy', 'terms', 'credits'])
    expect(links).not.toContain('Privacy')
    expect(links).not.toContain('Terms')
    expect(links).not.toContain('Credits')
    expect(links).toContain('Partner sign in')
  })
})
