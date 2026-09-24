'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { useRouter } from '../i18n/routing'
import { INPUT, NOTICE_ERROR, PRIMARY_BUTTON, SECONDARY_BUTTON } from './formStyles'

/**
 * Lets a venue question one line of its statement.
 *
 * A link first, then a one-line reason. The reason is required: "the guest
 * never came" and "that was a staff table" lead to different checks, and the
 * team cannot call a guest about a line nobody explained.
 *
 * Whether the link appears is decided on the server (`canDispute`), and the
 * route checks it again, so the two agree rather than the component deciding.
 */
export function DisputeLineForm({ statement, line }: { statement: number; line: string }) {
  const t = useTranslations('partner')
  const router = useRouter()

  const [open, setOpen] = useState(false)
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [problem, setProblem] = useState<string | null>(null)

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-gold-700 hover:text-ink-900 mt-1 block text-xs underline underline-offset-4"
      >
        {t('disputeAction')}
      </button>
    )
  }

  async function send() {
    setProblem(null)
    setBusy(true)
    try {
      const response = await fetch('/billing/dispute', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ statement, line, reason }),
      })
      if (response.ok) {
        router.refresh()
        setOpen(false)
        return
      }
      const body = (await response.json().catch(() => ({}))) as { code?: string }
      setProblem(body.code === 'closed' ? t('disputeClosedError') : t('disputeError'))
    } catch {
      setProblem(t('disputeError'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mt-2 space-y-2">
      <label className="text-ink-500 block text-xs">
        {t('disputeReason')}
        <input
          className={`${INPUT} mt-1`}
          value={reason}
          maxLength={300}
          onChange={(event) => setReason(event.target.value)}
        />
      </label>
      <div className="flex gap-2">
        <button
          type="button"
          className={PRIMARY_BUTTON}
          disabled={busy || reason.trim().length < 3}
          onClick={send}
        >
          {t('disputeSend')}
        </button>
        <button type="button" className={SECONDARY_BUTTON} onClick={() => setOpen(false)}>
          {t('disputeCancel')}
        </button>
      </div>
      {problem ? <p className={NOTICE_ERROR}>{problem}</p> : null}
    </div>
  )
}
