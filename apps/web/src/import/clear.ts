import type { Payload } from 'payload'

/**
 * Removes listings wholesale, and the QR codes that belong to them.
 *
 * # This bypasses a safety rule, so read the rule first
 *
 * `hooks/protectPrintedCodes` refuses to delete a code that has been scanned or
 * assigned to a print issue, because a stranded code points at nothing for as
 * long as the paper is in circulation. That rule is right and this tool does not
 * argue with it - it is for the case the rule cannot cover: emptying a database
 * back to nothing before launch.
 *
 * Three things keep it from being a foot-gun:
 *
 * It never touches a code that is not owned by a listing. The `home` code that
 * points at vardenia.com is printed, is scanned, and survives every call here.
 * That is asserted rather than assumed - see the count returned as `kept`.
 *
 * It requires the caller to name the database, exactly as the import does.
 *
 * It reports what it removed rather than how many, so a run that took more than
 * it should shows up in the output rather than in the directory a week later.
 *
 * # Why the scan events go too
 *
 * A scan event points at a code. Leaving them behind after the code is gone
 * leaves the scan report counting visits to a listing nobody can open, which is
 * worse than an empty report.
 */

export interface ClearResult {
  listings: number
  codes: number
  scanEvents: number
  /** Bookings against a cleared listing. See the note in clearListings. */
  bookings: number
  /** Codes deliberately left alone - the home code and anything unattached. */
  kept: { code: string; targetType: string }[]
  failures: { what: string; error: string }[]
}

export interface ClearOptions {
  /** Only remove listings in this state. Undefined means every listing. */
  status?: 'published' | 'draft'
  dryRun?: boolean
}

const idOf = (value: unknown): string | number | null => {
  if (typeof value === 'string' || typeof value === 'number') return value
  if (value && typeof value === 'object' && 'id' in value) {
    return (value as { id: string | number }).id
  }
  return null
}

export async function clearListings(
  payload: Payload,
  options: ClearOptions = {},
): Promise<ClearResult> {
  const result: ClearResult = {
    listings: 0,
    codes: 0,
    scanEvents: 0,
    bookings: 0,
    kept: [],
    failures: [],
  }

  /**
   * Everything that is not attached to a listing is recorded as kept before
   * anything is deleted, so the report is a statement about the whole database
   * rather than about what happened to survive.
   */
  const orphanCodes = await payload.find({
    collection: 'qr-codes',
    where: { business: { exists: false } },
    limit: 1000,
    depth: 0,
    overrideAccess: true,
  })

  for (const doc of orphanCodes.docs) {
    const code = doc as unknown as { code?: string; targetType?: string }
    result.kept.push({ code: code.code ?? '?', targetType: code.targetType ?? 'unknown' })
  }

  const businesses = await payload.find({
    collection: 'businesses',
    where: options.status ? { _status: { equals: options.status } } : {},
    limit: 2000,
    depth: 0,
    draft: true,
    overrideAccess: true,
  })

  for (const business of businesses.docs) {
    const codes = await payload.find({
      collection: 'qr-codes',
      where: { business: { equals: business.id } },
      limit: 100,
      depth: 0,
      overrideAccess: true,
    })

    if (options.dryRun) {
      result.listings += 1
      result.codes += codes.docs.length

      /**
       * Counted here too, rather than skipped.
       *
       * The first version returned early and reported "scan events: 0" for a run
       * that was about to delete several hundred of them. A dry run whose
       * numbers differ from the real one is worse than no dry run: it is the
       * output somebody reads before authorising the real thing.
       */
      for (const code of codes.docs) {
        const events = await payload.find({
          collection: 'scan-events',
          where: { qrCode: { equals: code.id } },
          limit: 0,
          depth: 0,
          overrideAccess: true,
        })
        result.scanEvents += events.totalDocs
      }

      const booked = await payload.find({
        collection: 'bookings',
        where: { business: { equals: business.id } },
        limit: 0,
        depth: 0,
        overrideAccess: true,
      })
      result.bookings += booked.totalDocs

      continue
    }

    let codesGone = true

    for (const code of codes.docs) {
      /**
       * Scan events first. They reference the code, so removing the code while
       * they exist either fails on the constraint or leaves rows pointing at
       * nothing, depending on how the relationship was declared - and finding
       * out which at delete time is not a thing to leave to chance.
       */
      const events = await payload.find({
        collection: 'scan-events',
        where: { qrCode: { equals: code.id } },
        limit: 500,
        depth: 0,
        overrideAccess: true,
      })

      for (const event of events.docs) {
        try {
          await payload.delete({ collection: 'scan-events', id: event.id, overrideAccess: true })
          result.scanEvents += 1
        } catch (error) {
          result.failures.push({
            what: `scan event ${String(event.id)}`,
            error: error instanceof Error ? error.message : String(error),
          })
        }
      }

      try {
        await payload.delete({
          collection: 'qr-codes',
          id: code.id,
          overrideAccess: true,
          // Read by hooks/protectPrintedCodes. See clearing() there for why this
          // is a different key from the import teardown's.
          context: { clearAllListings: true },
        })
        result.codes += 1
      } catch (error) {
        codesGone = false
        result.failures.push({
          what: `code ${String((code as { code?: string }).code ?? code.id)}`,
          error: error instanceof Error ? error.message : String(error),
        })
      }
    }

    // A listing whose code refused to go is left alone, for the same reason as
    // in the import teardown: deleting it orphans the code permanently.
    if (!codesGone) continue

    /**
     * Bookings, because otherwise the listing can never be deleted at all.
     *
     * `bookings.business_id` is declared ON DELETE SET NULL while the column
     * itself is NOT NULL, so Postgres tries to null it and refuses:
     *
     *     null value in column "business_id" of relation "bookings"
     *     violates not-null constraint
     *
     * The two rules contradict each other, which means a listing that has ever
     * been booked is undeletable by any route. That is a schema bug rather than
     * a decision, and it is recorded in docs/ rather than fixed here - changing
     * a constraint is a migration, and this tool is not the place for one.
     *
     * A booking whose venue no longer exists is not a record worth keeping: it
     * cannot be honoured, displayed or reported on.
     */
    const booked = await payload.find({
      collection: 'bookings',
      where: { business: { equals: business.id } },
      limit: 500,
      depth: 0,
      overrideAccess: true,
    })

    for (const booking of booked.docs) {
      try {
        await payload.delete({ collection: 'bookings', id: booking.id, overrideAccess: true })
        result.bookings += 1
      } catch (error) {
        result.failures.push({
          what: `booking ${String((booking as { reference?: string }).reference ?? booking.id)}`,
          error: error instanceof Error ? error.message : String(error),
        })
      }
    }

    try {
      await payload.delete({
        collection: 'businesses',
        id: business.id,
        overrideAccess: true,
        context: { clearAllListings: true },
      })
      result.listings += 1
    } catch (error) {
      result.failures.push({
        what: `listing ${String(idOf(business.id))}`,
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }

  return result
}
