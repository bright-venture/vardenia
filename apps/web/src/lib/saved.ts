import { cache } from 'react'
import { headers as nextHeaders } from 'next/headers'
import { getPayload, type TypedUser } from 'payload'
import { dataLocale, type Locale } from '@vardenia/i18n'
import config from '../payload.config'
import { CUSTOMER_COLLECTION } from '../access/index'
import type { ListingSummary } from './listings'

/**
 * The read side of the shortlist.
 *
 * Every query runs with `overrideAccess: false` and the customer's own `user`,
 * so the `{ customer: { equals: user.id } }` constraint on the SavedListings
 * collection does the filtering in the database. The customer id is never a
 * `where` clause written here: the constraint has to be the collection's, for the
 * same reason it is on Bookings - one careless refactor here must not become a
 * page that lists everybody's saves.
 */

async function authedCustomer(): Promise<{
  payload: Awaited<ReturnType<typeof getPayload>>
  user: TypedUser | null
}> {
  const payload = await getPayload({ config })
  const auth = await payload
    .auth({ headers: await nextHeaders() })
    .catch(() => ({ user: null }) as { user: null })
  const user = auth.user
  if (!user || user.collection !== CUSTOMER_COLLECTION) return { payload, user: null }
  return { payload, user }
}

/** The listing ids the signed-in customer has saved, newest first. */
async function savedListingIds(limit: number): Promise<(number | string)[]> {
  const { payload, user } = await authedCustomer()
  if (!user) return []

  const rows = await payload.find({
    collection: 'saved-listings',
    depth: 0,
    limit,
    sort: '-createdAt',
    overrideAccess: false,
    user,
    select: { listing: true },
  })

  return rows.docs
    .map((row) => {
      const value = (row as { listing?: unknown }).listing
      if (typeof value === 'number' || typeof value === 'string') return value
      return (value as { id?: number | string } | null)?.id ?? null
    })
    .filter((id): id is number | string => id !== null)
}

/**
 * The slugs of the listings the signed-in customer has saved.
 *
 * This is what the client provider loads once to light up every heart on the
 * page. It resolves ids to slugs through the Businesses collection with access
 * enforced, so a place that has since been withdrawn simply drops out rather than
 * showing a saved heart on a card that no longer exists.
 *
 * `cache()` so the layout that renders the provider and anything else asking in
 * the same request share one round trip.
 */
export const savedSlugs = cache(async (): Promise<string[]> => {
  const ids = await savedListingIds(500)
  if (ids.length === 0) return []

  const payload = await getPayload({ config })
  const listings = await payload.find({
    collection: 'businesses',
    where: { id: { in: ids } },
    limit: ids.length,
    depth: 0,
    overrideAccess: false,
    select: { slug: true },
  })

  return listings.docs
    .map((doc) => (typeof doc.slug === 'string' ? doc.slug : null))
    .filter((slug): slug is string => slug !== null)
})

/**
 * The saved listings themselves, as full cards, newest save first, for the
 * account shortlist page.
 *
 * The ids come from the saves ordered by when they were made; the listings come
 * from one Businesses query, then are put back into save order. A published-only
 * read, so a withdrawn place leaves the shortlist rather than 404ing from it.
 */
export async function savedListingsForCurrent(
  locale: Locale,
  limit = 100,
): Promise<ListingSummary[]> {
  const ids = await savedListingIds(limit)
  if (ids.length === 0) return []

  const payload = await getPayload({ config })
  const listings = await payload.find({
    collection: 'businesses',
    where: { id: { in: ids } },
    locale: dataLocale(locale),
    limit: ids.length,
    depth: 1,
    overrideAccess: false,
  })

  const byId = new Map(listings.docs.map((doc) => [String(doc.id), doc]))
  return ids
    .map((id) => byId.get(String(id)))
    .filter((doc): doc is (typeof listings.docs)[number] => Boolean(doc)) as ListingSummary[]
}
