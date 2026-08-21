import { CONTACT } from './contact'

/**
 * The marker for a fact nobody has settled, and the one way to write one.
 *
 * Lifted out of lib/legal so that the marketing pages and the contact details
 * can use the same marker without importing a legal document, and so that
 * lib/contact can be read by all of them without a cycle.
 *
 * Anything carrying this renders as a bordered block rather than as body text.
 * The point is that an unfinished clause cannot quietly look finished - these
 * documents sit in front of readers for months before anybody signs them off,
 * and a draft set in the same type as the rest reads as settled.
 */

export const PLACEHOLDER = 'TO CONFIRM:'

/** Marks a fact or decision nobody has established yet. */
export const TBD = (what: string) => `${PLACEHOLDER} ${what}`

/**
 * A whole line, never a fragment to drop into a sentence.
 *
 * This is the lesson from the privacy policy, which had a placeholder in the
 * middle of a sentence: the marker is stripped before rendering, so
 * `Write to ${TBD('an address')}` came out as "Write to an address" inside a
 * block headed NOT SETTLED, dragging the settled half of the sentence in with
 * it and leaving text that does not parse.
 *
 * So each of these returns a complete sentence in both states. Where there is a
 * detail it reads as an instruction; where there is not, the whole line is the
 * marked gap and nothing settled is attached to it.
 */

/** How to reach us by email, or a marked note that there is no address yet. */
export const contactEmail = (): string =>
  CONTACT.email
    ? `Write to **${CONTACT.email}**.`
    : TBD('an email address to publish here, so that a reader has a way to reach us')

/** The postal address. The privacy policy needs one whether or not it is shown. */
export const contactPostal = (): string =>
  CONTACT.postalAddress
    ? `By post: ${CONTACT.postalAddress}.`
    : TBD('a postal address, which the privacy policy also has to name')

/** The phone number, when there is one worth committing to answer. */
export const contactPhone = (): string | null =>
  CONTACT.phone ? `By phone: ${CONTACT.phone}.` : null
