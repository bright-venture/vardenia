import { PHOTO_MAX_BYTES } from '../hooks/limitUploadSize'
import type { PlaceSlot } from './place-upload'

/**
 * Reading a phone photo upload off the wire (POST /place-uploads), as small
 * functions so the route stays thin.
 *
 * Request contract: multipart/form-data with the text fields `sessionToken` and
 * `slot` ('logo' | 'hero') and the file `photo`. The token is in the BODY, never
 * the URL (query strings reach logs and referrers).
 *
 * The body is capped BEFORE it is parsed: the declared length is checked (411
 * when missing, 413 when over), then the stream is read with a running count and
 * dropped the moment it passes the cap, since a script can lie about the header.
 */

/** The file cap plus room for the multipart framing and the two text fields. */
export const MAX_UPLOAD_BODY_BYTES = PHOTO_MAX_BYTES + 64 * 1024

export interface Refusal {
  status: number
  message: string
}

const refuse = (status: number, message: string) => ({ ok: false as const, status, message })

async function readCapped(request: Request, max: number): Promise<Uint8Array | null> {
  const reader = request.body?.getReader()
  if (!reader) return new Uint8Array()
  const chunks: Uint8Array[] = []
  let total = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    total += value.byteLength
    if (total > max) {
      await reader.cancel().catch(() => {})
      return null
    }
    chunks.push(value)
  }
  const bytes = new Uint8Array(total)
  let at = 0
  for (const chunk of chunks) {
    bytes.set(chunk, at)
    at += chunk.byteLength
  }
  return bytes
}

export type ParsedUpload =
  { ok: true; token: string; slot: PlaceSlot; file: File | undefined } | ({ ok: false } & Refusal)

export async function readUpload(request: Request): Promise<ParsedUpload> {
  const type = request.headers.get('content-type') ?? ''
  if (!type.toLowerCase().startsWith('multipart/form-data')) {
    return refuse(415, 'Expected a photo upload.')
  }
  const declared = request.headers.get('content-length')
  if (declared === null || !/^\d+$/.test(declared.trim())) {
    return refuse(411, 'The request must state its size.')
  }
  if (Number(declared) > MAX_UPLOAD_BODY_BYTES) return refuse(413, 'That photo is too large.')

  let form: FormData
  try {
    const bytes = await readCapped(request, MAX_UPLOAD_BODY_BYTES)
    if (bytes === null) return refuse(413, 'That photo is too large.')
    form = await new Response(bytes as BodyInit, { headers: { 'content-type': type } }).formData()
  } catch {
    return refuse(400, 'The upload is incomplete.')
  }

  const token = form.get('sessionToken')
  const slot = form.get('slot')
  const photo = form.get('photo')
  if (typeof token !== 'string' || !token || token.length > 200) {
    return refuse(400, 'The upload is incomplete.')
  }
  if (slot !== 'logo' && slot !== 'hero') return refuse(400, 'The upload is incomplete.')
  if (photo !== null && typeof photo === 'string') return refuse(400, 'The upload is incomplete.')
  return { ok: true, token, slot, file: photo ?? undefined }
}
