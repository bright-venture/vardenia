'use client'

import { useState } from 'react'

/**
 * The file field of the receipt form, which shrinks a large photo before the
 * form is sent.
 *
 * A phone camera's photo can be 8 MB or more, and the host refuses a request
 * over about 6 MB (lib/receipts). A receipt only has to stay readable, so a
 * photo larger than LIMIT_BYTES or MAX_SIDE is redrawn as a JPEG at most
 * MAX_SIDE pixels on its longest side and put back in the same field: the
 * form then submits as usual. PDFs are sent as they are.
 *
 * Without JavaScript the plain field still works; only a very large photo
 * would then be refused, with a message saying so.
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

export function ReceiptPicker({ id, label }: { id: string; label: string }) {
  const [name, setName] = useState<string | null>(null)

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
        className="text-ink-700 file:border-ink-100 file:text-ink-900 mt-2 block w-full text-sm file:me-3 file:border file:bg-transparent file:px-3 file:py-2 file:text-sm"
        onChange={async (event) => {
          const input = event.currentTarget
          const picked = input.files?.[0]
          if (!picked) return
          setName(picked.name)
          try {
            const smaller = await shrink(picked)
            if (smaller !== picked && typeof DataTransfer !== 'undefined') {
              const list = new DataTransfer()
              list.items.add(smaller)
              input.files = list.files
            }
          } catch {
            // Keep the original: the server says so if it is too large.
          }
        }}
      />
      {name ? <p className="text-ink-500 mt-1 text-xs">{name}</p> : null}
    </div>
  )
}
