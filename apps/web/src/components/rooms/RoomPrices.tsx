'use client'

import { useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import { formatUsd } from '@vardenia/core/price-quote'
import type { Locale } from '@vardenia/i18n'
import { formatRoomsParam, type RoomPick } from '../../lib/rooms-param'
import { HINT } from '../formStyles'

/**
 * Prices on the hotel's room list (Task 12): each option's nightly price, and
 * the total for the rooms picked. Both come from the owner's prices; the total
 * is asked of /booking/rooms with the selection, which prices it with the
 * function the booking service stores (lib/booking-price), so the number shown
 * is the number booked. Nothing is added up in the browser.
 */

/** "$70 per night" on an option row. Renders nothing for an option with no price. */
export function OptionPrice({ price }: { price: number | null }) {
  const te = useTranslations('bookingExtras')
  if (price === null) return null
  return (
    <p className="text-ink-900 mt-1 text-sm font-medium">
      {te('optionPrice', { price: `\u2066${formatUsd(price)}\u2069` })}
    </p>
  )
}

interface Answer {
  question: string
  total: number | null
  nights: number | null
  message: string | null
}

/** The total for the rooms picked. Renders nothing until there is a price to show. */
export function RoomsTotal({
  businessId,
  date,
  nights,
  guests,
  picks,
  locale,
}: {
  businessId: number
  /** The check-in day, YYYY-MM-DD; empty until the guest picks one. */
  date: string
  nights: number
  guests: number
  picks: RoomPick[]
  locale: Locale
}) {
  const te = useTranslations('bookingExtras')
  const tb = useTranslations('booking')
  const rooms = formatRoomsParam(picks)
  const question =
    date && rooms
      ? new URLSearchParams({
          business: String(businessId),
          date,
          nights: String(nights),
          guests: String(guests),
          locale,
          rooms,
        }).toString()
      : ''
  const [answer, setAnswer] = useState<Answer | null>(null)
  const current = answer && answer.question === question ? answer : null
  const checking = Boolean(question) && !current

  useEffect(() => {
    if (!question) return
    const controller = new AbortController()
    // A short wait, so several taps on a room count are one lookup.
    const timer = setTimeout(() => {
      fetch(`/booking/rooms?${question}`, { signal: controller.signal })
        .then((response) => response.json())
        .then(
          (body: {
            quote?:
              | { ok: true; total: number; nights: number }
              | { ok: false; reason: string; message: string }
          }) =>
            setAnswer({
              question,
              total: body.quote?.ok ? body.quote.total : null,
              nights: body.quote?.ok ? body.quote.nights : null,
              message:
                body.quote && !body.quote.ok && body.quote.reason !== 'no-price'
                  ? body.quote.message
                  : null,
            }),
        )
        .catch((error: unknown) => {
          if ((error as { name?: string })?.name === 'AbortError') return
          setAnswer({ question, total: null, nights: null, message: null })
        })
    }, 350)
    return () => {
      clearTimeout(timer)
      controller.abort()
    }
  }, [question])

  // The live region is always in the page, so the first total is announced.
  return (
    <div aria-live="polite" className="mt-2">
      {checking ? <p className={HINT}>{te('checking')}</p> : null}
      {current?.total != null && current.nights != null ? (
        <>
          <p className="text-ink-700 text-sm">
            {te('roomsTotal', { nights: tb('nightCount', { count: current.nights }) })}
            {': '}
            <span className="text-ink-900 text-base font-semibold tabular-nums">
              <bdi dir="ltr">{formatUsd(current.total)}</bdi>
            </span>
          </p>
          <p className={HINT}>{te('note')}</p>
        </>
      ) : current?.message ? (
        <p className={HINT}>{current.message}</p>
      ) : null}
    </div>
  )
}
