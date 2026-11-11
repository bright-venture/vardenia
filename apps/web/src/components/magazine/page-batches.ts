/**
 * Downloads the magazine ten pages at a time, ahead of the reader (11 November
 * 2026).
 *
 * The reader already fetches a PDF by byte ranges (pdf-range.ts) and draws the
 * spreads either side of the open one (page-cache.ts). That alone left every
 * turn past the next spread waiting on the network: a page's photographs came
 * down only once the page was asked for. On a phone that was a pause on most
 * turns.
 *
 * So the issue is read in batches of ten. When the book opens, the first batch
 * is downloaded in the background. When the reader comes within four pages of
 * the end of a batch, the next one follows; after a jump (the page box), the
 * batch around the new page comes first. A batch is downloaded, not drawn:
 * drawing stays with the page cache, at the size the page is shown. PDF.js
 * keeps the downloaded bytes for the life of the document, so a page from a
 * fetched batch only has to be drawn when it is reached.
 *
 * Pages are fetched one at a time, so a batch never crowds out the page being
 * read. A reader who has asked their phone to save data gets no batches at
 * all, only the pages they open and the spread drawn ahead.
 */

export const BATCH_SIZE = 10
/** How close to the end of a batch the reader comes before the next is fetched. */
export const BATCH_MARGIN = 4

/** The batch a page belongs to, from 0: pages 1-10 are batch 0. */
export const batchOf = (page: number, size = BATCH_SIZE) => Math.floor((page - 1) / size)

/** The pages of a batch, cut off at the end of the issue. */
export function batchPages(batch: number, total: number, size = BATCH_SIZE): number[] {
  const first = batch * size + 1
  const last = Math.min(total, first + size - 1)
  return first > last ? [] : Array.from({ length: last - first + 1 }, (_, i) => first + i)
}

/**
 * The batches wanted while pages `first` to `last` are open: the one they are
 * in, then the next if the reader is within the margin of its end.
 */
export function batchesFor(
  first: number,
  last: number,
  total: number,
  size = BATCH_SIZE,
  margin = BATCH_MARGIN,
): number[] {
  const current = batchOf(first, size)
  const wanted = [current]
  const end = Math.min(total, (batchOf(last, size) + 1) * size)
  if (batchOf(last, size) !== current) wanted.push(batchOf(last, size))
  if (end - last < margin && end < total) wanted.push(batchOf(last, size) + 1)
  return wanted
}

/** Whether the reader's phone has asked sites to save data. */
export function savingData(): boolean {
  const connection = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection
  return connection?.saveData === true
}

/** Downloads one page's content and photographs without drawing it. */
export type FetchPage = (page: number) => Promise<void>

/**
 * Fetches batches one page at a time, in the order they were asked for, each
 * batch once. `stop` ends it, for when the book closes.
 */
export class BatchLoader {
  private requested = new Set<number>()
  private queue: number[] = []
  private running = false
  private stopped = false

  constructor(
    private readonly fetchPage: FetchPage,
    private readonly total: number,
    private readonly size = BATCH_SIZE,
  ) {}

  /** Asks for these batches; ones already asked for are skipped. */
  want(batches: number[]): void {
    for (const batch of batches) {
      if (this.requested.has(batch)) continue
      this.requested.add(batch)
      this.queue.push(...batchPages(batch, this.total, this.size))
    }
    void this.run()
  }

  /** Batches asked for so far, for tests. */
  get asked(): number[] {
    return [...this.requested]
  }

  stop(): void {
    this.stopped = true
    this.queue = []
  }

  private async run(): Promise<void> {
    if (this.running) return
    this.running = true
    try {
      while (!this.stopped && this.queue.length > 0) {
        const page = this.queue.shift()!
        // A page that fails is left for the reader to fetch when it is opened.
        await this.fetchPage(page).catch(() => {})
      }
    } finally {
      this.running = false
    }
  }
}
