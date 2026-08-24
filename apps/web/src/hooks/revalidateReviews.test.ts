import { describe, expect, it } from 'vitest'
import {
  revalidateReviewsAfterChange,
  revalidateReviewsAfterDelete,
} from './revalidateReviews'

/**
 * The hook has one job and one hazard.
 *
 * The job: publishing a review refreshes the listing page, instead of the
 * review appearing up to sixty seconds later and reading as broken.
 *
 * The hazard: `next/cache` only exists inside a Next request. These same hooks
 * run from the seed script and from `payload migrate`, where importing it
 * throws. If that throw escapes, seeding the database fails - so the swallow is
 * load bearing, and this pins it.
 */
describe('revalidateReviews', () => {
  const doc = { id: 7, title: 'A review' }

  it('returns the document unchanged after a write', async () => {
    const result = await revalidateReviewsAfterChange({ doc } as never)
    expect(result).toBe(doc)
  })

  it('returns the document unchanged after a delete', async () => {
    const result = await revalidateReviewsAfterDelete({ doc } as never)
    expect(result).toBe(doc)
  })

  /**
   * Run outside a Next request, which is exactly where the seed script and
   * migrations call it. It must not throw.
   */
  it('does not throw when next/cache is unavailable', async () => {
    await expect(revalidateReviewsAfterChange({ doc } as never)).resolves.toBeDefined()
    await expect(revalidateReviewsAfterDelete({ doc } as never)).resolves.toBeDefined()
  })
})
