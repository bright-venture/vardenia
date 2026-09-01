/**
 * Shared class strings for the customer-facing forms.
 *
 * Three forms - booking, sign-up, sign-in - and a fourth coming when password
 * reset does. Repeating twelve Tailwind utilities per input across all of them
 * is how a focus ring ends up on three of the four.
 *
 * Kept as strings rather than wrapper components on purpose. A `<Field>`
 * component would have to grow a prop for every input type, every hint and every
 * error state, and end up harder to read than the markup it replaced. These
 * compose with whatever the call site needs.
 *
 * Only palette colours are used - `ink`, `gold`, `surface`, `state` - never
 * Tailwind's built-in `red-500` and friends. Those exist, because the config
 * extends rather than replaces the default theme, which makes reaching for them
 * easy and wrong: a rebrand edits packages/tokens and would leave every stray
 * default colour behind, in exactly the places that carry the most meaning.
 *
 * Square corners, for the reason set out in ui/Button and enforced by
 * lib/radius.test.ts. Every input and notice here carried a radius until the
 * 2026 design, which draws all of them as plain rectangles.
 *
 * # The primary button is cedar, not ink
 *
 * It was `ink.900`, near-black, while ui/Button's `solid` variant - the same
 * control, reached through the kit instead of through a string - was cedar. So
 * "Create account" and every button rendered by the kit were two different
 * darks a few points apart in lightness and far apart in hue, which is the
 * pairing that reads as a mistake rather than a choice. Cedar is the brand
 * ground; both use it now, as do the header, the active filter chip and the
 * current page in the directory's pagination.
 */

/** Every text input, select and textarea. */
export const INPUT =
  'block w-full border border-ink-100 bg-surface-base px-3 py-2.5 text-sm text-ink-900 transition-colors placeholder:text-ink-300 focus:border-ink-300 focus:outline-none focus:ring-2 focus:ring-gold-300 disabled:cursor-not-allowed disabled:bg-surface-sunken disabled:text-ink-500'

/**
 * An input whose value is wrong.
 *
 * Colour is never the only signal - there is always a message below it, tied to
 * the input by `aria-describedby` - because a red border on its own tells a
 * colour-blind reader nothing and a screen reader less than that.
 */
export const INPUT_ERROR =
  'border-state-danger focus:border-state-danger focus:ring-state-danger/30'

/**
 * An input with an icon sitting inside its leading edge.
 *
 * Used on the sign-in and sign-up cards, where the icon is what makes a stack of
 * identical boxes scannable. Pair it with `FIELD_ICON` on a span inside a
 * `relative` wrapper.
 *
 * `ps-10` rather than `pl-10`: on the Arabic pages the field runs right to left
 * and a left pad would put the gap on the wrong side of the text, under nothing.
 * The reference this is adapted from uses `left-3` and `pl-10` throughout, which
 * is the single most common way a bilingual form breaks.
 */
export const INPUT_ICON = `${'block w-full border border-ink-100 bg-surface-base py-2.5 pe-3 ps-10 text-sm text-ink-900 transition-colors placeholder:text-ink-300 focus:border-ink-300 focus:outline-none focus:ring-2 focus:ring-gold-300 disabled:cursor-not-allowed disabled:bg-surface-sunken disabled:text-ink-500'}`

/** The icon itself. `start-3` is logical, for the same reason as above. */
export const FIELD_ICON =
  'pointer-events-none absolute start-3 top-1/2 -translate-y-1/2 text-ink-500'

export const LABEL = 'block text-xs font-semibold uppercase tracking-wider text-ink-500'

export const HINT = 'mt-1.5 text-xs text-ink-500'

export const ERROR_TEXT = 'mt-1.5 text-xs text-state-danger'

export const PRIMARY_BUTTON =
  'inline-flex items-center justify-center bg-cedar-900 px-5 py-3 text-sm font-semibold text-surface-base transition-colors hover:bg-cedar-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold-500 disabled:cursor-not-allowed disabled:opacity-60'

export const SECONDARY_BUTTON =
  'inline-flex items-center justify-center border border-ink-100 px-5 py-3 text-sm font-semibold text-ink-900 transition-colors hover:border-ink-300 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold-500 disabled:cursor-not-allowed disabled:opacity-60'

export const LINK = 'text-gold-700 underline underline-offset-4 hover:text-ink-900'

/** A refusal from the server: fully booked, wrong password, closed at that time. */
export const NOTICE_ERROR =
  'border border-state-danger bg-surface-sunken px-4 py-3 text-sm text-state-danger'

export const NOTICE_INFO = 'border border-gold-300 bg-surface-sunken px-4 py-3 text-sm text-ink-700'

export const NOTICE_SUCCESS =
  'border border-cedar-500 bg-cedar-100 px-4 py-3 text-sm text-cedar-700'
