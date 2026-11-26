/**
 * Photos for the "add your place" form, made small enough to send.
 *
 * The route takes the whole request, files included, up to 6 MB
 * (MAX_SUBMISSION_BYTES), and the hosting platform has its own request limit
 * not far above that. A phone photo is 3 to 8 MB on its own. So every photo is
 * shrunk in the browser before it is sent: at most 1600 px on the long side,
 * re-encoded as JPEG, stepping quality and then size down until it fits.
 *
 * # One budget per photo, not one for the set
 *
 * The form takes at most eight photos (one main photo, six for the gallery, one
 * logo), and each is fitted into an eighth of a 4 MB budget when it is chosen.
 * So the set fits whatever the owner adds later, and adding a seventh photo
 * never means re-encoding the first six. 4 MB leaves room below the 6 MB cap for
 * the JSON and the multipart framing.
 *
 * The planning (sizes, quality steps, budgets) is pure and unit-tested, and so
 * is the order of decode fallbacks (`decodeImage`, with injected browser
 * calls). The canvas part at the bottom (`preparePhoto`) and the real browser
 * calls need a real browser and are not tested; they are kept as thin as
 * possible.
 */

export const ACCEPTED_PHOTO_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const

/** The `accept` attribute for the file inputs. */
export const PHOTO_ACCEPT = ACCEPTED_PHOTO_TYPES.join(',')

export const MAX_EDGE = 1600
export const TOTAL_PHOTO_BUDGET = 4 * 1024 * 1024
/** Gallery photos the form still takes (superseded by the phone upload session). */
export const MAX_GALLERY_PHOTOS = 6
/** Main photo + gallery + logo. */
export const MAX_PHOTOS = 1 + MAX_GALLERY_PHOTOS + 1
export const PER_PHOTO_BUDGET = Math.floor(TOTAL_PHOTO_BUDGET / MAX_PHOTOS)

/** Tried in order at each size; 0.82 looks like the original on a phone. */
export const QUALITY_STEPS = [0.82, 0.74, 0.66, 0.58] as const
/** Long-side sizes, tried after every quality at the size before failed. */
export const EDGE_STEPS = [MAX_EDGE, 1280, 1024, 800] as const

export function isAcceptedPhoto(file: { type: string }): boolean {
  return (ACCEPTED_PHOTO_TYPES as readonly string[]).includes(file.type)
}

export function totalBytes(files: ReadonlyArray<{ size: number }>): number {
  return files.reduce((sum, file) => sum + file.size, 0)
}

export function withinBudget(
  files: ReadonlyArray<{ size: number }>,
  budget = TOTAL_PHOTO_BUDGET,
): boolean {
  return totalBytes(files) <= budget
}

/** The size to draw at: long side at most `maxEdge`, never enlarged. */
export function fitWithin(
  width: number,
  height: number,
  maxEdge: number = MAX_EDGE,
): { width: number; height: number } {
  const long = Math.max(width, height)
  if (long <= maxEdge) return { width, height }
  const scale = maxEdge / long
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  }
}

/** A photo already small in both senses is sent as it is (a PNG logo keeps its transparency). */
export function canKeepOriginal(
  photo: { size: number; width: number; height: number },
  budget = PER_PHOTO_BUDGET,
  maxEdge: number = MAX_EDGE,
): boolean {
  return photo.size <= budget && Math.max(photo.width, photo.height) <= maxEdge
}

export interface EncodeAttempt {
  width: number
  height: number
  quality: number
}

/** Every (size, quality) to try, best first. Sizes that change nothing are skipped. */
export function encodeAttempts(width: number, height: number): EncodeAttempt[] {
  const attempts: EncodeAttempt[] = []
  let last: { width: number; height: number } | null = null
  for (const edge of EDGE_STEPS) {
    const size = fitWithin(width, height, edge)
    if (last && last.width === size.width && last.height === size.height) continue
    last = size
    for (const quality of QUALITY_STEPS) attempts.push({ ...size, quality })
  }
  return attempts
}

/** "garden.png" becomes "garden.jpg", since the re-encoded file is a JPEG. */
export function jpegName(name: string): string {
  const base = name.replace(/\.[^.]*$/, '')
  return `${base || 'photo'}.jpg`
}

export type PhotoProblem = 'type' | 'decode' | 'too-large'

export class PhotoError extends Error {
  constructor(readonly problem: PhotoProblem) {
    super(problem)
    this.name = 'PhotoError'
  }
}

/*
 * Decoding. The fallback order is unit-tested through injected dependencies;
 * the real browser calls in `browserDecodeDeps` are not (jsdom cannot decode).
 */

/** A decoded photo, ready to draw; `release` frees the bitmap or object URL. */
export interface DecodedImage {
  source: CanvasImageSource
  width: number
  height: number
  release: () => void
}

interface BitmapLike {
  width: number
  height: number
  close: () => void
}

export interface DecodeDeps {
  /** Absent on browsers without the API. */
  createImageBitmap?: (image: Blob, options?: ImageBitmapOptions) => Promise<BitmapLike>
  /** The last resort: an <img> loaded from an object URL. */
  loadImage: (file: Blob) => Promise<DecodedImage>
}

/** Calls `make`, turning a synchronous throw into a rejection. */
async function attempt<T>(make: () => Promise<T>): Promise<T> {
  return make()
}

const fromBitmap = (bitmap: BitmapLike): DecodedImage => ({
  source: bitmap as unknown as CanvasImageSource,
  width: bitmap.width,
  height: bitmap.height,
  release: () => bitmap.close(),
})

/**
 * Decode a photo, trying the most capable way first:
 *
 * 1. `createImageBitmap(file, { imageOrientation: 'from-image' })`, which keeps a
 *    portrait phone photo upright. Browsers that do not know that option value
 *    (older Safari, by the reviewer's reading) throw a TypeError here.
 * 2. `createImageBitmap(file)` with no options.
 * 3. An <img> from an object URL. Current browsers apply EXIF orientation to
 *    images by default.
 *
 * Only when all of them fail is it a PhotoError('decode'). Without this chain,
 * a browser that rejected step 1 refused every photo, so the main photo, and
 * with it Submit, was impossible.
 */
export async function decodeImage(
  file: Blob,
  deps: DecodeDeps = browserDecodeDeps(),
): Promise<DecodedImage> {
  const create = deps.createImageBitmap
  if (create) {
    try {
      return fromBitmap(await attempt(() => create(file, { imageOrientation: 'from-image' })))
    } catch {
      // Unknown option value or unsupported image: try plainer ways.
    }
    try {
      return fromBitmap(await attempt(() => create(file)))
    } catch {
      // Fall through to the image element.
    }
  }
  try {
    return await attempt(() => deps.loadImage(file))
  } catch {
    throw new PhotoError('decode')
  }
}

/** The real browser APIs. */
export function browserDecodeDeps(): DecodeDeps {
  return {
    createImageBitmap:
      typeof globalThis.createImageBitmap === 'function'
        ? (image, options) =>
            options
              ? globalThis.createImageBitmap(image, options)
              : globalThis.createImageBitmap(image)
        : undefined,
    loadImage: (file) =>
      new Promise<DecodedImage>((resolve, reject) => {
        const url = URL.createObjectURL(file)
        const image = new Image()
        image.onload = () =>
          resolve({
            source: image,
            width: image.naturalWidth,
            height: image.naturalHeight,
            release: () => URL.revokeObjectURL(url),
          })
        image.onerror = () => {
          URL.revokeObjectURL(url)
          reject(new Error('image did not load'))
        }
        image.src = url
      }),
  }
}

/*
 * The canvas part. Not unit-tested: jsdom has no image decoder or canvas.
 */

/**
 * The photo, ready to send: the original when it is already small, otherwise a
 * downscaled JPEG within PER_PHOTO_BUDGET. Throws PhotoError rather than ever
 * returning something too large.
 */
export async function preparePhoto(file: File): Promise<File> {
  if (!isAcceptedPhoto(file)) throw new PhotoError('type')

  const image = await decodeImage(file)

  try {
    if (canKeepOriginal({ size: file.size, width: image.width, height: image.height })) {
      return file
    }
    const canvas = document.createElement('canvas')
    const context = canvas.getContext('2d')
    if (!context) throw new PhotoError('decode')

    for (const step of encodeAttempts(image.width, image.height)) {
      canvas.width = step.width
      canvas.height = step.height
      // JPEG has no transparency: paint white first or a PNG's clear areas turn black.
      context.fillStyle = 'white'
      context.fillRect(0, 0, step.width, step.height)
      context.drawImage(image.source, 0, 0, step.width, step.height)
      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, 'image/jpeg', step.quality),
      )
      if (blob && blob.size <= PER_PHOTO_BUDGET) {
        return new File([blob], jpegName(file.name), { type: 'image/jpeg' })
      }
    }
    throw new PhotoError('too-large')
  } finally {
    image.release()
  }
}
