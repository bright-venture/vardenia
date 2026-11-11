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
 * `contact@vardenia.com` is an alias of admin@ on the Google Workspace
 * mailbox, so it lands in the same inbox and needed no DNS change (the domain's
 * mail already goes to Google). It was created on 6 November 2026 and a test
 * message to it was received the same day. Replies go out as contact@ once it
 * is added under Gmail's "Send mail as".
 *
 * The postal address is the registered address the owner gave on 6 November
 * 2026. The phone is the number the owner gave on 11 November 2026 for the
 * homepage's contact block.
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
  phone: '+961 79 338 358',
  postalAddress: 'Office 01, Qubic Center, Sin El Fil, Lebanon',
}

/**
 * Vardenia's commercial registration number, given by the owner on 9 November
 * 2026. Here rather than in lib/legal so the translated legal documents
 * (lib/legal-translations) can name it without importing the English one.
 */
export const COMMERCIAL_REGISTRATION_NUMBER = '1036217'

/** True once there is any way at all to reach us. */
export const hasContactDetails = (): boolean =>
  Boolean(CONTACT.email || CONTACT.phone || CONTACT.postalAddress)
