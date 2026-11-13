/**
 * Features the owner has hidden for now (12 November 2026). Like
 * lib/location-display, only what a reader sees is switched off: the data, the
 * routes and the code behind each one stay, so setting a value back to true
 * brings the feature back as it was.
 */

/**
 * Guest reviews on a listing page: the count and score under its name, the
 * "What guests say" quotes, and the Guest reviews section with its form; and
 * the "Write a review" link on a finished booking in the account.
 */
export const SHOW_REVIEWS = false

/**
 * Saving places: the Save button on a listing page and the heart on each
 * listing card, and the Saved places links in the header, the phone menu and
 * the account. /account/saved itself still answers, unlinked.
 */
export const SHOW_SAVING = false

/**
 * The "When are you coming?" box above a section's or the directory's results
 * (When is the big day?, When are you staying?...): a date, a time and a party
 * size, then which places are free. Hidden since 13 November 2026. With it off
 * nothing can set those dates, so every card shows as it does without them.
 */
export const SHOW_TRIP_SEARCH = false
