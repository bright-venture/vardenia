// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import type { ComponentProps } from 'react'
import { PassportBook } from './PassportBook'
import type { PassportView } from '../../lib/passport'

vi.mock('next-intl/server', () => ({ getTranslations: async () => (key: string) => key }))
vi.mock('../../i18n/routing', () => ({ Link: (props: ComponentProps<'a'>) => <a {...props} /> }))
vi.mock('next/image', () => ({ default: () => <span data-testid="brand-mark" /> }))

const empty: PassportView = { stamps: [], pending: [], points: 0, milestones: [] }
async function render(passport = empty) {
  const container = document.createElement('div')
  container.innerHTML = renderToStaticMarkup(
    await PassportBook({ holder: 'Guest', passport, locale: 'en' }),
  )
  return container
}

describe('passport layout', () => {
  it('keeps six decorative stamp spaces in a narrow-screen single column', async () => {
    const container = await render()
    const grid = container.querySelector('ul')!
    expect(grid.className).toContain('grid-cols-1')
    expect(grid.className).toContain('min-[480px]:grid-cols-2')
    expect(grid.querySelectorAll('li[aria-hidden="true"]')).toHaveLength(6)
    expect(container.querySelector('a[href="/directory"]')).not.toBeNull()
    expect(container.querySelector('h1')?.textContent).toBe('title')
  })

  it('retains milestone labels and values while allowing their labels to wrap', async () => {
    const container = await render({
      ...empty,
      milestones: [{ key: 'first', count: 1, target: 1, reached: true }],
    })
    const progress = container.querySelector('[role="progressbar"]')!
    expect(progress.getAttribute('aria-label')).toBe('milestone.first')
    expect(progress.getAttribute('aria-valuenow')).toBe('1')
    expect(progress.getAttribute('aria-valuemax')).toBe('1')
    expect(progress.previousElementSibling?.className).toContain('flex-wrap')
  })
})
