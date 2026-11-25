// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import type { PanelDoc } from '../../lib/payment-panel'

;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const ui = vi.hoisted(() => ({
  id: 7 as number | undefined,
  user: { id: 1, roles: ['staff'] } as { id: number; roles: string[] } | null,
  modified: false,
  fields: {} as Record<string, { value: unknown }>,
}))

vi.mock('@payloadcms/ui', () => ({
  useDocumentInfo: () => ({ id: ui.id }),
  useAuth: () => ({ user: ui.user }),
  useFormModified: () => ui.modified,
  useFormFields: <T,>(select: (context: [Record<string, { value: unknown }>]) => T) =>
    select([ui.fields]),
}))

const { PaymentReviewPanel } = await import('./PaymentReviewPanel')

let container: HTMLDivElement
let root: Root
let business: PanelDoc
let answer: { status: number; body: unknown }
let fetchMock: ReturnType<typeof vi.fn>
let reload: ReturnType<typeof vi.fn>

const flush = () => act(async () => {})
const render = async () => {
  await act(async () => root.render(<PaymentReviewPanel />))
  await flush()
}
const buttons = () => [...container.querySelectorAll('button')].map((b) => b.textContent)
const button = (label: string) =>
  [...container.querySelectorAll('button')].find((b) => b.textContent === label) as
    HTMLButtonElement | undefined
const type = async (el: HTMLInputElement | HTMLTextAreaElement, value: string) => {
  await act(async () => {
    const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement : HTMLInputElement
    Object.getOwnPropertyDescriptor(proto.prototype, 'value')!.set!.call(el, value)
    el.dispatchEvent(new Event('input', { bubbles: true }))
  })
}
const posts = () =>
  fetchMock.mock.calls
    .filter(([, init]) => (init as RequestInit | undefined)?.method === 'POST')
    .map(([url, init]) => [url, JSON.parse(String((init as RequestInit).body))])

const awaiting = (): PanelDoc => ({
  id: 7,
  _status: 'draft',
  submission: {
    status: 'awaiting_downpayment',
    ownerName: 'Sami',
    ownerEmail: 'sami@example.com',
    ownerPhone: '03 123 456',
    payments: [],
    history: [{ id: 'h1', step: 'awaiting_downpayment', at: '2026-11-19T10:00:00.000Z' }],
    payment: {
      stage: 'none',
      price: 1000,
      downpaymentAmount: 500,
      currency: 'USD',
      downpaymentDueAt: '2099-01-01T10:00:00.000Z',
      submittedEmailSentAt: '2026-11-19T10:00:00.000Z',
    },
  },
})

beforeEach(() => {
  ui.id = 7
  ui.user = { id: 1, roles: ['staff'] }
  ui.modified = false
  ui.fields = {
    'submission.status': { value: 'awaiting_downpayment' },
    'submission.ownerName': { value: 'Sami' },
    _status: { value: 'draft' },
  }
  business = awaiting()
  answer = { status: 200, body: { ok: true } }
  fetchMock = vi.fn(async (url: string, init?: RequestInit) =>
    init?.method === 'POST'
      ? new Response(JSON.stringify(answer.body), { status: answer.status })
      : url === '/place-submissions/terms'
        ? new Response(JSON.stringify({ ok: true, price: 1000, downpaymentPercent: 40 }), {
            status: 200,
          })
        : new Response(JSON.stringify(business), { status: 200 }),
  )
  vi.stubGlobal('fetch', fetchMock)
  reload = vi.fn()
  vi.stubGlobal('location', { ...window.location, reload })
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
})
afterEach(() => {
  act(() => root.unmount())
  container.remove()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('PaymentReviewPanel', () => {
  it('reads the newest version of the business with the staff session', async () => {
    await render()
    expect(fetchMock.mock.calls[0]![0]).toBe('/api/businesses/7?depth=1&draft=true')
  })

  it('shows the status, the money and only the buttons valid now', async () => {
    await render()
    const text = container.textContent ?? ''
    expect(text).toContain('Awaiting downpayment')
    expect(text).toContain('Payment: Nothing paid')
    expect(text).toContain('Downpayment expected$500')
    expect(text).toContain('Still to pay$1000')
    expect(text).toContain('Publish: Cannot publish until fully paid.')
    expect(buttons()).toEqual([
      'Downpayment received',
      'Resend email',
      'Extend deadline',
      'Reject: not accepted',
    ])
  })

  it('adds the admin-only buttons for an admin', async () => {
    ui.user = { id: 1, roles: ['admin'] }
    await render()
    expect(buttons()).toContain('Waive downpayment (admin)')
  })

  it('renders nothing for someone who is not staff, or a listing with no submission', async () => {
    ui.user = { id: 2, roles: ['partner'] }
    await render()
    expect(container.innerHTML).toBe('')
    expect(fetchMock).not.toHaveBeenCalled()
    ui.user = { id: 1, roles: ['staff'] }
    business = { id: 7, _status: 'published', submission: { status: null } }
    await render()
    expect(container.innerHTML).toBe('')
  })

  it('records a downpayment: prefilled, Lebanon time with its zone, then reloads', async () => {
    await render()
    await act(async () => button('Downpayment received')!.click())
    const amount = container.querySelector<HTMLInputElement>('input[name=amount]')!
    const sender = container.querySelector<HTMLInputElement>('input[name=senderNumber]')!
    expect(amount.value).toBe('500')
    expect(sender.value).toBe('03 123 456')
    const submit = button('Record: downpayment received')!
    expect(submit.disabled).toBe(true)
    await type(
      container.querySelector<HTMLInputElement>('input[name=whishAt]')!,
      '2026-11-20T14:30',
    )
    expect(submit.disabled).toBe(false)
    await act(async () => submit.click())
    await flush()
    expect(posts()).toEqual([
      [
        '/api/downpayment-received',
        {
          businessId: 7,
          amount: 500,
          method: 'whish',
          senderNumber: '03 123 456',
          whishAt: '2026-11-20T14:30:00+02:00',
        },
      ],
    ])
    expect(reload).toHaveBeenCalled()
  })

  it('hides Resend email when the owner has no email, and says so', async () => {
    business = awaiting()
    business.submission!.ownerEmail = ''
    business.submission!.payment!.submittedEmailSentAt = null
    await render()
    expect(buttons()).not.toContain('Resend email')
    expect(container.textContent).toContain('has no owner email')
  })

  it('offers the re-open of a lapsed business only when its number and issue are on file', async () => {
    const lapsed = (lapsedListingNumber: number | null): PanelDoc => ({
      ...awaiting(),
      issue: 3,
      submission: {
        ...awaiting().submission,
        status: 'lapsed',
        payment: { ...awaiting().submission!.payment, lapsedListingNumber },
      },
    })
    business = lapsed(12)
    await render()
    expect(buttons()).toEqual(['Extend deadline (re-open)'])
    act(() => root.unmount())
    root = createRoot(container)
    business = lapsed(null)
    await render()
    expect(buttons()).toEqual([])
  })

  it('on an older row with no copied downpayment, expects the Settings percent like the server', async () => {
    business = awaiting()
    business.submission!.payment!.downpaymentAmount = null
    await render()
    expect(fetchMock.mock.calls.map(([url]) => url)).toContain('/place-submissions/terms')
    // 40% of 1000, as lib/place-payments recordDownpayment counts it.
    expect(container.textContent).toContain('Downpayment expected$400')
    await act(async () => button('Downpayment received')!.click())
    expect(container.querySelector<HTMLInputElement>('input[name=amount]')!.value).toBe('400')
    await type(container.querySelector<HTMLInputElement>('input[name=amount]')!, '500')
    await type(
      container.querySelector<HTMLInputElement>('input[name=whishAt]')!,
      '2026-11-20T14:30',
    )
    expect(container.textContent).toContain('The expected downpayment is $400')
    expect(button('Record: downpayment received')!.disabled).toBe(true)
  })

  it('does not read the terms when the row has its downpayment copied', async () => {
    await render()
    expect(fetchMock.mock.calls.map(([url]) => url)).not.toContain('/place-submissions/terms')
  })

  it('warns on a different amount and asks for a note before sending', async () => {
    await render()
    await act(async () => button('Downpayment received')!.click())
    await type(container.querySelector<HTMLInputElement>('input[name=amount]')!, '450')
    await type(
      container.querySelector<HTMLInputElement>('input[name=whishAt]')!,
      '2026-11-20T14:30',
    )
    expect(container.textContent).toContain('The expected downpayment is $500')
    expect(button('Record: downpayment received')!.disabled).toBe(true)
    await type(container.querySelector<HTMLTextAreaElement>('textarea[name=note]')!, 'Sent 450')
    expect(button('Record: downpayment received')!.disabled).toBe(false)
  })

  it("shows the server's refusal in its words and does not reload", async () => {
    answer = {
      status: 409,
      body: {
        error: 'This Whish transfer is already recorded on listing 9.',
        code: 'duplicate-payment',
      },
    }
    await render()
    await act(async () => button('Downpayment received')!.click())
    await type(
      container.querySelector<HTMLInputElement>('input[name=whishAt]')!,
      '2026-11-20T14:30',
    )
    await act(async () => button('Record: downpayment received')!.click())
    await flush()
    expect(container.querySelector('[role=alert]')?.textContent).toBe(
      'This Whish transfer is already recorded on listing 9.',
    )
    expect(reload).not.toHaveBeenCalled()
    expect(button('Record: downpayment received')!.disabled).toBe(false)
  })

  it('accepts a submission in review after a confirmation', async () => {
    business.submission!.status = 'pending'
    business.submission!.payment!.stage = 'downpayment_paid'
    business.submission!.payments = [
      {
        id: 'd1',
        type: 'downpayment',
        amount: 500,
        senderNumber: '03123456',
        whishAt: '2026-11-20T10:00:00.000Z',
      },
    ]
    await render()
    expect(buttons()).toEqual(['Accept', 'Reject: not accepted'])
    await act(async () => button('Accept')!.click())
    expect(posts()).toEqual([])
    await act(async () => button('Yes, accept it')!.click())
    await flush()
    expect(posts()).toEqual([['/api/accept-submission', { businessId: 7 }]])
  })

  it('opens the one Reject control, telling staff a refund will be due', async () => {
    business.submission!.status = 'pending'
    business.submission!.payment!.stage = 'downpayment_paid'
    business.submission!.payments = [{ id: 'd1', type: 'downpayment', amount: 500 }]
    ui.fields['submission.status'] = { value: 'pending' }
    await render()
    await act(async () => button('Reject: not accepted')!.click())
    expect(container.textContent).toContain(
      'A downpayment of $500 was recorded, so a refund will be due',
    )
    await act(async () => button('Cancel')!.click())
    expect(buttons()).toEqual(['Accept', 'Reject: not accepted'])
  })

  it('resends the pay email (E1) after a confirmation', async () => {
    await render()
    await act(async () => button('Resend email')!.click())
    await act(async () => button('Yes, send it again')!.click())
    await flush()
    expect(posts()).toEqual([['/api/resend-payment-email', { businessId: 7, event: 'E1' }]])
  })

  it('extends a deadline with days and a reason', async () => {
    await render()
    await act(async () => button('Extend deadline')!.click())
    expect(button('Extend')!.disabled).toBe(true)
    await type(
      container.querySelector<HTMLTextAreaElement>('textarea[name=reason]')!,
      'Owner abroad',
    )
    await act(async () => button('Extend')!.click())
    await flush()
    expect(posts()).toEqual([
      [
        '/api/extend-deadline',
        { businessId: 7, which: 'downpayment', days: 7, reason: 'Owner abroad' },
      ],
    ])
  })

  it('rejects for not paying the rest only after a second click', async () => {
    business.submission!.status = 'accepted'
    business.submission!.payment!.stage = 'downpayment_paid'
    business.submission!.payment!.acceptedEmailSentAt = '2026-11-21T10:00:00.000Z'
    business.submission!.payments = [{ id: 'd1', type: 'downpayment', amount: 500 }]
    await render()
    expect(buttons()).toEqual([
      'Balance received',
      'Resend email',
      'Extend deadline',
      'Reject: did not pay the rest',
    ])
    await act(async () => button('Reject: did not pay the rest')!.click())
    await act(async () => button('Reject: did not pay the rest')!.click())
    expect(posts()).toEqual([])
    await act(async () => button('Yes, reject it')!.click())
    await flush()
    expect(posts()).toEqual([['/api/reject-unpaid', { businessId: 7 }]])
  })

  it('lists the money with the sender, and lets only an admin undo a line', async () => {
    business.submission!.status = 'pending'
    business.submission!.payment!.stage = 'downpayment_paid'
    business.submission!.payments = [
      {
        id: 'd1',
        type: 'downpayment',
        amount: 500,
        method: 'whish',
        senderNumber: '03123456',
        whishAt: '2026-11-20T10:00:00.000Z',
        recordedBy: { id: 4, name: 'Rana' },
        recordedAt: '2026-11-20T11:00:00.000Z',
      },
    ]
    await render()
    const table = container.querySelector('table')!.textContent ?? ''
    expect(table).toContain('03123456')
    expect(table).toContain('Rana')
    expect(button('Undo')).toBeUndefined()

    ui.user = { id: 1, roles: ['admin'] }
    await render()
    await act(async () => button('Undo')!.click())
    await type(
      container.querySelector<HTMLTextAreaElement>('textarea[name=reason]')!,
      'Wrong business',
    )
    await act(async () => button('Undo this money entry (admin)')!.click())
    await act(async () => button('Yes, undo it')!.click())
    await flush()
    expect(posts()).toEqual([
      ['/api/undo-money-entry', { businessId: 7, entryId: 'd1', reason: 'Wrong business' }],
    ])
  })

  it('says fully paid is ready to publish, with no buttons', async () => {
    business.submission!.status = 'paid'
    business.submission!.payment!.stage = 'fully_paid'
    await render()
    expect(container.textContent).toContain('Publish: Fully paid: ready to publish.')
    expect(buttons()).toEqual([])
  })
})
