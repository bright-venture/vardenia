import { headers as nextHeaders } from 'next/headers'
import { getPayload } from 'payload'
import { z } from 'zod'
import config from '../../payload.config'
import { CUSTOMER_COLLECTION } from '../../access/index'
import { savedSlugs } from '../../lib/saved'
import { RATE_LIMIT, withRateLimit } from '../../lib/rate-limit'

/**
 * Save and unsave, for the shortlist.
 *
 * At the app root rather than under `[locale]`, like `/booking` and `/g`: a save
 * is an action, not a page, and it has no locale of its own. The client provider
 * calls it from wherever the reader happens to be.
 *
 * # Signed in is enough, and no more
 *
 * Booking demands a verified email because it can carry money against an
 * identity. A save is a bookmark: it costs nothing, reveals nothing, and reaches
 * no one. So a signed-in customer may save, verified or not, and a signed-out one
 * is turned away with a 401 the client turns into a sign-in link.
 *
 * Every read and write runs with `overrideAccess: false` and the caller's own
 * `user`, so the SavedListings collection filters to their own rows in the
 * database and the listing lookup only ever sees published places.
 */

export const dynamic = 'force-dynamic'

function json(body: unknown, status = 200): Response {
  return Response.json(body, { status })
}

/**
 * The caller's own saved slugs, for the provider to load the page's hearts.
 *
 * Signed out is a 401 rather than an empty list, because the provider tells the
 * two apart: 401 means "offer sign-in on a press", an empty 200 means "signed in
 * with nothing saved yet". Collapsing them would make a signed-out reader look
 * signed in and swallow the sign-in redirect.
 */
export async function GET(): Promise<Response> {
  const payload = await getPayload({ config })
  const auth = await payload
    .auth({ headers: await nextHeaders() })
    .catch(() => ({ user: null }) as { user: null })
  const user = auth.user
  if (!user || user.collection !== CUSTOMER_COLLECTION) {
    return json({ ok: false, code: 'signed-out' }, 401)
  }
  return json({ slugs: await savedSlugs() })
}

/**
 * `saved` is the state the heart should end in. Sending it, rather than
 * "flip", is what makes a repeated request harmless: on a weak connection a
 * press could be sent twice, or a second press arrive before the first had
 * answered, and two flips cancelled each other out with the heart still
 * showing filled. Absent, the request flips as before - a page loaded before
 * this change still works while it is open.
 */
const bodySchema = z.object({ slug: z.string().min(1).max(200), saved: z.boolean().optional() })

/**
 * Rate-limited like every other write: each call is a database read and a
 * write, and without a ceiling a signed-in script could toggle a save forever.
 */
export const POST = withRateLimit(
  async (request: Request): Promise<Response> => {
    const payload = await getPayload({ config })
    const auth = await payload
      .auth({ headers: await nextHeaders() })
      .catch(() => ({ user: null }) as { user: null })
    const user = auth.user
    if (!user || user.collection !== CUSTOMER_COLLECTION) {
      return json({ ok: false, code: 'signed-out' }, 401)
    }

    let parsed: z.infer<typeof bodySchema>
    try {
      parsed = bodySchema.parse(await request.json())
    } catch {
      return json({ ok: false, code: 'bad-request' }, 400)
    }

    // The listing, published only: overrideAccess:false with the customer's user
    // means a draft or withdrawn slug simply is not found.
    const found = await payload.find({
      collection: 'businesses',
      where: { slug: { equals: parsed.slug } },
      limit: 1,
      depth: 0,
      overrideAccess: false,
      user,
      select: { slug: true },
    })
    const listing = found.docs[0]
    if (!listing) return json({ ok: false, code: 'not-found' }, 404)

    // The collection's read access adds `{ customer: equals user.id }`, so this
    // only ever finds the caller's own save for this listing.
    const existing = await payload.find({
      collection: 'saved-listings',
      where: { listing: { equals: listing.id } },
      limit: 1,
      depth: 0,
      overrideAccess: false,
      user,
    })

    const current = existing.docs[0]
    const want = parsed.saved ?? !current

    // Already as asked: nothing to write, and the same answer as last time.
    if (want === Boolean(current)) return json({ ok: true, saved: want })

    let saved: boolean
    if (current) {
      try {
        await payload.delete({
          collection: 'saved-listings',
          id: current.id,
          overrideAccess: false,
          user,
        })
      } catch (err) {
        // Two removals at once: the other one already deleted it, which is the
        // outcome asked for. Anything else is a real failure.
        const again = await payload.find({
          collection: 'saved-listings',
          where: { listing: { equals: listing.id } },
          limit: 1,
          depth: 0,
          overrideAccess: false,
          user,
        })
        if (again.docs[0]) throw err
      }
      saved = false
    } else {
      // `customer` is forced to the caller by the collection's beforeValidate hook
      // regardless; it is named here only because it is a required field and the
      // create type insists on it. The hook is what actually guarantees it.
      try {
        await payload.create({
          collection: 'saved-listings',
          data: { listing: Number(listing.id), customer: Number(user.id) },
          overrideAccess: false,
          user,
        })
      } catch (err) {
        // A near-simultaneous save can win the unique (customer, listing) index and
        // make this insert fail. If the row now exists, that is the outcome the
        // caller wanted, not an error; anything else is a real failure.
        const again = await payload.find({
          collection: 'saved-listings',
          where: { listing: { equals: listing.id } },
          limit: 1,
          depth: 0,
          overrideAccess: false,
          user,
        })
        if (!again.docs[0]) throw err
      }
      saved = true
    }

    return json({ ok: true, saved })
  },
  RATE_LIMIT.WRITE_PER_WINDOW,
  { shared: true },
)
