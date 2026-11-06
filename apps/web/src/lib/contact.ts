/**
 * How to reach Vardenia, in one place.
 *
 * # Why a module and not four literals
 *
 * The contact page, the two pages that sell a listing, and the privacy policy
 * all have to name an address. They are easy to miss when one changes - two are
 * on marketing pages and two are inside a legal document nobody rereads - and
 * the one that would stay wrong longest is the privacy policy, where the address
 * is what a data request is sent to. Setting a field here fills every one of
 * them at once, and clearing it puts the marked gap back everywhere at once.
 *
 * # The rule about publishing one
 *
 * Nothing goes in here until mail sent to it has been received. An address that
 * silently goes nowhere is worse than an honest gap: it costs a lead and it
 * looks like being ignored, and nothing bounces to tell us.
 *
 * `contact@vardenia.com` is meant to be an alias on the Google Workspace
 * mailbox, landing in the same inbox as admin@. On 6 November 2026 the owner
 * said the alias is still to be made, and asked for this address to be
 * published anyway, because it is the one that will last. Until the alias
 * exists, mail to it may not arrive: create it, then send a test message to it.
 *
 * The postal address is the registered address the owner gave on 6 November
 * 2026. The phone is still unset, and every page that would show it leaves the
 * line out rather than inventing one.
 */

export interface ContactDetails {
  /** The public mailbox. Null puts a marked gap on every page that names one. */
  email: string | null
  /** Optional. A published number is a commitment to answer it. */
  phone: string | null
  /** Needed by the privacy policy whether or not it goes on the contact page. */
  postalAddress: string | null
}

export const CONTACT: ContactDetails = {
  email: 'contact@vardenia.com',
  phone: null,
  postalAddress: 'Office 01, Qubic Center, Sin El Fil, Lebanon',
}

/** True once there is any way at all to reach us. */
export const hasContactDetails = (): boolean =>
  Boolean(CONTACT.email || CONTACT.phone || CONTACT.postalAddress)
