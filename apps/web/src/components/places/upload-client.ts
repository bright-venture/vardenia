/**
 * Sending one photo from the phone to POST /place-uploads, and reading what
 * came back. Pure apart from the `fetch` it is handed, so every answer is
 * tested with a fake one. The contract is in app/place-uploads/route.ts.
 *
 * The session token goes in the multipart body only, never the URL. Server
 * text is never shown (it is English); each outcome is a kind the page turns
 * into a sentence in its own language.
 */

export const UPLOAD_URL = '/place-uploads'
export const STATUS_URL = '/place-submissions/status'

export type PhotoSlot = 'logo' | 'hero'

export type UploadResult =
  | { kind: 'ok'; logoReceived: boolean; heroReceived: boolean }
  /** The link is no longer valid (unknown, closed, idle, expired). */
  | { kind: 'dead' }
  | { kind: 'bad-file' }
  | { kind: 'rate-limited' }
  | { kind: 'failed' }

export async function postPlacePhoto(
  token: string,
  slot: PhotoSlot,
  file: File,
  fetchImpl: typeof fetch = fetch,
): Promise<UploadResult> {
  const form = new FormData()
  form.set('sessionToken', token)
  form.set('slot', slot)
  form.set('photo', file)

  let response: Response
  try {
    response = await fetchImpl(UPLOAD_URL, {
      method: 'POST',
      body: form,
      credentials: 'same-origin',
    })
  } catch {
    return { kind: 'failed' }
  }

  if (response.ok) {
    try {
      const body = (await response.json()) as Record<string, unknown>
      return {
        kind: 'ok',
        logoReceived: body.logoReceived === true,
        heroReceived: body.heroReceived === true,
      }
    } catch {
      return { kind: 'failed' }
    }
  }
  switch (response.status) {
    case 404:
      return { kind: 'dead' }
    case 400:
    case 413:
    case 415:
      return { kind: 'bad-file' }
    case 429:
      return { kind: 'rate-limited' }
    default:
      return { kind: 'failed' }
  }
}
