'use client'

import { useField, useFormFields } from '@payloadcms/ui'
import {
  attendanceMismatch,
  billableAmount,
  type BaseSource,
  type AttendanceMismatch,
  type AttendanceVerdict,
  type BookingStatus,
  type GuestAnswer,
} from '@vardenia/core'
import { ReceiptPreview, useReceipt } from './ReceiptPreview'

/**
 * A disputed visit, laid out so the team can settle it on one screen.
 *
 * When the guest and the venue disagree (core/attendanceMismatch), the facts
 * were spread over the sidebar: the venue's status at the top, its amount in one
 * box, the guest's answer and figure in two others, and the guest's receipt as a
 * file name. Settling one meant reading five fields and opening an attachment.
 *
 * So this puts the three accounts side by side, the venue's, the guest's and
 * the receipt's, with the receipt photo large enough to read the total from,
 * and two buttons that set "Team decision" in the form like the dropdown does.
 * Save records it, so billing and the passport follow from the same save.
 *
 * Shown while the booking is disputed or decided, and also whenever the guest
 * sent a receipt, which is worth seeing before anyone questions a line.
 */

const VENUE_SAYS: Record<BookingStatus, string> = {
  pending: 'Never answered the request',
  confirmed: 'Confirmed, not marked yet',
  cancelled: 'Cancelled the booking',
  completed: 'The guest came',
  'no-show': 'The guest did not come',
}

export const DISPUTE_TEXT: Record<AttendanceMismatch, string> = {
  'guest-says-came': 'The guest says they came, but the venue says they did not.',
  'guest-says-absent': 'The guest says they did not come, but the venue says they did.',
  'amount-differs':
    'Both say the guest came, but the venue entered an amount far from the receipt, or from what the guest says.',
}

const VERDICT_TEXT: Record<AttendanceVerdict, string> = {
  guest:
    'The guest is right. The visit is billed on the receipt, else on what the guest gave, and they get the stamp.',
  venue:
    'The venue is right. The visit is billed on what the venue entered, even over a receipt, and the stamp follows the venue.',
}

const BILLED_FROM: Record<BaseSource, string> = {
  receipt: "the receipt's total",
  venue: "the venue's entry",
  guest: "the guest's estimate",
}

const dollars = (value: number | null) =>
  value === null
    ? 'Not given'
    : `$${value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

const numberOrNull = (value: unknown) =>
  typeof value === 'number' && Number.isFinite(value) ? value : null

const idOf = (value: unknown): number | string | null => {
  if (typeof value === 'string' || typeof value === 'number') return value
  const id = (value as { id?: unknown } | null)?.id
  return typeof id === 'string' || typeof id === 'number' ? id : null
}

export function BookingDispute() {
  const f = useFormFields(([fields]) => ({
    reference: String(fields.reference?.value ?? ''),
    status: (fields.status?.initialValue ?? fields.status?.value ?? null) as BookingStatus | null,
    end: String(fields.end?.value ?? ''),
    guestAnswer: (fields.guestAnswer?.value ?? null) as GuestAnswer | null,
    amount: numberOrNull(fields.amount?.value),
    guestAmount: numberOrNull(fields.guestAmount?.value),
    receiptAmount: numberOrNull(fields.receiptAmount?.value),
    receipt: idOf(fields.receipt?.value),
  }))
  const verdict = useField<AttendanceVerdict | null>({ path: 'attendanceVerdict' })
  const receipt = useReceipt(f.receipt)

  if (!f.reference || !f.status) return null

  // What the disagreement is, whatever the team has chosen so far: a decision
  // settles a dispute, it does not make the two accounts agree.
  const mismatch = attendanceMismatch({
    status: f.status,
    end: new Date(f.end),
    guestAnswer: f.guestAnswer,
    verdict: null,
    amount: f.amount,
    guestAmount: f.guestAmount,
    receiptAmount: f.receiptAmount,
  })
  const saved = (verdict.initialValue ?? null) as AttendanceVerdict | null
  const chosen = (verdict.value ?? null) as AttendanceVerdict | null
  const changed = chosen !== saved

  if (!mismatch && !saved && !chosen && f.receipt === null) return null

  const waiting = mismatch !== null && chosen === null
  // What a statement would bill once this is saved, decision included.
  const billed = billableAmount({
    amount: f.amount,
    guestAmount: f.guestAmount,
    receiptAmount: f.receiptAmount,
    verdict: chosen,
  })

  return (
    <section className={waiting ? 'vd-review vd-review--pending' : 'vd-review'}>
      <div className="vd-review__top">
        <h3 className="vd-dispute__title">{mismatch ? 'Disputed visit' : "The guest's receipt"}</h3>
        {waiting ? <span className="vd-pill vd-pill--warn">Waiting for a decision</span> : null}
        {!waiting && saved ? <span className="vd-pill vd-pill--ok">Decided</span> : null}
      </div>

      {mismatch ? <p className="vd-dispute__why">{DISPUTE_TEXT[mismatch]}</p> : null}

      <div className="vd-dispute__sides">
        <div className="vd-dispute__side">
          <span className="vd-review__label">The venue says</span>
          <strong>{VENUE_SAYS[f.status]}</strong>
          <span>Spent: {dollars(f.amount)}</span>
        </div>
        <div className="vd-dispute__side">
          <span className="vd-review__label">The guest says</span>
          <strong>
            {f.guestAnswer === 'came'
              ? 'I came'
              : f.guestAnswer === 'did-not-come'
                ? 'I did not come'
                : 'Has not answered'}
          </strong>
          <span>Spent: {dollars(f.guestAmount)}</span>
        </div>
        <div className="vd-dispute__side vd-dispute__side--receipt">
          <span className="vd-review__label">The receipt</span>
          {receipt ? (
            <ReceiptPreview receipt={receipt} />
          ) : f.receipt !== null ? (
            <span className="vd-muted">Loading the receipt…</span>
          ) : (
            <span className="vd-muted">The guest has not sent one.</span>
          )}
        </div>
      </div>

      <p className="vd-dispute__billed">
        {billed ? (
          <>
            Billed on <strong>{dollars(billed.amount)}</strong>, {BILLED_FROM[billed.from]}
            {changed ? ' once you save' : ''}.
          </>
        ) : (
          'Nothing to bill on yet: nobody has given an amount.'
        )}
        {f.receipt !== null && f.receiptAmount === null ? (
          <span className="vd-muted">
            {' '}
            The receipt gives no dollar total (none typed, or in LBP with no rate on the Commissions
            page), so it is not used.
          </span>
        ) : null}
      </p>

      {mismatch || saved || chosen ? (
        <div className="vd-review__actions">
          {changed && chosen ? (
            <>
              <span>
                <strong>{chosen === 'guest' ? 'The guest is right' : 'The venue is right'}:</strong>{' '}
                press Save to record it. {VERDICT_TEXT[chosen]}
              </span>
              <button type="button" className="vd-link" onClick={() => verdict.setValue(saved)}>
                Undo
              </button>
            </>
          ) : chosen ? (
            <>
              <span>{VERDICT_TEXT[chosen]}</span>
              <button type="button" className="vd-link" onClick={() => verdict.setValue(null)}>
                Change decision
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                className="vd-choice vd-choice--keep"
                onClick={() => verdict.setValue('guest')}
              >
                The guest is right
              </button>
              <button
                type="button"
                className="vd-choice vd-choice--remove"
                onClick={() => verdict.setValue('venue')}
              >
                The venue is right
              </button>
              <span className="vd-muted">
                {changed
                  ? 'Press Save to reopen the dispute.'
                  : 'Check with the venue first. The receipt, if there is one, is the best evidence of what was spent.'}
              </span>
            </>
          )}
        </div>
      ) : null}
    </section>
  )
}

export default BookingDispute
