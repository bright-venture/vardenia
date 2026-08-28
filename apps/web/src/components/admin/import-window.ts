/**
 * How many listings the import screen asks for at a time.
 *
 * # Why this is not a constant
 *
 * It was, and the number was wrong. A fixed window of five took 17.3 seconds
 * against the development database - measured, over 62 windows - and a Netlify
 * function is killed at ten. The same five would have failed in production
 * while working perfectly on a laptop, which is the worst way for a limit to be
 * wrong.
 *
 * The cost per listing is not knowable in advance either. It depends on the
 * distance between the function and the database, and those are the same room
 * in development and different continents in production. So the client measures
 * a window and sizes the next one.
 *
 * # Why it is its own file
 *
 * So it can be tested. Importing the component pulls in @payloadcms/ui, which
 * imports CSS that the test runner cannot load - and this is the one piece of
 * the screen whose correctness cannot be established by using the feature in
 * development, because development is exactly where the wrong answer works.
 */

/** Start here. Guessing high and correcting down means the first window dies. */
export const FIRST_WINDOW = 1

/** The endpoint clamps to this too; it is a guard, not a tuning knob. */
export const MAX_WINDOW = 25

/** Well under a 10s function limit, leaving room for a slow round trip. */
export const TARGET_MS = 6000

export function nextWindowSize(current: number, elapsedMs: number): number {
  // A window that returned instantly says nothing useful; grow cautiously.
  const perListing = Math.max(elapsedMs / Math.max(current, 1), 1)
  const fits = Math.floor(TARGET_MS / perListing)

  // Never more than double at once, so one unusually fast window - a run of
  // listings that already existed and were skipped - cannot launch the next one
  // straight into a timeout.
  return Math.max(1, Math.min(fits, current * 2, MAX_WINDOW))
}

/**
 * How many windows are in flight at once.
 *
 * # Why parallel at all
 *
 * A window is almost entirely waiting. Measured against development, 98% of an
 * import is the network: the database executes a listing's statements in about
 * two milliseconds and the rest is the round trip. In production the function
 * is in us-east-1 and the database in Frankfurt, so the window shrinks to one
 * or two listings and the import becomes a couple of hundred sequential
 * requests, each mostly idle.
 *
 * Lanes fill that idle time. Three is deliberately modest: Supabase's
 * transaction pooler has a connection limit that a much larger number would
 * start competing for, and the point is to stop waiting, not to hammer it.
 */
export const LANES = 3

/**
 * Hands out non-overlapping slices of the file to whichever lane asks next.
 *
 * Overlap is the thing to avoid. Two lanes given the same offset would import
 * the same listings twice - not duplicated, because a taken slug is skipped,
 * but counted twice and paid for twice, and the progress bar would run past the
 * end. So the cursor is the single source of truth for what has been claimed,
 * and `nextOffset` from the server is ignored while lanes are running.
 */
export class WindowCursor {
  private at: number

  constructor(
    private readonly total: number,
    from = 0,
  ) {
    this.at = Math.max(0, from)
  }

  /** The next slice, or null when the file is claimed to the end. */
  take(size: number): { offset: number; limit: number } | null {
    if (this.at >= this.total) return null

    const offset = this.at
    /**
     * At least one, always. A slice of zero would hand a lane no work while
     * leaving the file unfinished, and the lane would ask again immediately -
     * a spin that claims nothing and never ends. NaN reaches here whenever a
     * window is sized from a measurement that was not a number.
     */
    const asked = Number.isFinite(size) ? Math.floor(size) : 1
    const limit = Math.min(Math.max(1, asked), this.total - offset)
    this.at = offset + limit

    return { offset, limit }
  }

  /** What has been handed out. Not what has finished. */
  get claimed(): number {
    return this.at
  }
}
