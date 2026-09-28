// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'

/**
 * The booking card offers only the moves the saved status allows, the way the
 * venue dashboard does, instead of a dropdown of all five statuses.
 */

;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const form = vi.hoisted(() => ({
  fields: {} as Record<string, { value: unknown; initialValue?: unknown }>,
  set: vi.fn(),
}))

vi.mock('@payloadcms/ui', () => ({
  useFormFields: <T,>(select: (context: [Record<string, { value: unknown }>]) => T) =>
    select([form.fields]),
  useField: ({ path }: { path: string }) => ({
    value: form.fields[path]?.value,
    initialValue: form.fields[path]?.initialValue,
    setValue: (value: unknown) => {
      form.set(path, value)
      form.fields[path] = { ...form.fields[path], value }
    },
  }),
}))

vi.mock('next/link', () => ({
  default: ({ href, children }: { href: string; children: React.ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}))

const { BookingCard, when } = await import('./BookingCard')

const DAY = 86_400_000
const iso = (offsetDays: number, hour = 20) => {
  const d = new Date(Date.now() + offsetDays * DAY)
  d.setUTCHours(hour - 3, 0, 0, 0) // Beirut is UTC+3 in summer
  return d.toISOString()
}

function booking(status: string, { past = false } = {}) {
  form.fields = {
    reference: { value: 'HX8PM8VW' },
    business: { value: 10 },
    customer: { value: 5 },
    start: { value: iso(past ? -3 : 3, 20) },
    end: { value: iso(past ? -3 : 3, 22) },
    partySize: { value: 4 },
    notes: { value: 'Window table please' },
    status: { value: status, initialValue: status },
    declineReason: { value: '' },
  }
}

let container: HTMLDivElement
let root: Root

const render = () => {
  act(() => root.render(<BookingCard />))
  return container
}
const labels = () => [...container.querySelectorAll('button')].map((b) => b.textContent)
const click = (label: string) =>
  act(() => [...container.querySelectorAll('button')].find((b) => b.textContent === label)!.click())

beforeEach(() => {
  form.set.mockReset()
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({ ok: true, json: async () => ({ name: 'Chateau Ksara' }) })),
  )
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
  vi.unstubAllGlobals()
})

describe('BookingCard', () => {
  it('offers Confirm and Decline on a request, and shows what the guest asked', () => {
    booking('pending')
    const text = render().textContent ?? ''
    expect(labels()).toEqual(['Confirm', 'Decline'])
    expect(text).toContain('4 people')
    expect(text).toContain('Window table please')
    expect(text).toContain('Waiting for the venue')
  })

  it('asks for an optional reason on a decline, and can be undone', () => {
    booking('pending')
    render()
    click('Decline')
    expect(form.set).toHaveBeenLastCalledWith('status', 'cancelled')
    render()
    expect(container.querySelector('input')).not.toBeNull()
    expect(container.textContent).toContain('press Save')
    click('Undo')
    expect(form.set).toHaveBeenLastCalledWith('status', 'pending')
  })

  it('does not offer completed or no-show before the booking has happened', () => {
    booking('confirmed')
    render()
    expect(labels()).toEqual(['Cancel booking'])
    expect(container.textContent).toContain('appear once the booking is over')
  })

  it('offers completed and no-show once it is over', () => {
    booking('confirmed', { past: true })
    render()
    expect(labels()).toEqual(['Cancel booking', 'Mark as completed', 'Mark as no-show'])
  })

  it('offers nothing on a finished booking', () => {
    booking('completed', { past: true })
    render()
    expect(labels()).toEqual([])
    expect(container.textContent).toContain('Nothing more happens to it')
  })
})

describe('when', () => {
  it('reads a table as one evening', () => {
    expect(when('2026-08-15T17:00:00Z', '2026-08-15T19:00:00Z')).toBe(
      'Sat, 15 Aug 2026, 20:00 to 22:00',
    )
  })

  it('reads a stay as nights', () => {
    expect(when('2026-08-15T11:00:00Z', '2026-08-18T09:00:00Z')).toBe(
      '15 Aug 2026 to 18 Aug 2026 · 3 nights',
    )
  })
})
