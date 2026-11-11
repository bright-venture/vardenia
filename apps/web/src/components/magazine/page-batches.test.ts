import { describe, expect, it, vi } from 'vitest'
import { BatchLoader, batchOf, batchPages, batchesFor } from './page-batches'

describe('magazine page batches', () => {
  it('puts pages 1-10 in the first batch and 11-20 in the second', () => {
    expect(batchOf(1)).toBe(0)
    expect(batchOf(10)).toBe(0)
    expect(batchOf(11)).toBe(1)
    expect(batchPages(1, 200)).toEqual([11, 12, 13, 14, 15, 16, 17, 18, 19, 20])
  })

  it('cuts the last batch off at the end of the issue', () => {
    expect(batchPages(19, 195)).toEqual([191, 192, 193, 194, 195])
    expect(batchPages(20, 195)).toEqual([])
  })

  it('wants only the open batch while the reader is well inside it', () => {
    expect(batchesFor(1, 1, 200)).toEqual([0])
    expect(batchesFor(4, 5, 200)).toEqual([0])
  })

  it('wants the next batch once the reader is within four pages of the end', () => {
    expect(batchesFor(6, 7, 200)).toEqual([0, 1])
    expect(batchesFor(16, 17, 200)).toEqual([1, 2])
  })

  it('wants both batches when a spread straddles them', () => {
    expect(batchesFor(10, 11, 200)).toEqual([0, 1])
  })

  it('wants nothing past the last page', () => {
    expect(batchesFor(198, 199, 200)).toEqual([19])
  })

  it('fetches each batch once, a page at a time, in order', async () => {
    const order: number[] = []
    let inFlight = 0
    let most = 0
    const fetchPage = vi.fn(async (page: number) => {
      inFlight++
      most = Math.max(most, inFlight)
      await Promise.resolve()
      order.push(page)
      inFlight--
    })
    const loader = new BatchLoader(fetchPage, 25)
    loader.want([0])
    loader.want([0, 1])
    await vi.waitFor(() => expect(order).toHaveLength(20))
    expect(order).toEqual(Array.from({ length: 20 }, (_, i) => i + 1))
    expect(most).toBe(1)
    expect(loader.asked).toEqual([0, 1])
  })

  it('carries on past a page that fails', async () => {
    const fetched: number[] = []
    const loader = new BatchLoader(async (page) => {
      if (page === 2) throw new Error('dropped')
      fetched.push(page)
    }, 3)
    loader.want([0])
    await vi.waitFor(() => expect(fetched).toEqual([1, 3]))
  })

  it('stops when the book closes', async () => {
    const fetched: number[] = []
    const loader = new BatchLoader(async (page) => {
      fetched.push(page)
      if (page === 2) loader.stop()
    }, 10)
    loader.want([0])
    await vi.waitFor(() => expect(fetched).toEqual([1, 2]))
    await new Promise((resolve) => setTimeout(resolve, 10))
    expect(fetched).toEqual([1, 2])
  })
})
