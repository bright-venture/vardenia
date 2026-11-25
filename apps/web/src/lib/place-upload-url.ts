import type { Locale } from '@vardenia/i18n'

/**
 * The link the QR code on the big screen carries: the phone upload page of the
 * Magazine Places form, with the session token in the URL FRAGMENT.
 *
 * Never put the token in the query string. A query string goes to server and
 * proxy logs, to the Referer header and to analytics; a fragment is never sent
 * to the server at all, and the page reads it in the browser and removes it
 * from the address bar at once (see PlacePhotoUpload). For the same reason the
 * token must not be logged or reported anywhere that handles this URL.
 */
export function placeUploadUrl(origin: string, token: string, locale: Locale | string): string {
  return `${origin.replace(/\/+$/, '')}/${locale}/magazine-places/upload#t=${encodeURIComponent(token)}`
}

/** The token out of a fragment (`#t=...`), or null. Used by the phone page. */
export function tokenFromHash(hash: string): string | null {
  const match = /^#?(?:.*&)?t=([^&]+)/.exec(hash)
  if (!match?.[1]) return null
  try {
    return decodeURIComponent(match[1])
  } catch {
    return null
  }
}
