import { PHOTO_MAX_BYTES } from '../hooks/limitUploadSize'

/**
 * Checking one uploaded photo: size, declared type and the real type from its
 * leading bytes. Not used by the start step of the Magazine Places form (it
 * takes no files); the phone upload session (a later task) checks the logo and
 * the main photo with it.
 */

/** JPEG, PNG and WebP only: narrower than Media, which also takes avif, mp4 and pdf. */
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const
type AllowedType = (typeof ALLOWED_TYPES)[number]

const startsWith = (bytes: Uint8Array, signature: number[], offset = 0) =>
  signature.every((byte, i) => bytes[offset + i] === byte)

/** What the leading bytes say the file is, whatever its name or declared type. */
function sniffType(bytes: Uint8Array): AllowedType | null {
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return 'image/jpeg'
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return 'image/png'
  // RIFF....WEBP
  if (
    startsWith(bytes, [0x52, 0x49, 0x46, 0x46]) &&
    startsWith(bytes, [0x57, 0x45, 0x42, 0x50], 8)
  ) {
    return 'image/webp'
  }
  return null
}

export interface CheckedFile {
  data: Buffer
  mimetype: AllowedType
  name: string
  size: number
}

/** A readable reason, or the file's bytes when it passes. */
export async function checkPhoto(
  file: File | undefined,
  label: string,
): Promise<CheckedFile | string> {
  if (!file || typeof file.arrayBuffer !== 'function') return `The ${label} photo is missing.`
  if (file.size === 0) return `The ${label} photo is empty.`
  if (file.size > PHOTO_MAX_BYTES) {
    return `The ${label} photo is over ${PHOTO_MAX_BYTES / (1024 * 1024)} MB. Please choose a smaller one.`
  }
  if (!(ALLOWED_TYPES as readonly string[]).includes(file.type)) {
    return `The ${label} photo must be a JPEG, PNG or WebP image.`
  }
  const data = Buffer.from(await file.arrayBuffer())
  if (sniffType(data) !== file.type) {
    return `The ${label} photo must be a JPEG, PNG or WebP image.`
  }
  return { data, mimetype: file.type as AllowedType, name: file.name || 'photo', size: data.length }
}
