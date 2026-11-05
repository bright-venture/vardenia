// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import type { ComponentProps } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { AccountEmptyState } from './AccountEmptyState'

vi.mock('../../i18n/routing', () => ({ Link: (props: ComponentProps<'a'>) => <a {...props} /> }))

describe('account empty states', () => {
  it.each(['saved', 'bookings', 'receipts', 'scans'] as const)(
    'renders a quiet %s state without inventing an action',
    (kind) => {
      const container = document.createElement('div')
      container.innerHTML = renderToStaticMarkup(
        <AccountEmptyState kind={kind} message="Nothing here yet." />,
      )
      expect(container.querySelector('p')?.textContent).toBe('Nothing here yet.')
      expect(container.querySelector('a')).toBeNull()
      expect(container.querySelector('[aria-hidden="true"] svg')).not.toBeNull()
      expect(container.querySelector('[role="alert"]')).toBeNull()
    },
  )

  it('preserves translated copy and exposes a keyboard-visible recovery action', () => {
    const container = document.createElement('div')
    container.innerHTML = renderToStaticMarkup(
      <AccountEmptyState
        kind="saved"
        message="لم تحفظ أي مكان بعد."
        action={{ href: '/directory', label: 'تصفح الدليل' }}
      />,
    )
    const action = container.querySelector('a')!
    expect(action.getAttribute('href')).toBe('/directory')
    expect(action.textContent).toBe('تصفح الدليل')
    expect(action.className).toContain('min-h-11')
    expect(action.className).toContain('focus-visible:outline')
    expect(container.querySelector('p')?.textContent).toBe('لم تحفظ أي مكان بعد.')
  })
})
