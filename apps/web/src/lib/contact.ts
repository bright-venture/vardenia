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
 * `contact@vardenia.com` is an alias on the Google Workspace mailbox, so it
 * lands in the same inbox as admin@ and needed no DNS change. Delivery was
 * confirmed before it was set here.
 *
 * The postal address and phone are still unset, and every page that needs them
 * says so rather than inventing one. The privacy policy is the one that most
 * needs the postal address.
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
  postalAddress: null,
}

/** True once there is any way at all to reach us. */
export const hasContactDetails = (): boolean =>
  Boolean(CONTACT.email || CONTACT.phone || CONTACT.postalAddress)
