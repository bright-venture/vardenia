// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'

;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const form = vi.hoisted(() => ({
  fields: {} as Record<string, { value: unknown }>,
  id: 7 as number | undefined,
}))

vi.mock('@payloadcms/ui', () => ({
  useDocumentInfo: () => ({ id: form.id }),
  useFormFields: <T,>(select: (context: [Record<string, { value: unknown }>]) => T) =>
    select([form.fields]),
}))

const { RejectSubmission } = await import('./RejectSubmission')

let container: HTMLDivElement
let root: Root

const render = () => act(() => root.render(<RejectSubmission />))
const button = (label: string) =>
  [...container.querySelectorAll('button')].find((b) => b.textContent === label)

beforeEach(() => {
  form.id = 7
  form.fields = {
    'submission.status': { value: 'pending' },
    'submission.ownerName': { value: 'Sami' },
    _status: { value: 'draft' },
  }
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
})
afterEach(() => {
  act(() => root.unmount())
  container.remove()
  vi.restoreAllMocks()
})

describe('RejectSubmission', () => {
  it.each(['pending', 'incomplete'])('is offered for %s', (status) => {
    form.fields['submission.status'] = { value: status }
    render()
    expect(button('Reject submission')).toBeTruthy()
  })

  it.each(['approved', 'rejected', 'accepted', 'abandoned', undefined])(
    'is not offered for %s',
    (status) => {
      form.fields['submission.status'] = { value: status }
      render()
      expect(container.innerHTML).toBe('')
    },
  )

  it('is not offered on a published listing, or before the listing is saved', () => {
    form.fields._status = { value: 'published' }
    render()
    expect(container.innerHTML).toBe('')
    form.fields._status = { value: 'draft' }
    form.id = undefined
    render()
    expect(container.innerHTML).toBe('')
  })

  it('cannot be pressed without a reason', () => {
    render()
    expect((button('Reject submission') as HTMLButtonElement).disabled).toBe(true)
  })

  it('asks twice, then posts the reason and the share choice', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ ok: true }), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
    const reload = vi.fn()
    vi.stubGlobal('location', { ...window.location, reload })
    render()
    const area = container.querySelector('textarea')!
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!
      setter.call(area, 'Not a real business')
      area.dispatchEvent(new Event('input', { bubbles: true }))
    })
    await act(async () =>
      container.querySelector<HTMLInputElement>('input[type=checkbox]')!.click(),
    )
    await act(async () => button('Reject submission')!.click())
    expect(fetchMock).not.toHaveBeenCalled()
    await act(async () => button('Yes, reject it')!.click())
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('/api/reject-submission')
    expect(JSON.parse(String(init.body))).toEqual({
      businessId: 7,
      reason: 'Not a real business',
      shareReason: true,
    })
    expect(reload).toHaveBeenCalled()
  })

  it('shows the server message when it refuses', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () => new Response(JSON.stringify({ error: 'Already rejected.' }), { status: 409 }),
      ),
    )
    render()
    const area = container.querySelector('textarea')!
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!
      setter.call(area, 'x')
      area.dispatchEvent(new Event('input', { bubbles: true }))
    })
    await act(async () => button('Reject submission')!.click())
    await act(async () => button('Yes, reject it')!.click())
    expect(container.querySelector('[role=alert]')?.textContent).toBe('Already rejected.')
  })
})
