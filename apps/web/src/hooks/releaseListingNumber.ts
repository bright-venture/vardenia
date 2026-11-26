import type { CollectionBeforeChangeHook } from 'payload'

/** Rejected, and the two ways a form submission ends without payment (abandoned: hold ran out; lapsed: not paid in time). */
const FREES_NUMBER = new Set(['rejected', 'abandoned', 'lapsed'])

/**
 * Gives a listing's magazine number back when the listing will not use it.
 *
 * A rejected, abandoned or lapsed submission stays in the admin as a draft record, and a trashed
 * listing stays in the table; either would keep its number for ever and leave
 * a hole in the governorate's range. Clearing the number makes it free for the
 * next business. The unique index on (issue, listingNumber) ignores nulls, so
 * any number of released listings can sit in the table.
 *
 * # In the same write, not a second one
 *
 * An earlier version updated the listing again from afterChange. That cannot
 * work: a nested write that fails kills the whole transaction, and for a trashed
 * listing it always fails, because updateByID hides trashed documents unless
 * told otherwise. The trash then rolled back silently. Setting the field on the
 * data being saved has no second write to fail.
 *
 * Trashing reaches this hook as an update whose data carries `deletedAt` (the
 * admin's Delete sends exactly that); restoring sends `deletedAt: null`, and
 * the listing simply comes back without a number.
 */
export const releaseListingNumber: CollectionBeforeChangeHook = ({ data, originalDoc }) => {
  const status = (data?.submission?.status ?? originalDoc?.submission?.status) as string | undefined
  // A sample (mock) listing never holds a magazine number.
  const sample = (data?.isSample ?? originalDoc?.isSample) === true
  if (FREES_NUMBER.has(status ?? '') || data?.deletedAt || sample)
    return { ...data, listingNumber: null }
  return data
}
