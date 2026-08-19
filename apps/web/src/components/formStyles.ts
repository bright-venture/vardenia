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
 */

/** Every text input, select and textarea. */
export const INPUT =
  'block w-full rounded-md border border-ink-100 bg-surface-base px-3 py-2.5 text-sm text-ink-900 transition-colors placeholder:text-ink-300 focus:border-ink-300 focus:outline-none focus:ring-2 focus:ring-gold-300 disabled:cursor-not-allowed disabled:bg-surface-sunken disabled:text-ink-500'

/**
 * An input whose value is wrong.
 *
 * Colour is never the only signal - there is always a message below it, tied to
 * the input by `aria-describedby` - because a red border on its own tells a
 * colour-blind reader nothing and a screen reader less than that.
 */
export const INPUT_ERROR =
  'border-state-danger focus:border-state-danger focus:ring-state-danger/30'

export const LABEL = 'block text-xs font-semibold uppercase tracking-wider text-ink-500'

export const HINT = 'mt-1.5 text-xs text-ink-500'

export const ERROR_TEXT = 'mt-1.5 text-xs text-state-danger'

export const PRIMARY_BUTTON =
  'inline-flex items-center justify-center rounded-md bg-ink-900 px-5 py-3 text-sm font-semibold text-surface-base transition-colors hover:bg-ink-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold-500 disabled:cursor-not-allowed disabled:opacity-60'

export const SECONDARY_BUTTON =
  'inline-flex items-center justify-center rounded-md border border-ink-100 px-5 py-3 text-sm font-semibold text-ink-900 transition-colors hover:border-ink-300 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold-500 disabled:cursor-not-allowed disabled:opacity-60'

export const LINK = 'text-gold-700 underline underline-offset-4 hover:text-ink-900'

/** A refusal from the server: fully booked, wrong password, closed at that time. */
export const NOTICE_ERROR =
  'rounded-md border border-state-danger bg-surface-sunken px-4 py-3 text-sm text-state-danger'

export const NOTICE_INFO =
  'rounded-md border border-gold-300 bg-surface-sunken px-4 py-3 text-sm text-ink-700'

export const NOTICE_SUCCESS =
  'rounded-md border border-cedar-500 bg-cedar-100 px-4 py-3 text-sm text-cedar-700'
