/**
 * How to reach Vardenia, in one place.
 *
 * There is no mailbox yet. That is a real gap rather than an oversight: the
 * contact page, the two pages that sell a listing, and the privacy policy all
 * have to name an address, and until one exists every one of them says so.
 *
 * # Why a module and not four placeholders
 *
 * Because the day the mailbox is created, somebody has to remember all four.
 * They are easy to miss - two are on marketing pages and two are inside a legal
 * document that nobody rereads - and the one that would be missed longest is the
 * privacy policy, where the address is what a data request is sent to. Setting
 * `email` below fills every one of them at once.
 *
 * # Why not just publish an address that does not exist yet
 *
 * A business emails it, nothing bounces, and nobody ever replies. That is worse
 * than an honest gap: it costs a lead and it looks like being ignored. A visible
 * "not published yet" at least tells somebody to try another way.
 */

export interface ContactDetails {
  /** The public mailbox. Set this and the whole site stops apologising. */
  email: string | null
  /** Optional. A published number is a commitment to answer it. */
  phone: string | null
  /** Needed by the privacy policy whether or not it goes on the contact page. */
  postalAddress: string | null
}

export const CONTACT: ContactDetails = {
  email: null,
  phone: null,
  postalAddress: null,
}

/** True once there is any way at all to reach us. */
export const hasContactDetails = (): boolean =>
  Boolean(CONTACT.email || CONTACT.phone || CONTACT.postalAddress)
