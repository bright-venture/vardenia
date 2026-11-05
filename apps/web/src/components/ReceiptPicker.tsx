'use client'

import { useRef, useState } from 'react'
import { useLocale, useTranslations } from 'next-intl'

/**
 * The file field of the receipt form. It shrinks a large photo before the form
 * is sent, and reads the total from it so the guest only has to check it.
 *
 * Shrinking: a phone camera's photo can be 8 MB or more, and the host refuses a
 * request over about 6 MB (lib/receipts). A receipt only has to stay readable,
 * so a photo larger than LIMIT_BYTES or MAX_SIDE is redrawn as a JPEG at most
 * MAX_SIDE pixels on its longest side and put back in the same field: the form
 * then submits as usual. PDFs are sent as they are.
 *
 * Reading: the (shrunk) file is sent to /booking/receipt/read, and what comes
 * back fills the total and currency fields of the same form, unless the guest
 * has typed their own total. The sealed reading goes in a hidden field, so the
 * team later sees what was read next to what the guest sent. The guest can
 * send at any moment; the form never waits for the reading.
 *
 * Without JavaScript the plain field still works and the guest types the
 * total; only a very large photo would then be refused, with a message.
 */

const MAX_SIDE = 2400
const LIMIT_BYTES = 1.5 * 1024 * 1024

async function shrink(file: File): Promise<File> {
  if (!file.type.startsWith('image/')) return file
  const bitmap = await createImageBitmap(file)
  const longest = Math.max(bitmap.width, bitmap.height)
  if (file.size <= LIMIT_BYTES && longest <= MAX_SIDE) return file
  const scale = Math.min(1, MAX_SIDE / longest)
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(bitmap.width * scale)
  canvas.height = Math.round(bitmap.height * scale)
  canvas.getContext('2d')?.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, 'image/jpeg', 0.85),
  )
  return blob ? new File([blob], 'receipt.jpg', { type: 'image/jpeg' }) : file
}

interface ReadResponse {
  reading: { total: number | null; currency: 'USD' | 'LBP' | null } | null
  sealed?: string
  off?: boolean
}

type Status =
  | { state: 'idle' }
  | { state: 'reading' }
  | { state: 'read'; total: number; currency: 'USD' | 'LBP' }
  | { state: 'unread' }

/** The figure as it goes in the total field: no grouping, cents only for dollars. */
const asTyped = (total: number, currency: 'USD' | 'LBP') =>
  currency === 'USD' ? total.toFixed(2) : String(Math.round(total))

const field = (form: HTMLFormElement | null, name: string) =>
  (form?.elements.namedItem(name) ?? null) as HTMLInputElement | HTMLSelectElement | null

export function ReceiptPicker({ id, label }: { id: string; label: string }) {
  const t = useTranslations('visit')
  const locale = useLocale()
  const [name, setName] = useState<string | null>(null)
  const [status, setStatus] = useState<Status>({ state: 'idle' })
  const [sealed, setSealed] = useState('')
  // The total this field filled in, so a new photo may replace it but never
  // a figure the guest typed themselves.
  const filled = useRef<string | null>(null)
  const pending = useRef<AbortController | null>(null)

  async function read(form: HTMLFormElement | null, file: File) {
    pending.current?.abort()
    setSealed('')
    const token = field(form, 'token')?.value
    if (!form || !token) return
    const controller = new AbortController()
    pending.current = controller
    setStatus({ state: 'reading' })
    try {
      const body = new FormData()
      body.set('token', token)
      body.set('file', file)
      const response = await fetch('/booking/receipt/read', {
        method: 'POST',
        body,
        signal: controller.signal,
      })
      const result = (await response.json()) as ReadResponse
      if (controller.signal.aborted) return
      if (result.off) return setStatus({ state: 'idle' })
      const { total, currency } = result.reading ?? { total: null, currency: null }
      if (total === null || currency === null) return setStatus({ state: 'unread' })

      const amount = field(form, 'amount')
      const typed = amount?.value.trim() ?? ''
      if (amount && (typed === '' || typed === filled.current)) {
        filled.current = asTyped(total, currency)
        amount.value = filled.current
        const select = field(form, 'currency')
        if (select) select.value = currency
      }
      setSealed(result.sealed ?? '')
      setStatus({ state: 'read', total, currency })
    } catch {
      if (!controller.signal.aborted) setStatus({ state: 'unread' })
    }
  }

  const message =
    status.state === 'reading'
      ? t('receiptReading')
      : status.state === 'read'
        ? t('receiptRead', {
            amount: new Intl.NumberFormat(locale, {
              style: 'currency',
              currency: status.currency,
              maximumFractionDigits: status.currency === 'LBP' ? 0 : 2,
            }).format(status.total),
          })
        : status.state === 'unread'
          ? t('receiptNotRead')
          : null

  return (
    <div>
      <label htmlFor={id} className="text-ink-700 block text-sm">
        {label}
      </label>
      <input
        id={id}
        name="file"
        type="file"
        required
        accept="image/jpeg,image/png,image/webp,application/pdf"
        aria-describedby={`${id}-status`}
        className="text-ink-700 file:border-ink-100 file:text-ink-900 mt-2 block w-full text-sm file:me-3 file:border file:bg-transparent file:px-3 file:py-2 file:text-sm"
        onChange={async (event) => {
          const input = event.currentTarget
          const picked = input.files?.[0]
          if (!picked) return
          setName(picked.name)
          let file = picked
          try {
            const smaller = await shrink(picked)
            if (smaller !== picked && typeof DataTransfer !== 'undefined') {
              const list = new DataTransfer()
              list.items.add(smaller)
              input.files = list.files
              file = smaller
            }
          } catch {
            // Keep the original: the server says so if it is too large.
          }
          await read(input.form, file)
        }}
      />
      <input type="hidden" name="reading" value={sealed} />
      {name ? <p className="text-ink-500 mt-1 text-xs">{name}</p> : null}
      <p id={`${id}-status`} role="status" className="text-ink-700 mt-2 text-sm empty:hidden">
        {message}
      </p>
    </div>
  )
}
