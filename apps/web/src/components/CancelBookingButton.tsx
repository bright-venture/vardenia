'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { availableActions, type BookingStatus } from '@vardenia/core'
import { useRouter } from '../i18n/routing'
import { NOTICE_ERROR, SECONDARY_BUTTON } from './formStyles'

/**
 * Lets a customer cancel their own booking.
 *
 * The booking system was asymmetric without it: an owner could accept, decline
 * and cancel and the customer was told each time, while the customer's only
 * route to calling one off was to email a person. Meanwhile the venue held a
 * table for somebody who had decided not to come, which is the part that costs
 * a restaurant money.
 *
 * Whether the button appears at all comes from `availableActions('customer',
 * status)` rather than a condition written here, so it agrees with what the
 * server will accept. A terminal booking offers nothing, and a customer is never
 * offered "confirmed" - the guard refuses that, and a button that produces a 403
 * is worse than no button.
 *
 * # Two presses, because there is no third
 *
 * `cancelled` is terminal: `BOOKING_TRANSITIONS` allows nothing after it, so
 * there is no undo and support cannot reinstate the booking either. A single
 * mistap on a phone would end a reservation somebody made weeks ago, so the
 * button asks once. That is the only place in this product with a confirmation
 * step, and the irreversibility is the reason.
 */
export function CancelBookingButton({
  id,
  status,
}: {
  id: number | string
  status: BookingStatus
}) {
  const t = useTranslations('account')
  const common = useTranslations('common')
  const router = useRouter()

  const [asking, setAsking] = useState(false)
  const [busy, setBusy] = useState(false)
  const [problem, setProblem] = useState<string | null>(null)

  if (!availableActions('customer', status).includes('cancelled')) return null

  async function cancel() {
    setProblem(null)
    setBusy(true)

    try {
      const response = await fetch(`/api/bookings/${id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ status: 'cancelled' }),
      })

      if (response.ok) {
        // The list is server-rendered; the new status only appears once the
        // server component runs again.
        router.refresh()
        setAsking(false)
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
    <div className="mt-3">
      {problem ? (
        <p className={`${NOTICE_ERROR} mb-3`} role="alert">
          {problem}
        </p>
      ) : null}

      {asking ? (
        <div className="flex flex-wrap items-center gap-3">
          <p className="text-ink-700 text-xs">{t('cancelConfirm')}</p>
          <button
            type="button"
            disabled={busy}
            onClick={cancel}
            className={`${SECONDARY_BUTTON} border-state-danger text-state-danger px-4 py-2 text-xs`}
          >
            {busy ? t('working') : t('cancelYes')}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => setAsking(false)}
            className="text-ink-500 hover:text-ink-900 text-xs underline underline-offset-4"
          >
            {t('cancelNo')}
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setAsking(true)}
          className={`${SECONDARY_BUTTON} px-4 py-2 text-xs`}
        >
          {t('cancelBooking')}
        </button>
      )}
    </div>
  )
}
