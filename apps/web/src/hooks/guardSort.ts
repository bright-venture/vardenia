import { APIError } from 'payload'
import type { CollectionBeforeOperationHook } from 'payload'
import { isStaffUser } from '../access/index'

/**
 * Refuse to sort by a field the caller is not allowed to read.
 *
 * Payload already blocks *filtering* on such a field - `where[internalNotes]`
 * comes back as "The following path cannot be queried" whether or not the value
 * matches, so it is not even a timing oracle. Sorting is not covered by the same
 * check, and that asymmetry is a real disclosure rather than a theoretical one.
 *
 * Found by asking for it. With two listings carrying different contract end
 * dates, an anonymous request to:
 *
 *     /api/businesses?sort=contractEndsAt
 *     /api/businesses?sort=-contractEndsAt
 *
 * returned them in opposite orders, and in neither the alphabetical nor the
 * default order. The value stays hidden; the *ranking* does not. Page through
 * with `limit=1` and you have every listing ordered by when its contract
 * expires - which is exactly the question a competitor would like answered, and
 * precisely why those fields are staff-only in the first place. Correlate the
 * ranking against a business whose dates you already know, such as your own, and
 * the ordering starts to give up approximate values too.
 *
 * # Throwing rather than quietly dropping the sort
 *
 * A silently ignored sort would return results in an order the caller did not
 * ask for and has no way to detect, which is its own small lie. Refusing says
 * what happened, and matches the message Payload already gives for the `where`
 * case - somebody hitting this should not have to work out that sorting is
 * governed by a different rule than filtering.
 *
 * # Why the hook and not the access layer
 *
 * `read: isStaffFieldLevel` on the field is what strips the value, and it works
 * - the value is absent from REST, absent from the rendered pages, and null in
 * GraphQL. It has no say over `sort`, because sorting happens in the database
 * before any document is assembled.
 */

/**
 * Fields whose *order* is as sensitive as their value: every staff-only field
 * of a listing, a group's fields written as the dotted path `?sort=` takes.
 * guardSort.test walks the collection and fails when one is missing.
 */
export const PROTECTED_SORT_FIELDS = [
  'contractStartsAt',
  'contractEndsAt',
  'salesOwner',
  'internalNotes',
  'importBatch',
  // Draft / Published / Rejected / Expired: tells a reader whose contract ended.
  'state',
  'commission.rate',
  'commission.waivedUntil',
  // What an owner typed into the public submission form.
  'submission.status',
  'submission.ownerName',
  'submission.ownerEmail',
  'submission.ownerPhone',
  'submission.ownerPhoneSearch',
  'submission.rejectionReason',
  'submission.rejectionReasonShared',
  'submission.rejectedAt',
  'submission.rejectedBy',
  'submission.history.step',
  'submission.history.at',
  'submission.history.by',
  'submission.submittedAt',
  'submission.reference',
  'submission.acceptedAt',
  'submission.rejectionKind',
  'submission.history.note',
  'submission.payments.type',
  'submission.payments.amount',
  'submission.payments.currency',
  'submission.payments.senderNumber',
  'submission.payments.whishAt',
  'submission.payments.method',
  'submission.payments.note',
  'submission.payments.recordedBy',
  'submission.payments.recordedAt',
  'submission.payments.voided',
  'submission.payments.voidedBy',
  'submission.payments.voidedAt',
  'submission.payments.voidReason',
  'submission.payments.forfeited',
  'submission.payment.stage',
  'submission.payment.price',
  'submission.payment.downpaymentAmount',
  'submission.payment.currency',
  'submission.payment.received',
  'submission.payment.refunded',
  'submission.payment.stillToPay',
  'submission.payment.downpaymentDueAt',
  'submission.payment.balanceDeadlineDays',
  'submission.payment.balanceDueAt',
  'submission.payment.downpaymentReminderSentAt',
  'submission.payment.balanceReminderSentAt',
  'submission.payment.submittedEmailSentAt',
  'submission.payment.downpaymentEmailSentAt',
  'submission.payment.acceptedEmailSentAt',
  'submission.payment.notAcceptedEmailSentAt',
  'submission.payment.unpaidEmailSentAt',
  'submission.payment.lapsedEmailSentAt',
  'submission.payment.publishedEmailSentAt',
  'submission.payment.lapsedListingNumber',
  'submission.terms.version',
  'submission.terms.priceAtAcceptance',
  'submission.terms.currency',
  'submission.terms.termMonths',
  'submission.terms.acceptedAt',
  'submission.terms.layout',
  'submission.terms.issue',
  'submission.terms.page',
  // The layout bought: tells a reader who paid for how much.
  'pageLayout',
  // Which listings are mock ones.
  'isSample',
] as const

/** `sort` arrives as a string, a comma-joined string, or an array of either. */
export function sortFields(sort: unknown): string[] {
  const entries = Array.isArray(sort) ? sort : [sort]

  return entries.flatMap((entry) =>
    typeof entry === 'string'
      ? entry
          .split(',')
          .map((field) => field.trim().replace(/^-/, ''))
          .filter(Boolean)
      : [],
  )
}

/** The first protected field named in a sort, or null. */
export function protectedSortField(sort: unknown): string | null {
  for (const field of sortFields(sort)) {
    if ((PROTECTED_SORT_FIELDS as readonly string[]).includes(field)) return field
  }
  return null
}

export const guardSort: CollectionBeforeOperationHook = ({ args, operation, req }) => {
  if (operation !== 'read' && operation !== 'count') return args

  /**
   * Internal reads pass `overrideAccess: true` and have no user - the seed, the
   * scan report, the booking service. Treating those as anonymous would break
   * them for a rule that exists to protect against the public.
   */
  if (args?.overrideAccess === true) return args
  if (isStaffUser(req?.user)) return args

  const field = protectedSortField((args as { sort?: unknown })?.sort)
  if (!field) return args

  throw new APIError(`The following path cannot be sorted on: ${field}`, 403)
}
