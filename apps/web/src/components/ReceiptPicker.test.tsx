// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'

/**
 * The receipt field on the visit page, driven as a guest uses it: pick a
 * photo, see the total filled in, send. Fetch stands in for
 * /booking/receipt/read; the messages are their keys.
 */

;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

vi.mock('next-intl', () => ({
  useLocale: () => 'en',
  useTranslations: () => (key: string, values?: Record<string, unknown>) =>
    values ? `${key} ${JSON.stringify(values)}` : key,
}))

const { ReceiptPicker } = await import('./ReceiptPicker')

const fetchMock = vi.fn()
let container: HTMLDivElement
let root: Root

function form() {
  return container.querySelector('form')!
}
const amount = () => form().elements.namedItem('amount') as HTMLInputElement
const currency = () => form().elements.namedItem('currency') as HTMLSelectElement
const sealed = () => (form().elements.namedItem('reading') as HTMLInputElement).value
const status = () => container.querySelector('[role="status"]')?.textContent ?? ''

async function render() {
  await act(async () =>
    root.render(
      <form>
        <input type="hidden" name="token" defaultValue="9.abc" />
        <ReceiptPicker id="receipt-file" label="Photo" />
        <input name="amount" defaultValue="" />
        <select name="currency" defaultValue="USD">
          <option value="USD">USD</option>
          <option value="LBP">LBP</option>
        </select>
      </form>,
    ),
  )
}

async function pick() {
  const input = container.querySelector('input[type="file"]') as HTMLInputElement
  const file = new File([new Uint8Array([0xff, 0xd8, 0xff])], 'receipt.jpg', {
    type: 'image/jpeg',
  })
  Object.defineProperty(input, 'files', { value: [file], configurable: true })
  await act(async () => {
    input.dispatchEvent(new Event('change', { bubbles: true }))
  })
}

const answer = (body: unknown) => ({ ok: true, json: async () => body })

beforeEach(() => {
  fetchMock.mockReset()
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

describe('ReceiptPicker', () => {
  it('fills in the total and currency it read, and carries the seal with the form', async () => {
    fetchMock.mockResolvedValue(
      answer({ reading: { total: 2_685_000, currency: 'LBP' }, sealed: 'body.mac' }),
    )
    await render()
    await pick()

    const [url, init] = fetchMock.mock.calls[0]!
    expect(url).toBe('/booking/receipt/read')
    expect((init.body as FormData).get('token')).toBe('9.abc')
    expect(amount().value).toBe('2685000')
    expect(currency().value).toBe('LBP')
    expect(sealed()).toBe('body.mac')
    expect(status()).toContain('receiptRead')
  })

  it('leaves a total the guest typed alone', async () => {
    fetchMock.mockResolvedValue(
      answer({ reading: { total: 84.5, currency: 'USD' }, sealed: 'body.mac' }),
    )
    await render()
    amount().value = '90'
    await pick()
    expect(amount().value).toBe('90')
    expect(status()).toContain('receiptRead')
  })

  it('asks the guest to type it when nothing could be read', async () => {
    fetchMock.mockResolvedValue(answer({ reading: null }))
    await render()
    await pick()
    expect(status()).toBe('receiptNotRead')
    expect(sealed()).toBe('')
  })

  it('says nothing when reading is not set up', async () => {
    fetchMock.mockResolvedValue(answer({ reading: null, off: true }))
    await render()
    await pick()
    expect(status()).toBe('')
  })
})
