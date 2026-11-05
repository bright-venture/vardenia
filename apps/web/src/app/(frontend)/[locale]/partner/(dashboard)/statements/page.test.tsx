// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import type { ComponentProps } from 'react'
import Page from './page'

const state = vi.hoisted(() => ({ statements: [] as Record<string, unknown>[] }))
vi.mock('../../../../../../lib/session', () => ({
  currentOwner: async () => ({ businessIds: [1] }),
}))
vi.mock('../../../../../../lib/owner-statements', () => ({
  ownerStatements: async () => state.statements,
}))
vi.mock('../../../../../../i18n/routing', () => ({
  Link: (props: ComponentProps<'a'>) => <a {...props} />,
}))
vi.mock('next-intl/server', () => ({
  getTranslations: async () => (key: string) => key,
  setRequestLocale: () => {},
}))
vi.mock('../../../../../../components/editorial/PageHero', () => ({ PageHero: () => null }))
vi.mock('../../../../../../lib/statement-format', () => ({
  STATE_KEY: { paid: 'statementStatePaid', overdue: 'statementStateOverdue' },
  dayLabel: (date: string) => date,
  money: (value: number) => `$${value}`,
  monthLabel: (period: string) => period,
}))

async function render() {
  const container = document.createElement('div')
  container.innerHTML = renderToStaticMarkup(
    await Page({ params: Promise.resolve({ locale: 'en' }) }),
  )
  return container
}

describe('partner statement states', () => {
  it('shows the existing first-statement explanation without an empty table', async () => {
    state.statements = []
    const container = await render()
    expect(container.textContent).toContain('statementsNone')
    expect(container.querySelector('table')).toBeNull()
  })

  it('contains wide statements in a labelled keyboard-accessible region', async () => {
    state.statements = [
      {
        id: 7,
        period: '2026-10',
        venue: 'A long venue name',
        number: 'INV-2026-00007',
        total: 1234,
        state: 'paid',
      },
    ]
    const container = await render()
    const region = container.querySelector('[role="region"]')!
    expect(region.getAttribute('aria-label')).toBe('tabStatements')
    expect(region.getAttribute('tabindex')).toBe('0')
    expect(region.className).toContain('overflow-x-auto')
    expect(region.querySelectorAll('th[scope="col"]')).toHaveLength(4)
    expect(region.querySelector('caption')?.textContent).toBe('tabStatements')
    expect(region.querySelector('a')?.getAttribute('href')).toBe('/partner/statements/7')
    expect(region.textContent).toContain('$1234')
    expect(region.textContent).toContain('statementStatePaid')
  })
})
