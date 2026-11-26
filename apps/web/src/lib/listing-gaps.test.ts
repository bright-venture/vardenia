import { describe, expect, it } from 'vitest'
import type { Payload } from 'payload'
import { listingGaps } from './listing-gaps'

const doc = (id: number, status?: string) => ({
  id,
  name: `Place ${id}`,
  slug: `place-${id}`,
  _status: 'draft',
  category: 'cafes',
  governorate: 'beirut',
  tier: 'silver',
  heroImage: null,
  submission: status ? { status } : undefined,
})

const payload = (businesses: unknown[]) =>
  ({
    find: async ({ collection }: { collection: string }) => ({
      docs: collection === 'businesses' ? businesses : [],
      hasNextPage: false,
    }),
  }) as unknown as Payload

describe('listingGaps', () => {
  it('leaves incomplete and abandoned submissions off the worklist', async () => {
    const rows = await listingGaps(
      payload([
        doc(1),
        doc(2, 'incomplete'),
        doc(3, 'abandoned'),
        doc(4, 'pending'),
        doc(5, 'approved'),
      ]),
    )
    expect(rows.map((r) => r.slug).sort()).toEqual(['place-1', 'place-4', 'place-5'])
  })
})
