import type { Endpoint, PayloadRequest } from 'payload'
import {
  acceptSubmission,
  extendDeadline,
  recordBalance,
  recordDownpayment,
  recordRefundSent,
  rejectUnpaid,
  undoMoneyEntry,
  waiveDownpayment,
  type Actor,
  type PaymentOutcome,
} from '../lib/place-payments'
import { resendPaymentEmail } from '../lib/place-payment-notify'
import { json, readActionBody } from './action-body'

/**
 * The staff actions of the two-stage payment (spec v4), one POST each, for the
 * "Payment and review" panel of a listing (Task 11). Same pattern as
 * reject-endpoint: the body is a strict JSON allow-list, and the role (staff,
 * or admin for the admin-only ones) is checked on the server by
 * lib/place-payments against the signed-in account before anything is read.
 *
 * Every answer is { ok: true, status, stage, received, stillToPay } or
 * { error, code } with 400, 403, 404, 409 or 500. Money times (whishAt) are
 * ISO 8601 with a zone (Z or +02:00); amounts are dollars, two decimals at most.
 *
 * Reject: not accepted stays at /api/reject-submission (reject-endpoint.ts).
 *
 * /resend-payment-email (staff and admin) sends the "pay the downpayment"
 * (E1) or "pay the rest" (E3) email again, while that payment is awaited. It
 * changes no status; the history says who resent which email. Answers
 * { ok: true } or { error, code }.
 */

const MONEY = ['businessId', 'amount', 'senderNumber', 'whishAt', 'method', 'note'] as const
const REASON = ['businessId', 'reason'] as const

type Run = (args: {
  payload: PayloadRequest['payload']
  actor: Actor
  body: Record<string, unknown>
}) => Promise<PaymentOutcome>

const action = (path: string, allowed: readonly string[], run: Run): Endpoint => ({
  path,
  method: 'post',
  handler: async (req) => {
    const read = await readActionBody(req, allowed)
    if (!read.ok) return read.response
    const outcome = await run({ payload: req.payload, actor: { user: req.user }, body: read.body })
    if (!outcome.ok) return json({ error: outcome.message, code: outcome.code }, outcome.status)
    const { status, stage, received, stillToPay } = outcome
    return json({ ok: true, status, stage, received, stillToPay })
  },
})

const money = (body: Record<string, unknown>) => ({
  businessId: body.businessId,
  amount: body.amount,
  senderNumber: body.senderNumber,
  whishAt: body.whishAt,
  method: body.method,
  note: body.note,
})

export const paymentEndpoints: Endpoint[] = [
  action('/downpayment-received', MONEY, ({ payload, actor, body }) =>
    recordDownpayment({ payload, actor, ...money(body) }),
  ),
  action('/accept-submission', ['businessId'], ({ payload, actor, body }) =>
    acceptSubmission({ payload, actor, businessId: body.businessId }),
  ),
  action('/refund-sent', MONEY, ({ payload, actor, body }) =>
    recordRefundSent({ payload, actor, ...money(body) }),
  ),
  action('/balance-received', MONEY, ({ payload, actor, body }) =>
    recordBalance({ payload, actor, ...money(body) }),
  ),
  action('/reject-unpaid', REASON, ({ payload, actor, body }) =>
    rejectUnpaid({ payload, actor, businessId: body.businessId, reason: body.reason }),
  ),
  action('/waive-downpayment', REASON, ({ payload, actor, body }) =>
    waiveDownpayment({ payload, actor, businessId: body.businessId, reason: body.reason }),
  ),
  action('/undo-money-entry', ['businessId', 'entryId', 'reason'], ({ payload, actor, body }) =>
    undoMoneyEntry({
      payload,
      actor,
      businessId: body.businessId,
      entryId: body.entryId,
      reason: body.reason,
    }),
  ),
  action(
    '/extend-deadline',
    ['businessId', 'which', 'days', 'reason'],
    ({ payload, actor, body }) =>
      extendDeadline({
        payload,
        actor,
        businessId: body.businessId,
        which: body.which,
        days: body.days,
        reason: body.reason,
      }),
  ),
]

/** Resend E1 or E3 (staff and admin). Body: { businessId, event: 'E1' | 'E3' }. */
export const resendPaymentEmailEndpoint: Endpoint = {
  path: '/resend-payment-email',
  method: 'post',
  handler: async (req) => {
    const read = await readActionBody(req, ['businessId', 'event'])
    if (!read.ok) return read.response
    const outcome = await resendPaymentEmail({
      payload: req.payload,
      user: req.user,
      businessId: read.body.businessId,
      event: read.body.event,
    })
    if (!outcome.ok) return json({ error: outcome.message, code: outcome.code }, outcome.status)
    return json({ ok: true })
  },
}
