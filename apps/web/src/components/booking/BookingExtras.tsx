'use client'

import { useEffect, useId, useState } from 'react'
import { useTranslations } from 'next-intl'
import { formatUsd } from '@vardenia/core/price-quote'
import type { SeatingAreaKey } from '@vardenia/core/seating'
import type { Locale } from '@vardenia/i18n'
import type { BookingExtrasConfig } from '../../lib/listing-public'
import { HINT, INPUT, LABEL } from '../formStyles'

/**
 * The booking form's additions (Task 12): a restaurant's seating area, a guest
 * house's package, and the price the stay would be quoted.
 *
 * Controlled by the form, which sends `area` and `packageId` with the request;
 * this only draws the choices and asks /booking/availability for the quote
 * (the same function the booking service stores, lib/booking-price, so the
 * total shown is the total booked). A quote is a lookup, never a hold: the
 * form still only reserves on submit.
 *
 * Nothing is computed here. A refusal comes as the server's own sentence in
 * the guest's language, and 'no-price' (a place with no prices) shows nothing.
 */

export interface BookingExtrasValue {
  area: SeatingAreaKey | ''
  packageId: string
}

interface Answer {
  question: string
  total: number | null
  nights: number | null
  message: string | null
  full: Set<string>
}

const AREA_KEY: Record<SeatingAreaKey, string> = {
  indoor: 'areaIndoor',
  'indoor-smoking': 'areaIndoorSmoking',
  outdoor: 'areaOutdoor',
  'outdoor-smoking': 'areaOutdoorSmoking',
}

const UNIT_KEY = {
  'per-night': 'unitPerNight',
  'per-stay': 'unitPerStay',
  'per-person-per-night': 'unitPerPersonPerNight',
} as const

const isolate = (value: string) => `\u2066${value}\u2069`

export function BookingExtras({
  businessId,
  config,
  locale,
  interval,
  partySize,
  value,
  onChange,
}: {
  businessId: number
  config: BookingExtrasConfig
  locale: Locale
  /** The stay or sitting the form currently describes; null while it is incomplete. */
  interval: { start: string; end: string } | null
  partySize: number
  value: BookingExtrasValue
  onChange: (next: BookingExtrasValue) => void
}) {
  const t = useTranslations('listingExtras')
  const te = useTranslations('bookingExtras')
  const tb = useTranslations('booking')
  const ids = useId()

  const question =
    interval && Number.isInteger(partySize) && partySize >= 1
      ? new URLSearchParams({
          business: String(businessId),
          start: interval.start,
          end: interval.end,
          partySize: String(partySize),
          locale,
          ...(value.packageId ? { packageId: value.packageId } : {}),
          ...(value.area ? { area: value.area } : {}),
        }).toString()
      : ''
  const [answer, setAnswer] = useState<Answer | null>(null)
  const current = answer && answer.question === question ? answer : null
  const checking = Boolean(question) && !current

  useEffect(() => {
    if (!question) return
    const controller = new AbortController()
    // A short wait, so typing a party size is one lookup and not one a digit.
    const timer = setTimeout(() => {
      fetch(`/booking/availability?${question}`, { signal: controller.signal })
        .then((response) => response.json())
        .then(
          (body: {
            ok?: boolean
            reason?: string
            message?: string
            quote?:
              | { ok: true; total: number; nights: number }
              | { ok: false; reason: string; message: string }
            areas?: { area: string; ok: boolean; reason?: string }[]
          }) =>
            setAnswer({
              question,
              // A refused slot (taken, closed, too soon) is priced in the answer
              // too, but a total for a stay that cannot be booked misleads: show
              // the refusal, in the guest's language, instead.
              total: body.ok !== false && body.quote?.ok ? body.quote.total : null,
              nights: body.ok !== false && body.quote?.ok ? body.quote.nights : null,
              // 'no-price' is not a refusal worth saying: the place sets no price.
              message:
                body.ok === false
                  ? (body.message ?? null)
                  : body.quote && !body.quote.ok && body.quote.reason !== 'no-price'
                    ? body.quote.message
                    : null,
              full: new Set(
                (body.areas ?? [])
                  .filter((area) => !area.ok && area.reason === 'at-capacity')
                  .map((area) => area.area),
              ),
            }),
        )
        .catch((error: unknown) => {
          // Aborted: a newer question took over. Anything else (offline, a
          // proxy's HTML error page) shows nothing rather than "checking" forever.
          if ((error as { name?: string })?.name === 'AbortError') return
          setAnswer({ question, total: null, nights: null, message: null, full: new Set() })
        })
    }, 350)
    return () => {
      clearTimeout(timer)
      controller.abort()
    }
  }, [question])

  const areaName = (area: BookingExtrasConfig['areas'][number]) =>
    area.label ? `${area.label} (${t(AREA_KEY[area.key])})` : t(AREA_KEY[area.key])

  return (
    <>
      {config.areas.length > 0 ? (
        <div>
          <label className={LABEL} htmlFor={`${ids}-area`}>
            {te('area')}
          </label>
          <select
            id={`${ids}-area`}
            value={value.area}
            onChange={(event) => onChange({ ...value, area: event.target.value as SeatingAreaKey })}
            className={`mt-1.5 ${INPUT}`}
          >
            {config.areas.map((area) => (
              <option key={area.key} value={area.key}>
                {current?.full.has(area.key)
                  ? te('areaFull', { name: areaName(area) })
                  : areaName(area)}
              </option>
            ))}
          </select>
        </div>
      ) : null}

      {config.packages.length > 0 ? (
        <div>
          <label className={LABEL} htmlFor={`${ids}-package`}>
            {te('package')}
          </label>
          <select
            id={`${ids}-package`}
            value={value.packageId}
            onChange={(event) => onChange({ ...value, packageId: event.target.value })}
            className={`mt-1.5 ${INPUT}`}
            aria-describedby={value.packageId ? `${ids}-package-hint` : undefined}
          >
            <option value="">{te('packageNone')}</option>
            {config.packages.map((pack) => (
              <option key={pack.id} value={pack.id}>
                {pack.label}
                {' · '}
                {t('packagePrice', {
                  price: isolate(formatUsd(pack.price)),
                  unit: t(UNIT_KEY[pack.unit]),
                })}
              </option>
            ))}
          </select>
          {(() => {
            const chosen = config.packages.find((pack) => pack.id === value.packageId)
            return chosen?.description ? (
              <p id={`${ids}-package-hint`} dir="auto" className={HINT}>
                {chosen.description}
              </p>
            ) : null
          })()}
        </div>
      ) : null}

      {/* The total only where a price can exist: a guest house (packages or
          not). aria-live so a changed total is read out after a change. */}
      <div aria-live="polite">
        {checking ? <p className={HINT}>{te('checking')}</p> : null}
        {current?.total != null && current.nights != null ? (
          <div className="border-ink-100 bg-surface-sunken border px-4 py-3">
            <p className="text-ink-500 text-xs font-semibold uppercase tracking-wider">
              {te('total', { nights: tb('nightCount', { count: current.nights }) })}
            </p>
            <p className="text-ink-900 mt-1 text-2xl font-semibold tabular-nums">
              <bdi dir="ltr">{formatUsd(current.total)}</bdi>
            </p>
            <p className={HINT}>{te('note')}</p>
          </div>
        ) : current?.message ? (
          <p className={HINT}>{current.message}</p>
        ) : null}
      </div>
    </>
  )
}
