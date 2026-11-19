import type { Payload } from 'payload'
import { lapseCutoff } from './contract-lapse'

/**
 * Published magazine place requests whose contract has ended become Expired
 * (19 November 2026). Same day rule as listings (lib/contract-lapse): a
 * contract ending on the 15th is expired from the morning of the 16th. Run by
 * the daily job, POST /booking/retention.
 */
export async function expireEndedPlaces(
  payload: Payload,
  { now = new Date(), dryRun = false }: { now?: Date; dryRun?: boolean } = {},
): Promise<{ expired: number; failed: number }> {
  const { docs } = await payload.find({
    collection: 'place-requests',
    depth: 0,
    limit: 0,
    overrideAccess: true,
    where: {
      and: [
        { status: { equals: 'published' } },
        { contractEndsAt: { less_than: lapseCutoff(now).toISOString() } },
      ],
    },
    select: { status: true },
  })
  if (dryRun) return { expired: docs.length, failed: 0 }
  let expired = 0
  let failed = 0
  for (const doc of docs) {
    try {
      await payload.update({
        collection: 'place-requests',
        id: doc.id,
        data: { status: 'expired' },
        depth: 0,
        overrideAccess: true,
      })
      expired++
    } catch {
      failed++
    }
  }
  return { expired, failed }
}
