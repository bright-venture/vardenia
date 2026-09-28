// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'

/**
 * The statement's lines as a table: nothing to edit, the booking one click
 * away, and a removed line visibly out of the subtotal.
 */

;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const form = vi.hoisted(() => ({ fields: {} as Record<string, { value: unknown }> }))

vi.mock('@payloadcms/ui', () => ({
  useFormFields: <T,>(select: (context: [Record<string, { value: unknown }>]) => T) =>
    select([form.fields]),
}))

vi.mock('next/link', () => ({
  default: ({ href, children }: { href: string; children: React.ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}))

const { StatementLines } = await import('./StatementLines')

function line(index: number, values: Record<string, unknown>) {
  for (const [key, value] of Object.entries(values)) {
    form.fields[`lines.${index}.${key}`] = { value }
  }
}

let container: HTMLDivElement
let root: Root

function render() {
  act(() => root.render(<StatementLines path="lines" />))
  return container
}

beforeEach(() => {
  form.fields = {}
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
})

describe('StatementLines', () => {
  it('shows every line as a row with nothing to type into', () => {
    line(0, {
      booking: 41,
      reference: 'HX8PM8VW',
      day: '2026-07-02',
      unit: 'night',
      quantity: 2,
      rate: 8,
      amount: 16,
      disputeOutcome: 'none',
    })
    line(1, {
      booking: { id: 42 },
      reference: 'VTZENHNV',
      day: '2026-07-14',
      unit: 'guest',
      quantity: 1,
      rate: 24,
      amount: 24,
      disputeOutcome: 'open',
    })

    const view = render()
    expect(view.querySelectorAll('input, select, textarea')).toHaveLength(0)

    const text = view.textContent ?? ''
    expect(text).toContain('2 Jul 2026')
    expect(text).toContain('2 nights')
    expect(text).toContain('1 guest')
    expect(text).toContain('Questioned: decide above')

    const links = [...view.querySelectorAll('a')].map((a) => [
      a.textContent,
      a.getAttribute('href'),
    ])
    expect(links).toEqual([
      ['HX8PM8VW', '/admin/collections/bookings/41'],
      ['VTZENHNV', '/admin/collections/bookings/42'],
    ])
  })

  it('leaves a removed line out of the subtotal and marks it', () => {
    line(0, {
      reference: 'A',
      day: '2026-07-02',
      unit: 'night',
      quantity: 2,
      rate: 8,
      amount: 16,
      disputeOutcome: 'none',
    })
    line(1, {
      reference: 'B',
      day: '2026-07-19',
      unit: 'night',
      quantity: 2,
      rate: 9,
      amount: 18,
      disputeOutcome: 'upheld',
    })

    const view = render()
    const text = view.textContent ?? ''
    expect(text).toContain('1 of 2 bookings counted')
    expect(text).toContain('$16.00before VAT')
    expect(view.querySelectorAll('tr.is-removed')).toHaveLength(1)
    expect(text).toContain('Removed from the bill')
  })

  it('says so when a statement has no lines', () => {
    expect(render().textContent).toContain('No bookings on this statement.')
  })
})
