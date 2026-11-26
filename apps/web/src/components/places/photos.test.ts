import { describe, expect, it, vi } from 'vitest'
import {
  EDGE_STEPS,
  MAX_EDGE,
  MAX_PHOTOS,
  PER_PHOTO_BUDGET,
  QUALITY_STEPS,
  TOTAL_PHOTO_BUDGET,
  canKeepOriginal,
  decodeImage,
  PhotoError,
  encodeAttempts,
  fitWithin,
  isAcceptedPhoto,
  jpegName,
  totalBytes,
  withinBudget,
} from './photos'

/**
 * The planning half of photo handling: what size to aim for, which qualities to
 * try, and whether everything still fits. The canvas half (decode, draw,
 * toBlob) needs a real browser and is not tested here.
 */

const MB = 1024 * 1024

describe('accepted types', () => {
  it('takes JPEG, PNG and WebP only', () => {
    expect(isAcceptedPhoto({ type: 'image/jpeg' })).toBe(true)
    expect(isAcceptedPhoto({ type: 'image/png' })).toBe(true)
    expect(isAcceptedPhoto({ type: 'image/webp' })).toBe(true)
    expect(isAcceptedPhoto({ type: 'image/gif' })).toBe(false)
    expect(isAcceptedPhoto({ type: 'image/heic' })).toBe(false)
    expect(isAcceptedPhoto({ type: 'application/pdf' })).toBe(false)
    expect(isAcceptedPhoto({ type: '' })).toBe(false)
  })
})

describe('budget', () => {
  it('keeps the whole set well under the 6 MB server cap', () => {
    expect(TOTAL_PHOTO_BUDGET).toBeLessThanOrEqual(4 * MB)
    expect(MAX_PHOTOS).toBe(8) // hero + 6 gallery + logo
    expect(PER_PHOTO_BUDGET * MAX_PHOTOS).toBeLessThanOrEqual(TOTAL_PHOTO_BUDGET)
  })

  it('adds up sizes and checks them against the budget', () => {
    expect(totalBytes([{ size: 10 }, { size: 32 }])).toBe(42)
    expect(totalBytes([])).toBe(0)
    expect(withinBudget([{ size: 2 * MB }, { size: 1.9 * MB }])).toBe(true)
    expect(withinBudget([{ size: 2 * MB }, { size: 2.1 * MB }])).toBe(false)
  })
})

describe('fitWithin', () => {
  it('scales the long side down to the limit, keeping the shape', () => {
    expect(fitWithin(4000, 3000, 1600)).toEqual({ width: 1600, height: 1200 })
    expect(fitWithin(3000, 4000, 1600)).toEqual({ width: 1200, height: 1600 })
  })

  it('never scales up', () => {
    expect(fitWithin(800, 600, 1600)).toEqual({ width: 800, height: 600 })
  })

  it('rounds and never returns zero', () => {
    expect(fitWithin(10000, 3, 1600)).toEqual({ width: 1600, height: 1 })
  })

  it('uses 1600 px by default', () => {
    expect(MAX_EDGE).toBe(1600)
    expect(fitWithin(3200, 1600)).toEqual({ width: 1600, height: 800 })
  })
})

describe('canKeepOriginal', () => {
  it('keeps a small photo untouched', () => {
    expect(canKeepOriginal({ size: 200_000, width: 1200, height: 800 })).toBe(true)
  })

  it('re-encodes one that is too wide', () => {
    expect(canKeepOriginal({ size: 200_000, width: 2400, height: 800 })).toBe(false)
  })

  it('re-encodes one that is too heavy', () => {
    expect(canKeepOriginal({ size: PER_PHOTO_BUDGET + 1, width: 1200, height: 800 })).toBe(false)
  })
})

describe('encodeAttempts', () => {
  it('starts at 1600 px and quality 0.82, then steps quality down, then size', () => {
    const attempts = encodeAttempts(4000, 3000)
    expect(attempts[0]).toEqual({ width: 1600, height: 1200, quality: 0.82 })
    expect(QUALITY_STEPS[0]).toBe(0.82)
    expect(attempts[1]!.width).toBe(1600)
    expect(attempts[1]!.quality).toBeLessThan(0.82)
    const firstSmaller = attempts.findIndex((a) => a.width < 1600)
    expect(firstSmaller).toBe(QUALITY_STEPS.length)
    expect(attempts).toHaveLength(EDGE_STEPS.length * QUALITY_STEPS.length)
  })

  it('never makes the size bigger as it goes', () => {
    const attempts = encodeAttempts(5000, 2000)
    for (let i = 1; i < attempts.length; i++) {
      expect(attempts[i]!.width).toBeLessThanOrEqual(attempts[i - 1]!.width)
    }
  })

  it('skips edge steps that do not change a small photo', () => {
    const attempts = encodeAttempts(900, 600)
    const widths = [...new Set(attempts.map((a) => a.width))]
    expect(widths).toEqual([900, 800])
  })
})

describe('jpegName', () => {
  it('replaces the extension', () => {
    expect(jpegName('garden.PNG')).toBe('garden.jpg')
    expect(jpegName('a.b.webp')).toBe('a.b.jpg')
    expect(jpegName('noext')).toBe('noext.jpg')
    expect(jpegName('')).toBe('photo.jpg')
  })
})

describe('decodeImage', () => {
  const file = new File(['x'], 'p.jpg', { type: 'image/jpeg' })
  const bitmap = (width = 40, height = 30) => ({ width, height, close: vi.fn() })
  const element = (width = 20, height = 10) => ({
    source: {} as CanvasImageSource,
    width,
    height,
    release: vi.fn(),
  })
  const fail = () => Promise.reject(new TypeError('unsupported'))

  it('uses the oriented bitmap when the browser supports it', async () => {
    const made = bitmap()
    const createImageBitmap = vi.fn(async () => made)
    const loadImage = vi.fn()
    const decoded = await decodeImage(file, { createImageBitmap, loadImage })
    expect(createImageBitmap).toHaveBeenCalledWith(file, { imageOrientation: 'from-image' })
    expect(loadImage).not.toHaveBeenCalled()
    expect([decoded.width, decoded.height]).toEqual([40, 30])
    decoded.release()
    expect(made.close).toHaveBeenCalled()
  })

  it('retries without options when the oriented call throws', async () => {
    const made = bitmap(50, 60)
    const createImageBitmap = vi.fn((_file: Blob, options?: object) =>
      options ? fail() : Promise.resolve(made),
    )
    const loadImage = vi.fn()
    const decoded = await decodeImage(file, { createImageBitmap, loadImage })
    expect(createImageBitmap).toHaveBeenCalledTimes(2)
    expect(createImageBitmap.mock.calls[1]).toEqual([file])
    expect(loadImage).not.toHaveBeenCalled()
    expect(decoded.width).toBe(50)
    decoded.release()
    expect(made.close).toHaveBeenCalled()
  })

  it('falls back to an image element when both bitmap calls throw', async () => {
    const img = element()
    const createImageBitmap = vi.fn(fail)
    const loadImage = vi.fn(async () => img)
    const decoded = await decodeImage(file, { createImageBitmap, loadImage })
    expect(createImageBitmap).toHaveBeenCalledTimes(2)
    expect(loadImage).toHaveBeenCalledWith(file)
    expect(decoded.source).toBe(img.source)
    decoded.release()
    expect(img.release).toHaveBeenCalled()
  })

  it('goes straight to the image element when createImageBitmap does not exist', async () => {
    const img = element()
    const loadImage = vi.fn(async () => img)
    const decoded = await decodeImage(file, { loadImage })
    expect(loadImage).toHaveBeenCalledWith(file)
    expect(decoded.width).toBe(20)
  })

  it('treats a synchronous throw like a rejected promise', async () => {
    const img = element()
    const createImageBitmap = vi.fn(() => {
      throw new TypeError('bad option')
    })
    const decoded = await decodeImage(file, {
      createImageBitmap: createImageBitmap as never,
      loadImage: async () => img,
    })
    expect(decoded.width).toBe(20)
  })

  it("throws PhotoError('decode') when every way fails", async () => {
    const error = await decodeImage(file, {
      createImageBitmap: vi.fn(fail),
      loadImage: vi.fn(fail),
    }).catch((e: unknown) => e)
    expect(error).toBeInstanceOf(PhotoError)
    expect((error as PhotoError).problem).toBe('decode')
  })
})
