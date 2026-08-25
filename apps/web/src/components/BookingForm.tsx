'use client'

import { useId, useState, useSyncExternalStore } from 'react'
import { useTranslations } from 'next-intl'
import type { Locale } from '@vardenia/i18n'
import { Link, usePathname } from '../i18n/routing'
import { trackEvent } from '../lib/analytics'
import { sessionAudience } from '../lib/session-hint'
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
 * # Booking requires an account, and the page still cannot read the session
 *
 * A booking used to be open to anyone with an email address. It is not any
 * more: deposits are coming, and taking money against an address nobody has
 * confirmed leaves no party to refund or charge. `/booking/request` now refuses
 * without a signed-in customer whose address is verified.
 *
 * That creates a problem this file has to work around rather than solve. The
 * listing page is prerendered and revalidated - the one measured performance
 * fix on the busiest page in the product, since every printed QR code lands
 * there - and reading the real session means reading headers, which opts the
 * whole route out of static rendering. Every reader would pay a database round
 * trip so the form could know who they are before they touch it.
 *
 * So the resting state is guessed from the `vd_session` hint cookie, exactly as
 * the header does, and the server's answer is the truth. A signed-out reader
 * sees a sign-in prompt instead of a form they cannot submit; anyone the hint
 * gets wrong finds out from a 401 and sees the same dialog. The unverified case
 * has no hint at all and can only arrive as a 403.
 *
 * # Name and email are gone from the form
 *
 * They belong to the account now. The server takes both from the session and
 * ignores anything sent here, so collecting them would be asking for something
 * that cannot change the outcome - and would invite somebody to think they
 * could book under a different address.
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

/**
 * Same subscription as AccountLink: a cookie is external state, and re-reading
 * it when the tab is looked at again means signing in elsewhere fixes this form
 * rather than leaving it showing a sign-in prompt to somebody who just did.
 */
const subscribeToSession = (onChange: () => void) => {
  document.addEventListener('visibilitychange', onChange)
  window.addEventListener('focus', onChange)
  return () => {
    document.removeEventListener('visibilitychange', onChange)
    window.removeEventListener('focus', onChange)
  }
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
  const [phone, setPhone] = useState('')
  const [notes, setNotes] = useState('')

  const [busy, setBusy] = useState(false)
  const [refusal, setRefusal] = useState<string | null>(null)
  const [errors, setErrors] = useState<FieldErrors>({})
  const [done, setDone] = useState<Success | null>(null)
  const [needsAccount, setNeedsAccount] = useState(false)
  const [unverified, setUnverified] = useState(false)

  /**
   * Whether a customer session exists, read from the hint cookie.
   *
   * The listing page is prerendered - reading the real session on the server
   * would make every listing dynamic, which is the 6ms-versus-350ms trade this
   * whole site is arranged around. So the resting state of the button comes
   * from the same non-httpOnly hint the header uses, and the *truth* comes from
   * the server's answer when the form is submitted.
   *
   * The hint cannot know whether the address is verified. That case is only
   * ever discovered from the 403, which is fine: it is rarer, and a wrong guess
   * here costs a round trip rather than a wrong page.
   */
  const audience = useSyncExternalStore(subscribeToSession, sessionAudience, () => null)
  const signedIn = audience === 'customer'

  /**
   * Where to come back to. Without it, signing in from a listing drops the
   * reader on their account page and they have to find the place again -
   * which, if they arrived from a printed code, they may not be able to.
   */
  const next = usePathname()

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
          ...(phone.trim() ? { phone } : {}),
          ...(notes.trim() ? { notes } : {}),
          locale,
        }),
      })

      const body = (await response.json().catch(() => null)) as {
        ok?: boolean
        reference?: string
        status?: string
        email?: string
        message?: string
        errors?: FieldErrors
      } | null

      if (response.ok && body?.ok && body.reference) {
        setDone({
          reference: body.reference,
          status: body.status ?? 'pending',
          // The address the server actually sent to, which is the account's.
          email: body.email ?? '',
        })
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

      /**
       * The two account refusals, before the generic one. Both are things the
       * reader can fix, and neither is a problem with what they typed - so
       * they get their own panels rather than a red sentence above the form.
       */
      if (response.status === 401) {
        setNeedsAccount(true)
        return
      }

      if (response.status === 403) {
        setUnverified(true)
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

      {/*
        Signed out: the prompt replaces the button rather than sitting beside
        it. A reader who fills in six fields and is then told to make an account
        has done the work twice, and the second time they may not bother.
      */}
      {signedIn ? (
        <button type="submit" disabled={busy} className={PRIMARY_BUTTON}>
          {busy ? t('submitting') : t('submit')}
        </button>
      ) : (
        <div className={NOTICE_INFO}>
          <p className="font-medium">{t('accountRequired')}</p>
          <p className="mt-1 text-sm">{t('accountRequiredWhy')}</p>
          <div className="mt-3 flex flex-wrap gap-3">
            <Link href={{ pathname: '/account/signup', query: { next } }} className={PRIMARY_BUTTON}>
              {t('accountCreate')}
            </Link>
            <Link href={{ pathname: '/account/login', query: { next } }} className={SECONDARY_BUTTON}>
              {t('accountSignIn')}
            </Link>
          </div>
        </div>
      )}

      {/*
        The hint said signed in and the server disagreed. Same panel, arrived at
        from the 401 rather than from the cookie.
      */}
      {needsAccount ? (
        <div className={NOTICE_ERROR} role="alert">
          <p>{t('accountRequired')}</p>
          <div className="mt-3 flex flex-wrap gap-3">
            <Link href={{ pathname: '/account/login', query: { next } }} className={LINK}>
              {t('accountSignIn')}
            </Link>
          </div>
        </div>
      ) : null}

      {/*
        Signed in but not verified, which today cannot happen and is handled
        anyway.

        Payload refuses to authenticate an unverified customer at all - checked
        against the running server, `/api/customers/me` answers `user: null`
        with a token minted while verified - so this arrives as a 401 rather
        than a 403 and the panel above is what shows. Kept because the refusal
        is the server's to make, not this component's to predict, and because a
        future collection setting could make it reachable without anyone
        thinking to add a branch here.

        The way out of it lives on the sign-in page, where somebody without a
        session can actually reach it.
      */}
      {unverified ? (
        <div className={NOTICE_INFO} role="alert">
          <p>{t('verifyFirst')}</p>
          <Link
            href={{ pathname: '/account/login', query: { next } }}
            className={`${LINK} mt-2 inline-block text-sm`}
          >
            {t('accountSignIn')}
          </Link>
        </div>
      ) : null}

      <p className="text-ink-500 text-xs">
        <Link href="/account" className={LINK}>
          {t('accountLink')}
        </Link>
      </p>
    </form>
  )
}
