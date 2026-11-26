'use client'

/* eslint-disable @next/next/no-img-element -- a data: URL made in the browser, which next/image cannot load */

import { useEffect, useState } from 'react'
import QRCode from 'qrcode'

/**
 * The QR code of the phone upload link, drawn in the browser (the link carries
 * the session token, so it is never sent to a server to be drawn). Big, black
 * on white and with a quiet border, so a phone camera reads it from a kiosk
 * distance. The image is keyed to the value it was made for, so a stale code
 * is never shown for a newer link.
 */
export function PlaceQr({ value, alt }: { value: string; alt: string }) {
  const [made, setMade] = useState<{ value: string; url: string } | null>(null)

  useEffect(() => {
    let current = true
    QRCode.toDataURL(value, {
      errorCorrectionLevel: 'M',
      margin: 2,
      width: 512,
      color: { dark: '#000000', light: '#ffffff' },
    })
      .then((url) => {
        if (current) setMade({ value, url })
      })
      .catch(() => {
        if (current) setMade(null)
      })
    return () => {
      current = false
    }
  }, [value])

  if (made?.value !== value) {
    return <div className="mx-auto aspect-square w-full max-w-sm" aria-hidden="true" />
  }
  return (
    <img
      src={made.url}
      alt={alt}
      width={512}
      height={512}
      className="border-ink-100 mx-auto aspect-square w-full max-w-sm border bg-white"
    />
  )
}
