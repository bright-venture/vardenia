import type { UIFieldServerProps } from 'payload'
import type { NumberRange } from '@vardenia/core'
import { isStaffUser } from '../../access/index'
import { allocationSummary } from './listing-allocation'

/**
 * How much of an issue's listing numbering is handed out, on the issue itself.
 *
 * The blocks live in their own list (Listing number ranges); this answers
 * "how many are left, and where does the next block start?" without opening
 * it. A server component, so the ranges are read here with the signed-in
 * user's own access rather than through a browser request. Nothing is stored.
 *
 * Only reachable from the admin panel, which only staff accounts can sign in
 * to (`admin.user` is the staff collection); the check below and reading
 * without overrideAccess keep it staff-only even if it were mounted elsewhere.
 */
export async function ListingAllocation({
  id,
  payload,
  user,
}: UIFieldServerProps & { id?: number | string }) {
  if (id === undefined || id === null) {
    return <p style={styles.muted}>Save the issue first. Its number blocks are counted here.</p>
  }
  if (!isStaffUser(user)) return null

  const [issue, ranges] = await Promise.all([
    payload.findByID({ collection: 'issues', id, depth: 0, user, overrideAccess: false }),
    payload.find({
      collection: 'listing-ranges',
      where: { issue: { equals: id } },
      limit: 0,
      pagination: false,
      depth: 0,
      user,
      overrideAccess: false,
    }),
  ])
  const summary = allocationSummary(ranges.docs as unknown as NumberRange[], issue.listingTotal)

  return <p style={summary.state === 'full' ? styles.full : styles.line}>{summary.text}</p>
}

const styles: Record<string, React.CSSProperties> = {
  line: { margin: 0, fontWeight: 600, color: 'var(--theme-elevation-900)' },
  full: { margin: 0, fontWeight: 600, color: 'var(--theme-success-600)' },
  muted: { margin: 0, fontSize: '0.8125rem', color: 'var(--theme-elevation-600)' },
}

export default ListingAllocation
