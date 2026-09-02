'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { useRouter } from '../i18n/routing'
import { LINK, NOTICE_ERROR, SECONDARY_BUTTON } from './formStyles'

/**
 * The days a venue is shut: a holiday, a refurbishment, the fortnight in August.
 *
 * # Why a partner may write this when they may write nothing else
 *
 * Vardenia writes what a place *is* - the name, the photographs, the description
 * - and a business never edits that. This is not that. A closure says nothing
 * about what the place is, it cannot end up printed on a table card, and it
 * stops being true on a known date. It also happens to be the one fact only the
 * venue knows, and until now the only way they could act on it was to decline
 * every request by hand for a fortnight.
 *
 * It writes to its own collection for exactly that reason. See Closures.
 *
 * # The count beside each one is not decoration
 *
 * Adding a closure does not cancel anything, and it must not: a rule that
 * silently cancelled confirmed tables and emailed the guests would be a decision
 * nobody made. But the silent version of that is worse - a restaurant marks
 * itself closed, believes it is handled, and four families arrive. So the number
 * of bookings already inside the period is printed next to it, and dealing with
 * them stays the job of whoever promised them a table.
 */

export interface ClosureRow {
  id: number
  business: number
  /** Already formatted for reading, on the server, in Beirut. */
  label: string
  note: string
  bookings: number
}

export function ClosedDates({
  closures,
  listings,
}: {
  closures: ClosureRow[]
  /** Only used to name the listing when an account manages more than one. */
  listings: { id: number; name: string }[]
}) {
  const t = useTranslations('partner')
  const common = useTranslations('common')
  const router = useRouter()

  const [open, setOpen] = useState(false)
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [note, setNote] = useState('')
  const [business, setBusiness] = useState(String(listings[0]?.id ?? ''))
  const [busy, setBusy] = useState(false)
  const [problem, setProblem] = useState<string | null>(null)

  if (listings.length === 0) return null

  /**
   * Payload answers a rejected write with `errors[0].message`, and the messages
   * from `guardClosureWrite` are written to be read by the person who caused
   * them - "the last day cannot be before the first". Showing ours instead would
   * replace a useful sentence with a vague one.
   */
  async function send(path: string, init: RequestInit) {
    setProblem(null)
    setBusy(true)

    try {
      const response = await fetch(path, { credentials: 'same-origin', ...init })

      if (response.ok) {
        setOpen(false)
        setFrom('')
        setTo('')
        setNote('')
        router.refresh()
        return
      }

      const body = (await response.json().catch(() => null)) as {
        errors?: { message?: string }[]
      } | null
      setProblem(body?.errors?.[0]?.message ?? common('error'))
    } catch {
      setProblem(common('error'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="border-ink-100 mt-12 border-t pt-8" aria-labelledby="closed-dates">
      <h2
        id="closed-dates"
        className="text-ink-500 font-mono text-[11px] uppercase tracking-[0.14em]"
      >
        {t('closedTitle')}
      </h2>
      <p className="text-ink-700 mt-2 text-sm leading-relaxed">{t('closedIntro')}</p>

      {problem ? (
        <p className={`${NOTICE_ERROR} mt-4`} role="alert">
          {problem}
        </p>
      ) : null}

      {closures.length > 0 ? (
        <ul className="mt-5">
          {closures.map((closure) => (
            <li
              key={closure.id}
              className="border-ink-100 flex flex-wrap items-baseline gap-x-4 gap-y-1 border-b py-3"
            >
              <p className="text-ink-900 min-w-0 flex-1 text-sm">
                {closure.label}
                {listings.length > 1 ? (
                  <span className="text-ink-500">
                    {' '}
                    · {listings.find((l) => l.id === closure.business)?.name ?? ''}
                  </span>
                ) : null}
                {closure.note ? (
                  <span dir="auto" className="text-ink-500">
                    {' '}
                    · {closure.note}
                  </span>
                ) : null}
              </p>

              {/* The warning that stops this being a false comfort. Silent when
                  there is nothing in the period, which is the ordinary case. */}
              {closure.bookings > 0 ? (
                <span className="text-state-danger text-xs">
                  {t('closedHasBookings', { count: closure.bookings })}
                </span>
              ) : null}

              <button
                type="button"
                disabled={busy}
                onClick={() => send(`/api/closures/${closure.id}`, { method: 'DELETE' })}
                className={`${LINK} shrink-0 text-xs`}
              >
                {t('closedRemove')}
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-ink-500 mt-5 text-sm">{t('closedNone')}</p>
      )}

      {open ? (
        <form
          onSubmit={(event) => {
            event.preventDefault()
            void send('/api/closures', {
              method: 'POST',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify({
                business: Number(business),
                startsOn: from,
                // A single day is the common case, so leaving the second date
                // empty closes one day rather than being an error to correct.
                endsOn: to || from,
                ...(note.trim() ? { note: note.trim() } : {}),
              }),
            })
          }}
          className="border-ink-100 mt-5 border-s-2 ps-4"
        >
          <div className="flex flex-wrap gap-4">
            <Field label={t('closedFrom')} id="closed-from">
              <input
                id="closed-from"
                type="date"
                required
                value={from}
                onChange={(event) => setFrom(event.target.value)}
                className={DATE_INPUT}
              />
            </Field>

            <Field label={t('closedTo')} id="closed-to" hint={t('closedToHint')}>
              <input
                id="closed-to"
                type="date"
                value={to}
                min={from || undefined}
                onChange={(event) => setTo(event.target.value)}
                className={DATE_INPUT}
              />
            </Field>
          </div>

          {listings.length > 1 ? (
            <Field label={t('closedListing')} id="closed-listing">
              <select
                id="closed-listing"
                value={business}
                onChange={(event) => setBusiness(event.target.value)}
                className={DATE_INPUT}
              >
                {listings.map((listing) => (
                  <option key={listing.id} value={listing.id}>
                    {listing.name}
                  </option>
                ))}
              </select>
            </Field>
          ) : null}

          <Field label={t('closedNote')} id="closed-note" hint={t('closedNoteHint')}>
            <input
              id="closed-note"
              type="text"
              maxLength={200}
              value={note}
              onChange={(event) => setNote(event.target.value)}
              className={`${DATE_INPUT} w-full`}
            />
          </Field>

          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="submit"
              disabled={busy}
              className={`${SECONDARY_BUTTON} px-4 py-2 text-xs`}
            >
              {busy ? t('working') : t('closedSave')}
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => setOpen(false)}
              className={`${SECONDARY_BUTTON} px-4 py-2 text-xs`}
            >
              {common('close')}
            </button>
          </div>
        </form>
      ) : (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className={`${SECONDARY_BUTTON} mt-5 px-4 py-2 text-xs`}
        >
          {t('closedAdd')}
        </button>
      )}
    </section>
  )
}

const DATE_INPUT =
  'border-ink-100 focus:border-gold-500 text-ink-900 mt-1 border bg-transparent px-3 py-2 text-sm outline-none transition-colors'

function Field({
  label,
  id,
  hint,
  children,
}: {
  label: string
  id: string
  hint?: string
  children: React.ReactNode
}) {
  return (
    <div className="mt-4 min-w-0 first:mt-0">
      <label htmlFor={id} className="text-ink-700 block text-xs">
        {label}
      </label>
      {hint ? <p className="text-ink-500 text-[11px]">{hint}</p> : null}
      {children}
    </div>
  )
}
