/**
 * Drawn magazine pages, kept and prepared ahead, so turning a page is instant.
 *
 * A page used to be fetched and drawn only once it was asked for: the reader
 * clicked, the next two pages' share of a heavy PDF came down in 1 MB ranges,
 * each was rasterised at full sharpness, and only then did the turn begin. A
 * page already read was thrown away, so going back cost the same again.
 *
 * Now every drawing goes through here. A finished page is kept, the most
 * recent first, within a pixel budget a phone can afford; a page asked for
 * while it is still being drawn shares that one drawing instead of starting a
 * second; and the reader draws the spreads either side of the open one ahead
 * of time (MagazineReader), so the next turn finds its pages already here.
 */

export interface DrawnPage {
  canvas: HTMLCanvasElement
  /** Size on screen, in CSS pixels. */
  width: number
  height: number
}

/** What drawing a page needs; the reader supplies it from PDF.js. */
export type DrawPage = (page: number, width: number, height: number) => Promise<DrawnPage>

/**
 * About 24 megapixels: six or so pages at a sharp phone or laptop size. Each
 * pixel is four bytes, so roughly 100 MB at worst, released as pages fall out.
 */
export const PAGE_CACHE_PIXELS = 24_000_000

const keyOf = (page: number, width: number, height: number) =>
  `${page}:${Math.round(width)}x${Math.round(height)}`

export class PageCache {
  private done = new Map<string, DrawnPage>()
  private pending = new Map<string, Promise<DrawnPage>>()
  private pixels = 0

  constructor(
    private readonly draw: DrawPage,
    private readonly budget = PAGE_CACHE_PIXELS,
  ) {}

  /** A page already drawn at this size, or undefined. Counts as a fresh use. */
  peek(page: number, width: number, height: number): DrawnPage | undefined {
    const key = keyOf(page, width, height)
    const found = this.done.get(key)
    if (found) {
      this.done.delete(key)
      this.done.set(key, found)
    }
    return found
  }

  /** The page at this size: kept, already on its way, or drawn now. */
  get(page: number, width: number, height: number): Promise<DrawnPage> {
    const found = this.peek(page, width, height)
    if (found) return Promise.resolve(found)
    const key = keyOf(page, width, height)
    const inFlight = this.pending.get(key)
    if (inFlight) return inFlight
    const job = this.draw(page, width, height).then(
      (drawn) => {
        this.pending.delete(key)
        this.keep(key, drawn)
        return drawn
      },
      (error: unknown) => {
        this.pending.delete(key)
        throw error
      },
    )
    this.pending.set(key, job)
    return job
  }

  /** Draws pages ahead of time, one after another, ignoring any that fail. */
  async prepare(pages: number[], width: number, height: number): Promise<void> {
    for (const page of pages) {
      if (this.peek(page, width, height)) continue
      await this.get(page, width, height).catch(() => undefined)
    }
  }

  get size(): number {
    return this.done.size
  }

  private keep(key: string, drawn: DrawnPage) {
    const cost = drawn.canvas.width * drawn.canvas.height
    this.done.set(key, drawn)
    this.pixels += cost
    // Oldest first out, but never the page just drawn.
    for (const [oldKey, old] of this.done) {
      if (this.pixels <= this.budget || oldKey === key) break
      this.done.delete(oldKey)
      this.pixels -= old.canvas.width * old.canvas.height
      // Hands the memory back at once rather than waiting for collection.
      old.canvas.width = 0
      old.canvas.height = 0
    }
  }
}
