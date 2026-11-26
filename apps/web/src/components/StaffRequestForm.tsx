'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import type { Locale } from '@vardenia/i18n'
import { HINT, INPUT, LABEL, NOTICE_ERROR, NOTICE_SUCCESS, PRIMARY_BUTTON } from './formStyles'

/**
 * The Event Staff request (18 November 2026), filled in from the guest's
 * account: name and email are the account's and shown read-only, the phone
 * can be corrected. Sent to /booking/staff-request; the team answers it.
 */

const EVENT_TYPES = ['wedding', 'private-dinner', 'corporate', 'other'] as const

export function StaffRequestForm({
  role,
  locale,
  today,
  account,
}: {
  role: 'hostesses' | 'waiters'
  locale: Locale
  today: string
  account: { name: string; email: string; phone: string }
}) {
  const t = useTranslations('eventStaff')
  const [phone, setPhone] = useState(account.phone)
  const [eventType, setEventType] = useState<(typeof EVENT_TYPES)[number]>('wedding')
  const [guests, setGuests] = useState(50)
  const [eventDate, setEventDate] = useState('')
  const [startTime, setStartTime] = useState('19:00')
  const [hours, setHours] = useState('5')
  const [venue, setVenue] = useState('')
  const [staffWanted, setStaffWanted] = useState('')
  const [notes, setNotes] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<{ reference: string; email: string } | null>(null)

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setBusy(true)
    setError(null)
    try {
      const response = await fetch('/booking/staff-request', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({
          role,
          locale,
          phone,
          eventType,
          guests,
          eventDate,
          startTime,
          hours,
          venue,
          staffWanted,
          notes,
        }),
      })
      const body = (await response.json().catch(() => null)) as {
        ok?: boolean
        reference?: string
        email?: string
        message?: string
      } | null
      if (response.ok && body?.ok && body.reference) {
        setDone({ reference: body.reference, email: body.email ?? account.email })
        return
      }
      setError(body?.message ?? t('error'))
    } catch {
      setError(t('error'))
    } finally {
      setBusy(false)
    }
  }

  if (done) {
    return (
      <div className={`${NOTICE_SUCCESS} mt-6`} role="status">
        <p className="font-semibold">{t('doneTitle')}</p>
        <p className="mt-1">{t('doneBody', { email: done.email })}</p>
        <p className="mt-4 text-xs uppercase tracking-wider">{t('reference')}</p>
        <p className="font-mono text-2xl" dir="ltr">
          {done.reference}
        </p>
      </div>
    )
  }

  return (
    <form onSubmit={submit} className="mt-6 space-y-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block">
          <span className={LABEL}>{t('name')}</span>
          <input className={`${INPUT} mt-1`} value={account.name} readOnly disabled />
        </label>
        <label className="block">
          <span className={LABEL}>{t('email')}</span>
          <input className={`${INPUT} mt-1`} value={account.email} readOnly disabled dir="ltr" />
        </label>
      </div>
      <label className="block">
        <span className={LABEL}>{t('phone')}</span>
        <input
          className={`${INPUT} mt-1`}
          type="tel"
          dir="ltr"
          maxLength={40}
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
        />
        <span className={HINT}>{t('phoneHint')}</span>
      </label>

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block">
          <span className={LABEL}>{t('eventType')}</span>
          <select
            className={`${INPUT} mt-1`}
            value={eventType}
            onChange={(e) => setEventType(e.target.value as (typeof EVENT_TYPES)[number])}
          >
            {EVENT_TYPES.map((type) => (
              <option key={type} value={type}>
                {t(`type_${type}`)}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className={LABEL}>{t('guests')}</span>
          <input
            className={`${INPUT} mt-1`}
            type="number"
            required
            min={1}
            max={5000}
            value={guests}
            onChange={(e) => setGuests(Number(e.target.value))}
          />
        </label>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <label className="block">
          <span className={LABEL}>{t('date')}</span>
          <input
            className={`${INPUT} mt-1`}
            type="date"
            required
            min={today}
            value={eventDate}
            onChange={(e) => setEventDate(e.target.value)}
          />
        </label>
        <label className="block">
          <span className={LABEL}>{t('startTime')}</span>
          <input
            className={`${INPUT} mt-1`}
            type="time"
            value={startTime}
            onChange={(e) => setStartTime(e.target.value)}
          />
        </label>
        <label className="block">
          <span className={LABEL}>{t('hours')}</span>
          <input
            className={`${INPUT} mt-1`}
            type="number"
            min={1}
            max={24}
            value={hours}
            onChange={(e) => setHours(e.target.value)}
          />
        </label>
      </div>

      <label className="block">
        <span className={LABEL}>{t('venue')}</span>
        <input
          className={`${INPUT} mt-1`}
          required
          minLength={2}
          maxLength={200}
          value={venue}
          onChange={(e) => setVenue(e.target.value)}
        />
      </label>

      <label className="block">
        <span className={LABEL}>{t('staffWanted')}</span>
        <select
          className={`${INPUT} mt-1`}
          value={staffWanted}
          onChange={(e) => setStaffWanted(e.target.value)}
        >
          <option value="">{t('notSure')}</option>
          {Array.from({ length: 30 }, (_, i) => i + 1).map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </select>
      </label>

      <label className="block">
        <span className={LABEL}>{t('notes')}</span>
        <textarea
          className={`${INPUT} mt-1`}
          rows={4}
          maxLength={1000}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />
      </label>

      {error ? (
        <p className={NOTICE_ERROR} role="alert">
          {error}
        </p>
      ) : null}

      <button type="submit" className={PRIMARY_BUTTON} disabled={busy}>
        {busy ? t('sending') : t('submit')}
      </button>
    </form>
  )
}
