import type { Access, CollectionConfig, Where } from 'payload'
import { isStaff, isStaffUser, ownedBusinessIds } from '../access/index'
import { guardClosureWrite } from '../hooks/guardClosureWrite'

/**
 * Days a listing is shut: a holiday, a refurbishment, the fortnight in August
 * when half of Lebanon closes.
 *
 * # Why this is not a field on the listing
 *
 * Because the listing is ours. Vardenia writes what a place is - the name, the
 * photographs, the description - and a business never edits that; it is the
 * whole promise on the home page, and it is what makes a printed QR code safe to
 * put on a table card. Opening `businesses` to owners for one array would mean
 * opening the document and then locking forty other fields by hand, and one
 * missed field is a partner renaming their own listing or changing their tier.
 *
 * A closure is a different kind of fact. It says nothing about what the place
 * is, it cannot end up printed, and it stops being true on a known date. That is
 * a record a partner can own outright, and this is the collection they own.
 *
 * # What it does and does not do
 *
 * It stops new bookings landing in the period - `checkAvailability` refuses them
 * with a reason that says the place is closed rather than the vaguer "not open
 * at that time".
 *
 * It does *not* touch bookings that already exist. A venue closing for a week in
 * March must not have last month's confirmed tables silently cancelled underneath
 * it, with the guests emailed by a background rule nobody pressed. The dashboard
 * counts them and says so; deciding what happens to a guest who has already been
 * promised a table belongs to the person who made the promise.
 *
 * # Dates are Beirut calendar days, stored as text
 *
 * `2026-08-14`, not a timestamp. A closed day is a day in Lebanon, and a `date`
 * field would store an instant that has to be converted back to a Beirut day
 * every time it is read - a conversion that is correct until somebody changes the
 * server timezone or the clocks move. Text of this shape compares with `<=` and
 * `>=` exactly as dates do, and `beirutDate()` already produces it.
 */

const ownedClosures = (user: unknown): Where | false => {
  const owned = ownedBusinessIds(user)
  if (owned.length === 0) return false
  return { business: { in: owned } }
}

/**
 * The same shape for reading, changing and removing: your own listings' closures
 * and nothing else.
 *
 * Expressed as a query constraint rather than a boolean so Payload filters in
 * the database, for the reason the Bookings collection gives at length: a
 * boolean rule still lets a caller read a total count through `/api/closures`
 * and learn how many rows exist behind it.
 *
 * Customers and anonymous callers get nothing. The availability check reads these
 * with access overridden on the server, so nothing public depends on this being
 * open, and a listing's closed dates are the venue's business until we decide to
 * put them on the page.
 */
const ownClosures: Access = ({ req }) => {
  const { user } = req
  if (!user) return false

  if (user.collection === 'users') return isStaff({ req } as Parameters<Access>[0])
  if (user.collection === 'business-users') return ownedClosures(user)

  return false
}

/**
 * Creating is boolean, which is exactly why the guard hook exists.
 *
 * An `Access` function for `create` cannot see the document being created, so
 * "may this owner create a closure" is answerable here and "for which business"
 * is not. Returning true for any business user and stopping there would let one
 * partner close another partner's restaurant for August. `guardClosureWrite`
 * checks the business id against the session on every write.
 */
const createClosures: Access = ({ req }) => {
  const { user } = req
  if (!user) return false
  if (user.collection === 'users') return isStaffUser(user)
  return user.collection === 'business-users' && ownedBusinessIds(user).length > 0
}

export const Closures: CollectionConfig = {
  slug: 'closures',

  admin: {
    useAsTitle: 'startsOn',
    defaultColumns: ['business', 'startsOn', 'endsOn', 'note'],
    group: 'Bookings',
  },

  access: {
    read: ownClosures,
    create: createClosures,
    update: ownClosures,
    /**
     * Owners may delete their own, unlike a booking.
     *
     * A booking is a record of something that happened between two people and is
     * what a dispute is argued from, so it is never removed. A closure is a
     * statement about the future that turns out to be wrong - the refurbishment
     * finished early - and the honest way to withdraw it is to remove it.
     */
    delete: ownClosures,
  },

  hooks: {
    beforeValidate: [guardClosureWrite],
  },

  fields: [
    {
      name: 'business',
      type: 'relationship',
      relationTo: 'businesses',
      required: true,
      index: true,
    },

    /**
     * A Beirut calendar day, inclusive at both ends.
     *
     * Inclusive matters: a venue closing "the 14th to the 16th" means three days
     * shut, and a half-open range would quietly take bookings on the 16th. The
     * shape is validated rather than trusted, because these arrive from an API
     * and a malformed string would compare as `<=` against real dates and close
     * a listing for a period nobody can read.
     */
    {
      name: 'startsOn',
      type: 'text',
      required: true,
      index: true,
      admin: { placeholder: 'YYYY-MM-DD', description: 'First day closed, in Beirut.' },
    },
    {
      name: 'endsOn',
      type: 'text',
      required: true,
      index: true,
      admin: {
        placeholder: 'YYYY-MM-DD',
        description: 'Last day closed, inclusive. The same date for a single day.',
      },
    },

    /**
     * For the venue and for us, never for a guest.
     *
     * It would be easy to forward this into the "we are closed then" message a
     * customer receives, and wrong: it is written as a note to self - "Ziad's
     * wedding", "waiting on the oven part" - not as something addressed to a
     * stranger. The customer-facing sentence is fixed copy in both languages.
     */
    {
      name: 'note',
      type: 'text',
      maxLength: 200,
      admin: { description: 'Why. Not shown to guests.' },
    },
  ],
}
