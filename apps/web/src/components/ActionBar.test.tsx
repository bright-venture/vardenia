// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { createTranslator } from 'next-intl'
import { getMessages } from '@vardenia/i18n/messages'
import { mapsLink } from '../lib/maps-link'
import { ActionBar } from './ActionBar'

const state = vi.hoisted(() => ({ locale: 'en' as 'en' | 'ar' }))
vi.mock('next-intl/server', () => ({
  getTranslations: async () =>
    createTranslator({
      locale: state.locale,
      messages: getMessages(state.locale),
      namespace: 'directory',
    }),
}))

describe('ActionBar', () => {
  for (const locale of ['en', 'ar'] as const) {
    it(`labels the group in ${locale} and preserves the directions action`, async () => {
      state.locale = locale
      const props = {
        name: 'Le Royal Hotels and Resorts Beirut',
        coordinates: [35.6, 33.9] as [number, number],
      }
      const html = renderToStaticMarkup(await ActionBar(props))
      const root = document.createElement('div')
      root.innerHTML = html
      const label = getMessages(locale).directory.getDirections
      const group = root.querySelector('[role="group"]')!
      expect(group.getAttribute('aria-label')).toBe(`${label}: ${props.name}`)
      const links = group.querySelectorAll('a')
      expect(links).toHaveLength(1)
      expect(links[0]!.textContent).toBe(label)
      expect(links[0]!.getAttribute('href')).toBe(mapsLink(props))
      expect(links[0]!.getAttribute('target')).toBe('_blank')
      expect(links[0]!.getAttribute('rel')).toBe('noopener noreferrer')
      expect(html).not.toContain('Actions for')
    })
  }
})
