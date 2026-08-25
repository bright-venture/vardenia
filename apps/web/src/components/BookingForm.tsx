'use client'

import { useId, useState } from 'react'
import { useTranslations } from 'next-intl'
import type { Locale } from '@vardenia/i18n'
import { Link } from '../i18n/routing'
import { trackEvent } from '../lib/analytics'
import { durationLabel, toInterval, type BookingFormModel } from '../lib/booking-form'
import {
  ERROR_TEXT,
  HINT,
  INPUT,
  INPUT_ERROR,
  LABEL,
  LINK,
  NOTICE_ERROR,
  NOTICE_INFO,
  NOTICE_SUCCESS,
  PRIMARY_BUTTON,
  SECONDARY_BUTTON,
} from './formStyles'

/**
 * The form a reader fills in to book.
 *
 * The one place on the public site that writes to the database, which is why
 * almost none of the thinking is in here. Shape comes from `bookingFormModel`,
 * times are built by `toInterval` against Beirut's clock, and the decision is
 * `/booking/request`'s. This assembles inputs and renders what comes back.
 *
 * # It never says "available"
 *
 * There is no "check availability" step, deliberately. `/booking/availability`
 * exists and is honest about what it is - "worth submitting", never "held for
 * you" - but a green tick in a form is read as a reservation. Two people looking
 * at the last table would both see it, and one of them would then be refused
 * after being told it was free. Submitting is the only thing that reserves
 * anything, so submitting is the only thing offered.
 *
 * # Refusals arrive as prose
 *
 * The endpoint returns a sentence, already in the right language, for every
 * refusal it knows - fully booked, closed then, needs more notice. This renders
 * it rather than mapping reason codes to its own copy, because two sets of
 * wording for one condition drift apart and the customer reads whichever one
 * happens to be stale.
 *
 * # It does not know who you are, and does not need to
 *
 * No prefilling from the session, for two reasons that happen to agree. The
 * listing page is prerendered and revalidated - the one measured performance fix
 * on the busiest page in the product, since every printed QR code lands there -
 * and reading the session means reading headers, which opts the whole route out
 * of static rendering. Every reader would pay a database round trip so that a
 * minority could skip typing their address.
 *
 * The second reason is that it would not buy much. `/booking/request` binds a
 * booking to a customer by *email address*, not by cookie: that is what lets
 * somebody book as a guest and later claim the record. So the address in this
 * field is what decides where the booking lands, signed in or not, and the hint
 * under the form says exactly that rather than implying a sign-in matters.
 */

export interface BookingFormProps {
  businessId: number
  model: BookingFormModel
  locale: Locale
}

type FieldErrors = Record<string, string>

interface Success {
  reference: string
  status: string
  email: string
}

export function BookingForm({ businessId, model, locale }: BookingFormProps) {
  const t = useTranslations('booking')
  const common = useTranslations('common')
  const ids = useId()

  const [date, setDate] = useState(model.earliestDate)
  const [time, setTime] = useState('20:00')
  const [duration, setDuration] = useState(model.durationOptions[0] ?? 60)
  const [nights, setNights] = useState(model.nightOptions[0] ?? 1)
  const [partySize, setPartySize] = useState(model.defaultPartySize)
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [notes, setNotes] = useState('')

  const [busy, setBusy] = useState(false)
  const [refusal, setRefusal] = useState<string | null>(null)
  const [errors, setErrors] = useState<FieldErrors>({})
  const [done, setDone] = useState<Success | null>(null)

  const field = (key: string) => (errors[key] ? `${INPUT} ${INPUT_ERROR}` : INPUT)
  const describedBy = (key: string) => (errors[key] ? `${ids}-${key}-error` : undefined)

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setRefusal(null)
    setErrors({})

    const interval = toInterval({
      mode: model.mode,
      date,
      time,
      durationMinutes: duration,
      nights,
    })

    /**
     * Caught here rather than sent, because the endpoint would answer "those
     * dates do not make sense", which is true and useless. This can only happen
     * from a browser that accepted something the date input should not have.
     */
    if (!interval) {
      setErrors({ date: t('invalidDate') })
      return
    }

    setBusy(true)

    try {
      const response = await fetch('/booking/request', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        // The cookie carries the session so a signed-in booking lands on the
        // right customer. Same origin, so this is the default - stated because
        // it is load-bearing rather than incidental.
        credentials: 'same-origin',
        body: JSON.stringify({
          business: businessId,
          start: interval.start,
          end: interval.end,
          partySize,
          name,
          email,
          ...(phone.trim() ? { phone } : {}),
          ...(notes.trim() ? { notes } : {}),
          locale,
        }),
      })

      const body = (await response.json().catch(() => null)) as {
        ok?: boolean
        reference?: string
        status?: string
        message?: string
        errors?: FieldErrors
      } | null

      if (response.ok && body?.ok && body.reference) {
        setDone({ reference: body.reference, status: body.status ?? 'pending', email })
        /**
         * The event the whole print model rests on. A scan is already recorded
         * server-side, but it stops at the redirect - this is the only place
         * that knows a visit turned into a reservation.
         *
         * After `setDone`, and best effort: nothing about the booking depends
         * on it, and the reader has already been told they are booked.
         */
        trackEvent('booking-requested', { status: body.status ?? 'pending' })
        return
      }

      if (body?.errors) {
        setErrors(body.errors)
        return
      }

      setRefusal(body?.message ?? common('error'))
    } catch {
      /**
       * A dropped connection, which on a hotel's guest Wi-Fi is the most likely
       * failure of all. The booking may or may not have been made - `fetch`
       * cannot tell us - so the message must not claim either. It says try
       * again, and the confirmation email is what settles it.
       */
      setRefusal(common('error'))
    } finally {
      setBusy(false)
    }
  }

  if (done) {
    const confirmed = done.status === 'confirmed'

    return (
      <div className={NOTICE_SUCCESS} role="status">
        <p className="font-semibold">{confirmed ? t('confirmedTitle') : t('pendingTitle')}</p>
        <p className="mt-2">
          {confirmed
            ? t('confirmedBody', { email: done.email })
            : t('pendingBody', { email: done.email })}
        </p>

        <p className="mt-4 text-xs uppercase tracking-wider">{t('reference')}</p>
        {/* Selectable, large and monospaced: this is the one string the customer
            may have to read down a phone line. */}
        <p className="mt-1 select-all font-mono text-lg tracking-widest">{done.reference}</p>
        <p className="mt-1 text-xs">{t('referenceHint')}</p>

        <button type="button" className={`${SECONDARY_BUTTON} mt-5`} onClick={() => setDone(null)}>
          {t('another')}
        </button>
      </div>
    )
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-5" noValidate>
      {model.leadTimeMinutes >= 60 ? (
        <p className={NOTICE_INFO}>
          {t('leadTime', { hours: Math.round(model.leadTimeMinutes / 60) })}
        </p>
      ) : null}

      {/* `aria-live` so a refusal that appears after submitting is announced.
          Without it a screen reader user presses the button, nothing is read
          out, and the page looks unchanged. */}
      {refusal ? (
        <p className={NOTICE_ERROR} role="alert">
          {refusal}
        </p>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className={LABEL} htmlFor={`${ids}-date`}>
            {t('date')}
          </label>
          <input
            id={`${ids}-date`}
            type="date"
            required
            value={date}
            /**
             * From the server, and possibly a day stale on a listing that has
             * sat in the cache - see BookingPanel.
             *
             * There was an effect here that corrected it against the browser
             * clock on mount. It went, because `react-hooks/set-state-in-effect`
             * is right that it was a cascading render, and because it was buying
             * very little: this attribute greys out days in a picker, while
             * `checkAvailability` is what actually refuses a booking in the past
             * and says so in a sentence the form already renders. The worst case
             * is a picker that lets you choose a day it should have greyed out,
             * and a clear refusal one click later.
             */
            min={model.earliestDate}
            max={model.latestDate}
            onChange={(e) => setDate(e.target.value)}
            className={`mt-1.5 ${field('date')}`}
            aria-describedby={describedBy('date')}
          />
          {errors.date ? (
            <p id={`${ids}-date-error`} className={ERROR_TEXT}>
              {errors.date}
            </p>
          ) : null}
        </div>

        {model.mode === 'sitting' ? (
          <div>
            <label className={LABEL} htmlFor={`${ids}-time`}>
              {t('time')}
            </label>
            <input
              id={`${ids}-time`}
              type="time"
              required
              value={time}
              onChange={(e) => setTime(e.target.value)}
              className={`mt-1.5 ${field('start')}`}
            />
          </div>
        ) : (
          <div>
            <label className={LABEL} htmlFor={`${ids}-nights`}>
              {t('nights')}
            </label>
            <select
              id={`${ids}-nights`}
              value={nights}
              onChange={(e) => setNights(Number(e.target.value))}
              className={`mt-1.5 ${INPUT}`}
            >
              {model.nightOptions.map((n) => (
                <option key={n} value={n}>
                  {t('nightCount', { count: n })}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {model.mode === 'sitting' ? (
          <div>
            <label className={LABEL} htmlFor={`${ids}-duration`}>
              {t('duration')}
            </label>
            <select
              id={`${ids}-duration`}
              value={duration}
              onChange={(e) => setDuration(Number(e.target.value))}
              className={`mt-1.5 ${INPUT}`}
            >
              {model.durationOptions.map((minutes) => (
                <option key={minutes} value={minutes}>
                  {durationLabel(minutes, locale)}
                </option>
              ))}
            </select>
          </div>
        ) : null}

        <div>
          <label className={LABEL} htmlFor={`${ids}-party`}>
            {t('partySize')}
          </label>
          <input
            id={`${ids}-party`}
            type="number"
            required
            inputMode="numeric"
            value={partySize}
            min={model.minPartySize}
            max={model.maxPartySize}
            onChange={(e) => setPartySize(Number(e.target.value))}
            className={`mt-1.5 ${field('partySize')}`}
            aria-describedby={describedBy('partySize')}
          />
          {errors.partySize ? (
            <p id={`${ids}-partySize-error`} className={ERROR_TEXT}>
              {errors.partySize}
            </p>
          ) : null}
        </div>
      </div>

      <div>
        <label className={LABEL} htmlFor={`${ids}-name`}>
          {t('name')}
        </label>
        <input
          id={`${ids}-name`}
          type="text"
          required
          autoComplete="name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className={`mt-1.5 ${field('name')}`}
          aria-describedby={describedBy('name')}
        />
        {errors.name ? (
          <p id={`${ids}-name-error`} className={ERROR_TEXT}>
            {errors.name}
          </p>
        ) : null}
      </div>

      <div>
        <label className={LABEL} htmlFor={`${ids}-email`}>
          {t('email')}
        </label>
        <input
          id={`${ids}-email`}
          type="email"
          required
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className={`mt-1.5 ${field('email')}`}
          aria-describedby={`${ids}-email-hint`}
        />
        {/* The address is what binds the booking to an account, so this is not
            a nicety - it is the only instruction that determines whether the
            booking shows up in "Your bookings" later. */}
        <p id={`${ids}-email-hint`} className={HINT}>
          {t('accountHint')}
        </p>
        {errors.email ? (
          <p id={`${ids}-email-error`} className={ERROR_TEXT}>
            {errors.email}
          </p>
        ) : null}
      </div>

      <div>
        <label className={LABEL} htmlFor={`${ids}-phone`}>
          {t('phone')}
        </label>
        <input
          id={`${ids}-phone`}
          type="tel"
          autoComplete="tel"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          className={`mt-1.5 ${INPUT}`}
          aria-describedby={`${ids}-phone-hint`}
        />
        <p id={`${ids}-phone-hint`} className={HINT}>
          {t('phoneHint')}
        </p>
      </div>

      <div>
        <label className={LABEL} htmlFor={`${ids}-notes`}>
          {t('notes')}
        </label>
        <textarea
          id={`${ids}-notes`}
          rows={3}
          maxLength={1000}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          className={`mt-1.5 ${INPUT}`}
          aria-describedby={`${ids}-notes-hint`}
        />
        <p id={`${ids}-notes-hint`} className={HINT}>
          {t('notesHint')}
        </p>
      </div>

      <button type="submit" disabled={busy} className={PRIMARY_BUTTON}>
        {busy ? t('submitting') : t('submit')}
      </button>

      <p className="text-ink-500 text-xs">
        <Link href="/account" className={LINK}>
          {t('accountLink')}
        </Link>
      </p>
    </form>
  )
}
