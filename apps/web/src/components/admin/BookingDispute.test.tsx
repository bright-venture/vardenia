// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'

/**
 * The disputed-visit box on a booking, driven the way staff use it: read the
 * venue's account, the guest's and the receipt, press a button, then Save.
 *
 * Payload's form hooks are mocked with a plain object of fields, and fetch
 * with the receipt the REST API would return to a staff member.
 */

;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const form = vi.hoisted(() => ({
  fields: {} as Record<string, { value: unknown; initialValue?: unknown }>,
  set: vi.fn(),
}))

vi.mock('@payloadcms/ui', () => ({
  useFormFields: <T,>(select: (context: [typeof form.fields]) => T) => select([form.fields]),
  useField: ({ path }: { path: string }) => ({
    value: form.fields[path]?.value,
    initialValue: form.fields[path]?.initialValue,
    setValue: (value: unknown) => form.set(path, value),
  }),
}))

const { BookingDispute } = await import('./BookingDispute')

const RECEIPT = {
  id: 9,
  booking: 41,
  url: '/api/receipts/file/receipt-abc.jpg',
  mimeType: 'image/jpeg',
  amount: 84.5,
  currency: 'USD',
  createdAt: '2026-11-03T18:00:00.000Z',
}

const fetchMock = vi.fn()

function booking(values: Record<string, unknown>, verdict: unknown = null) {
  form.fields = {
    reference: { value: 'VTZENHNV' },
    status: { value: 'completed', initialValue: 'completed' },
    end: { value: '2026-11-02T20:00:00.000Z' },
    guestAnswer: { value: 'came' },
    amount: { value: 120 },
    guestAmount: { value: 85 },
    receipt: { value: null },
    attendanceVerdict: { value: verdict, initialValue: verdict },
  }
  for (const [key, value] of Object.entries(values)) {
    form.fields[key] = { value, initialValue: value }
  }
}

let container: HTMLDivElement
let root: Root

async function render() {
  await act(async () => root.render(<BookingDispute />))
  return container.textContent ?? ''
}

const button = (label: string) =>
  [...container.querySelectorAll('button')].find((b) => b.textContent === label)

beforeEach(() => {
  form.set.mockReset()
  fetchMock.mockReset()
  fetchMock.mockResolvedValue({ ok: true, json: async () => RECEIPT })
  vi.stubGlobal('fetch', fetchMock)
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
  vi.unstubAllGlobals()
})

describe('BookingDispute', () => {
  it('shows nothing on an ordinary booking with no dispute and no receipt', async () => {
    booking({ amount: 85 })
    expect(await render()).toBe('')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('lays out both accounts and the receipt when they disagree on the amount', async () => {
    booking({ receipt: 9 })
    const text = await render()

    expect(text).toContain('Disputed visit')
    expect(text).toContain('Waiting for a decision')
    expect(text).toContain('disagree on what was spent')
    expect(text).toContain('Spent: $120.00')
    expect(text).toContain('Spent: $85.00')
    expect(text).toContain('$84.50')

    // The file itself, through Payload's access check with the staff session.
    expect(fetchMock.mock.calls[0]![0]).toMatch(/^\/api\/receipts\/9\?/)
    expect(fetchMock.mock.calls[0]![1]).toMatchObject({ credentials: 'same-origin' })
    const img = container.querySelector('img')
    expect(img?.getAttribute('src')).toBe(RECEIPT.url)
  })

  it('says so when the guest sent no receipt', async () => {
    booking({ status: 'no-show' })
    const text = await render()
    expect(text).toContain('says they came, but the venue says they did not')
    expect(text).toContain('The guest has not sent one.')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('sets the team decision from the buttons', async () => {
    booking({})
    await render()
    act(() => button('The guest is right')!.click())
    expect(form.set).toHaveBeenLastCalledWith('attendanceVerdict', 'guest')
    act(() => button('The venue is right')!.click())
    expect(form.set).toHaveBeenLastCalledWith('attendanceVerdict', 'venue')
  })

  it('shows a saved decision, and lets it be reopened', async () => {
    booking({}, 'venue')
    const text = await render()
    expect(text).toContain('Decided')
    expect(text).toContain('The venue is right.')
    expect(text).not.toContain('Waiting for a decision')
    act(() => button('Change decision')!.click())
    expect(form.set).toHaveBeenLastCalledWith('attendanceVerdict', null)
  })

  it('shows the receipt on its own when nobody disagrees', async () => {
    booking({ amount: 85, receipt: 9 })
    const text = await render()
    expect(text).toContain("The guest's receipt")
    expect(text).toContain('$84.50')
    expect(button('The guest is right')).toBeUndefined()
  })

  it('links a PDF receipt instead of showing it as a picture', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        ...RECEIPT,
        mimeType: 'application/pdf',
        currency: 'LBP',
        amount: 2_500_000,
      }),
    })
    booking({ receipt: 9 })
    const text = await render()
    expect(container.querySelector('img')).toBeNull()
    expect(text).toContain('Open the PDF receipt')
    expect(text).toContain('2,500,000 LBP')
  })
})
