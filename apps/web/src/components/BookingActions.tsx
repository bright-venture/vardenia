'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { availableActions, type BookingStatus } from '@vardenia/core'
import { useRouter } from '../i18n/routing'
import { NOTICE_ERROR, SECONDARY_BUTTON, PRIMARY_BUTTON } from './formStyles'

/**
 * Accept, decline, or close out a booking.
 *
 * The buttons come from `availableActions('owner', status)` rather than from a
 * list written here, so what an owner is offered and what the server will accept
 * are the same rule read twice. A button that produces a 403 is worse than no
 * button.
 *
 * Posts to Payload's own `/api/bookings/:id`. No custom endpoint, because there
 * is nothing for one to add: the Bookings collection already filters updates to
 * the businesses this owner manages, and `guardBookingWrite` already refuses an
 * illegal or unauthorised transition. A route in front of that would be a second
 * place for the rules to live and drift.
 */

const LABEL_KEY: Partial<Record<BookingStatus, string>> = {
  confirmed: 'accept',
  cancelled: 'decline',
  completed: 'markCompleted',
  'no-show': 'markNoShow',
}

export function BookingActions({ id, status }: { id: number | string; status: BookingStatus }) {
  const t = useTranslations('partner')
  const common = useTranslations('common')
  const router = useRouter()

  const [busy, setBusy] = useState<BookingStatus | null>(null)
  const [problem, setProblem] = useState<string | null>(null)

  const actions = availableActions('owner', status)
  if (actions.length === 0) return null

  async function change(to: BookingStatus) {
    setProblem(null)
    setBusy(to)

    try {
      const response = await fetch(`/api/bookings/${id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ status: to }),
      })

      if (response.ok) {
        // The list is server-rendered, so the new status only appears once the
        // server component runs again.
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
      setBusy(null)
    }
  }

  return (
    <div className="mt-3">
      {problem ? (
        <p className={`${NOTICE_ERROR} mb-3`} role="alert">
          {problem}
        </p>
      ) : null}

      <div className="flex flex-wrap gap-2">
        {actions.map((to) => (
          <button
            key={to}
            type="button"
            disabled={busy !== null}
            onClick={() => change(to)}
            // Accepting is the common action on a pending booking, so it gets
            // the weight. Everything else is deliberately quieter - declining
            // somebody's evening should take a moment's thought.
            className={`${to === 'confirmed' ? PRIMARY_BUTTON : SECONDARY_BUTTON} px-4 py-2 text-xs`}
          >
            {busy === to ? t('working') : t(LABEL_KEY[to] ?? 'accept')}
          </button>
        ))}
      </div>
    </div>
  )
}
