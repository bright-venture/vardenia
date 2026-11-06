// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import { PageCache, type DrawnPage } from './page-cache'

/** A drawn page of a given pixel size, without PDF.js. */
const drawn = (pixels: number): DrawnPage => {
  const canvas = document.createElement('canvas')
  canvas.width = pixels
  canvas.height = 1
  return { canvas, width: 100, height: 100 }
}

describe('the page cache', () => {
  it('draws a page once, however many times it is asked for at once', async () => {
    const draw = vi.fn(async () => drawn(10))
    const cache = new PageCache(draw)
    const [a, b] = await Promise.all([cache.get(3, 600, 800), cache.get(3, 600, 800)])
    expect(a).toBe(b)
    expect(draw).toHaveBeenCalledTimes(1)
    expect(cache.peek(3, 600, 800)).toBe(a)
  })

  it('draws again at another size, as after a resize or zoom', async () => {
    const draw = vi.fn(async () => drawn(10))
    const cache = new PageCache(draw)
    await cache.get(3, 600, 800)
    await cache.get(3, 900, 1200)
    expect(draw).toHaveBeenCalledTimes(2)
  })

  it('keeps the most recent pages within its pixel budget and lets the oldest go', async () => {
    const cache = new PageCache(async () => drawn(40), 100)
    await cache.get(1, 600, 800)
    await cache.get(2, 600, 800)
    cache.peek(1, 600, 800) // page 1 is used again, so page 2 is now the oldest
    await cache.get(3, 600, 800)
    expect(cache.peek(2, 600, 800)).toBeUndefined()
    expect(cache.peek(1, 600, 800)).toBeDefined()
    expect(cache.peek(3, 600, 800)).toBeDefined()
  })

  it('prepares pages ahead without drawing those it already holds', async () => {
    const draw = vi.fn(async () => drawn(10))
    const cache = new PageCache(draw)
    await cache.get(4, 600, 800)
    await cache.prepare([4, 5, 6], 600, 800)
    expect(draw).toHaveBeenCalledTimes(3)
    expect(cache.size).toBe(3)
  })

  it('does not remember a failure: the next request draws again', async () => {
    const draw = vi
      .fn<() => Promise<DrawnPage>>()
      .mockRejectedValueOnce(new Error('network'))
      .mockResolvedValue(drawn(10))
    const cache = new PageCache(draw)
    await expect(cache.get(7, 600, 800)).rejects.toThrow('network')
    await expect(cache.get(7, 600, 800)).resolves.toBeDefined()
    await expect(cache.prepare([8], 600, 800)).resolves.toBeUndefined()
  })
})
