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
