'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { useField, useFormFields } from '@payloadcms/ui'
import { availableActions, type BookingStatus } from '@vardenia/core'

/**
 * A booking as staff need to read it, and the moves it can make next.
 *
 * The booking screen was a form: a status dropdown offering all five statuses,
 * date pickers and a notes box. Staff picked "completed" for a booking that was
 * still pending, and the server refused the save. The rules of what may follow
 * what already existed (availableActions, which the venue dashboard uses); the
 * screen just never showed them.
 *
 * So this leads with who, when, how many and what the guest asked for, and
 * then offers only the moves that are allowed from the saved status: Confirm or
 * Decline a request, Cancel a confirmed booking, and once it is over, Completed
 * or No-show. A button sets the status in the form, and Save records it, so the
 * guest's email and every guard run exactly as they do from the dropdown.
 */

const ACTION: Record<string, { label: string; tone: 'keep' | 'remove' | 'plain'; hint: string }> = {
  'pending>confirmed': {
    label: 'Confirm',
    tone: 'keep',
    hint: 'The guest is emailed that the booking is confirmed.',
  },
  'pending>cancelled': {
    label: 'Decline',
    tone: 'remove',
    hint: 'The guest is emailed that the venue cannot take it, with your reason if you give one.',
  },
  'confirmed>cancelled': {
    label: 'Cancel booking',
    tone: 'remove',
    hint: 'The guest is emailed that the booking is called off, with your reason if you give one.',
  },
  'confirmed>completed': {
    label: 'Mark as completed',
    tone: 'keep',
    hint: 'The guest came. It counts towards the venue fee.',
  },
  'confirmed>no-show': {
    label: 'Mark as no-show',
    tone: 'plain',
    hint: 'The guest did not come. It does not count towards the fee.',
  },
}

const STATE: Record<BookingStatus, { text: string; className: string }> = {
  pending: { text: 'Waiting for the venue', className: 'vd-pill vd-pill--warn' },
  confirmed: { text: 'Confirmed', className: 'vd-pill vd-pill--ok' },
  cancelled: { text: 'Cancelled or declined', className: 'vd-pill vd-pill--off' },
  completed: { text: 'Completed', className: 'vd-pill' },
  'no-show': { text: 'No-show', className: 'vd-pill vd-pill--off' },
}

const idOf = (value: unknown): string | number | null => {
  if (typeof value === 'string' || typeof value === 'number') return value
  const id = (value as { id?: unknown } | null)?.id
  return typeof id === 'string' || typeof id === 'number' ? id : null
}

/**
 * Class names joined with spaces. Not a template literal: the Tailwind
 * formatter trims the space inside one and glued two classes into one.
 */
const classes = (...names: (string | false)[]) => names.filter(Boolean).join(' ')

const TZ = 'Asia/Beirut'
const dayOf = (date: Date) => date.toLocaleDateString('en-CA', { timeZone: TZ })

/** "Fri, 15 Aug 2026, 20:00 to 22:00" for a table, "15 to 18 Aug 2026 · 3 nights" for a stay. */
export function when(startValue: unknown, endValue: unknown): string {
  const start = new Date(String(startValue ?? ''))
  const end = new Date(String(endValue ?? ''))
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return 'No date'

  const date = (d: Date, withDay = true) =>
    d.toLocaleDateString('en-GB', {
      ...(withDay ? { weekday: 'short' as const } : {}),
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      timeZone: TZ,
    })
  const time = (d: Date) =>
    d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: TZ })

  if (dayOf(start) === dayOf(end)) return `${date(start)}, ${time(start)} to ${time(end)}`

  const nights = Math.round(
    (Date.parse(`${dayOf(end)}T00:00:00Z`) - Date.parse(`${dayOf(start)}T00:00:00Z`)) / 86_400_000,
  )
  return `${date(start, false)} to ${date(end, false)} · ${nights} ${nights === 1 ? 'night' : 'nights'}`
}

/** One document's display fields, read with the staff member's own session. */
function useDoc<T>(collection: string, id: string | number | null, select: string): T | null {
  const [doc, setDoc] = useState<T | null>(null)
  useEffect(() => {
    if (id === null) return
    let cancelled = false
    fetch(`/api/${collection}/${encodeURIComponent(String(id))}?depth=0&${select}`, {
      credentials: 'same-origin',
    })
      .then((response) => (response.ok ? response.json() : null))
      .then((body) => {
        if (!cancelled) setDoc(body as T | null)
      })
      .catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [collection, id, select])
  return doc
}

export function BookingCard() {
  const f = useFormFields(([fields]) => ({
    reference: String(fields.reference?.value ?? ''),
    business: idOf(fields.business?.value),
    customer: idOf(fields.customer?.value),
    start: fields.start?.value,
    end: fields.end?.value,
    partySize: Number(fields.partySize?.value) || 0,
    roomType: String(fields.roomType?.value ?? '').trim(),
    notes: String(fields.notes?.value ?? '').trim(),
  }))
  const status = useField<BookingStatus>({ path: 'status' })
  const reason = useField<string>({ path: 'declineReason' })

  const listing = useDoc<{ name?: string }>('businesses', f.business, 'select[name]=true')
  const guest = useDoc<{ name?: string; email?: string; phone?: string }>(
    'customers',
    f.customer,
    'select[name]=true&select[email]=true&select[phone]=true',
  )

  // When the screen was opened. Whether the booking is over decides what it may
  // become, and a clock read on every render would be an impure render.
  const [openedAt] = useState(() => Date.now())

  // A new booking has no saved status yet; there is nothing to act on.
  if (!f.reference) return null

  const saved = (status.initialValue ?? status.value ?? 'pending') as BookingStatus
  const chosen = (status.value ?? saved) as BookingStatus
  const changed = chosen !== saved
  const ended = new Date(String(f.end ?? '')).getTime() <= openedAt
  const moves = availableActions('staff', saved, ended).filter((to) => ACTION[`${saved}>${to}`])
  const state = STATE[saved] ?? STATE.pending
  const pendingAction = changed ? ACTION[`${saved}>${chosen}`] : undefined

  return (
    <section className={classes('vd-review', saved === 'pending' && 'vd-review--pending')}>
      <div className="vd-review__top">
        <span className="vd-booking__ref">{f.reference}</span>
        <span className={state.className}>{state.text}</span>
      </div>

      <h2 className="vd-review__title">{when(f.start, f.end)}</h2>

      <dl className="vd-booking__facts">
        <div>
          <dt>Place</dt>
          <dd>
            {f.business !== null ? (
              <Link href={`/admin/collections/businesses/${f.business}`}>
                {listing?.name ?? 'Open the listing'}
              </Link>
            ) : (
              'No listing'
            )}
          </dd>
        </div>
        <div>
          <dt>Guest</dt>
          <dd>
            {guest?.name ?? 'Guest'}
            {guest?.email ? <span className="vd-booking__contact">{guest.email}</span> : null}
            {guest?.phone ? <span className="vd-booking__contact">{guest.phone}</span> : null}
          </dd>
        </div>
        <div>
          <dt>Party</dt>
          <dd>
            {f.partySize} {f.partySize === 1 ? 'person' : 'people'}
            {f.roomType ? ` · ${f.roomType}` : ''}
          </dd>
        </div>
      </dl>

      {f.notes ? (
        <blockquote className="vd-review__body">
          <span className="vd-review__label">The guest wrote</span>
          {f.notes}
        </blockquote>
      ) : null}

      <div className="vd-review__actions">
        {changed && pendingAction ? (
          <>
            <span>
              <strong>{pendingAction.label}:</strong> press Save to record it. {pendingAction.hint}
            </span>
            <button type="button" className="vd-link" onClick={() => status.setValue(saved)}>
              Undo
            </button>
          </>
        ) : moves.length > 0 ? (
          <>
            {saved === 'pending' && ended ? (
              <p className="vd-warn">
                Its date has passed and nobody answered. Decline it, or confirm it only if the venue
                did take the guest.
              </p>
            ) : null}
            {moves.map((to) => {
              const action = ACTION[`${saved}>${to}`]!
              return (
                <button
                  key={to}
                  type="button"
                  className={classes(
                    'vd-choice',
                    action.tone !== 'plain' && `vd-choice--${action.tone}`,
                  )}
                  onClick={() => status.setValue(to)}
                >
                  {action.label}
                </button>
              )
            })}
            {saved === 'confirmed' && !ended ? (
              <span className="vd-muted">
                Completed and no-show appear once the booking is over.
              </span>
            ) : null}
          </>
        ) : (
          <span className="vd-muted">
            This booking is {state.text.toLowerCase()}. Nothing more happens to it.
          </span>
        )}
      </div>

      {changed && chosen === 'cancelled' ? (
        <label className="vd-booking__reason">
          <span>Reason for the guest (optional, one line)</span>
          <input
            type="text"
            maxLength={200}
            value={reason.value ?? ''}
            placeholder="For example: we are fully booked that evening"
            onChange={(event) => reason.setValue(event.target.value)}
          />
        </label>
      ) : null}
    </section>
  )
}

export default BookingCard
