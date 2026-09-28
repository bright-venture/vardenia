// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'

/**
 * The questioned-lines box, driven the way staff use it: read the venue's
 * reason, press a button, see the total change before saving.
 *
 * Payload's form hooks are mocked. The box only reads fields through
 * useFormFields and writes one through useField, so a plain object of
 * `lines.0.amount`-style paths is the whole form as far as it can tell.
 */

;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const form = vi.hoisted(() => ({
  fields: {} as Record<string, { value: unknown }>,
  set: vi.fn(),
}))

vi.mock('@payloadcms/ui', () => ({
  useFormFields: <T,>(select: (context: [Record<string, { value: unknown }>]) => T) =>
    select([form.fields]),
  useField: ({ path }: { path: string }) => ({
    value: form.fields[path]?.value,
    setValue: (value: unknown) => form.set(path, value),
  }),
}))

const { StatementDisputes } = await import('./StatementDisputes')

function line(index: number, values: Record<string, unknown>) {
  for (const [key, value] of Object.entries(values)) {
    form.fields[`lines.${index}.${key}`] = { value }
  }
}

let container: HTMLDivElement
let root: Root

function render() {
  act(() => root.render(<StatementDisputes />))
  return container.textContent ?? ''
}

const button = (label: string) =>
  [...container.querySelectorAll('button')].find((b) => b.textContent === label)

beforeEach(() => {
  form.fields = { vatRate: { value: 0 } }
  form.set.mockReset()
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
})

describe('StatementDisputes', () => {
  it('says there is nothing to answer when no line was questioned', () => {
    line(0, { reference: 'HX8PM8VW', day: '2026-07-02', amount: 16, disputeOutcome: 'none' })
    expect(render()).toContain('has not questioned any line')
    expect(button('Remove from the bill')).toBeUndefined()
  })

  it("shows a waiting line with the venue's reason and both choices", () => {
    line(0, { reference: 'HX8PM8VW', day: '2026-07-02', amount: 16, disputeOutcome: 'none' })
    line(1, {
      reference: 'VTZENHNV',
      day: '2026-07-19',
      amount: 18,
      disputeOutcome: 'open',
      disputeReason: 'The guest never came.',
    })

    const text = render()
    expect(text).toContain('1 waiting for a decision')
    expect(text).toContain('19 Jul 2026 · VTZENHNV · $18.00')
    expect(text).toContain('"The guest never came."')
    // The line nobody questioned is not listed.
    expect(text).not.toContain('HX8PM8VW')
    expect(button('Remove from the bill')).toBeDefined()
    expect(button('Keep on the bill')).toBeDefined()
  })

  it('sets the line outcome from the buttons, on that line only', () => {
    line(0, { reference: 'A', amount: 10, disputeOutcome: 'none' })
    line(1, { reference: 'B', amount: 18, disputeOutcome: 'open', disputeReason: 'x' })
    render()

    act(() => button('Remove from the bill')!.click())
    expect(form.set).toHaveBeenLastCalledWith('lines.1.disputeOutcome', 'upheld')

    act(() => button('Keep on the bill')!.click())
    expect(form.set).toHaveBeenLastCalledWith('lines.1.disputeOutcome', 'rejected')
  })

  it('takes a removed line off the total, by the same rule as the server', () => {
    line(0, { reference: 'A', amount: 10, disputeOutcome: 'none' })
    line(1, { reference: 'B', amount: 18, disputeOutcome: 'upheld', disputeReason: 'x' })
    line(2, { reference: 'C', amount: 8, disputeOutcome: 'rejected', disputeReason: 'y' })

    const text = render()
    expect(text).toContain('Total after saving: $18.00')
    expect(text).toContain('Removed from the bill. The venue does not pay $18.00')
    expect(text).toContain('Kept on the bill. The venue pays $8.00')
    expect(text).not.toContain('waiting for a decision')
  })

  it('lets a decision be reopened', () => {
    line(0, { reference: 'B', amount: 18, disputeOutcome: 'rejected', disputeReason: 'x' })
    render()
    act(() => button('Change decision')!.click())
    expect(form.set).toHaveBeenLastCalledWith('lines.0.disputeOutcome', 'open')
  })
})
