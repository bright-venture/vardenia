import { describe, expect, it, vi } from 'vitest'
import type { Payload } from 'payload'
import { runImport } from './run'
import { SAMPLE_CSV, SAMPLE_ROWS } from './sample-listings'

/**
 * The writer, against a Payload that records calls instead of making them.
 *
 * # Why a fake rather than the real database
 *
 * Because the questions worth asking here are about what the writer *decides*,
 * and those are invisible in a database after the fact. That a dry run wrote
 * nothing cannot be proved by looking at rows - an empty table is also what a
 * silently failed run leaves behind. Asserting `create` was never called
 * proves it.
 *
 * The real database run is covered separately by the gate that counts rows
 * after an actual import.
 */

const csv = SAMPLE_CSV

interface Call {
  collection: string
  data: Record<string, unknown>
  draft?: boolean
}

interface Recorder {
  payload: Payload
  created: Call[]
  updated: (Call & { id: unknown })[]
  deleted: { collection: string; id: unknown }[]
}

/** `existingSlugs` makes the re-run case testable without two passes. */
function recordingPayload(existingSlugs: string[] = []): Recorder {
  const created: Call[] = []
  const updated: Recorder['updated'] = []
  const deleted: Recorder['deleted'] = []
  const taken = new Set(existingSlugs)

  const payload = {
    find: vi.fn(async ({ collection, where }: { collection: string; where?: never }) => {
      /**
       * The placeholder is answered only for the query the code should be
       * making. It is stored under a randomised name, so a lookup by exact
       * filename finds nothing - which is the bug this shape encodes: a fake
       * that answered `equals` would have kept the broken version passing.
       */
      if (collection === 'media') {
        const filename = (where as unknown as { filename?: Record<string, unknown> })?.filename
        const matches = typeof filename?.like === 'string'
        return matches ? { docs: [{ id: 1 }], totalDocs: 1 } : { docs: [], totalDocs: 0 }
      }

      /**
       * The slug question is asked once per window with an `in`, not once per
       * listing with an `equals`. The fake matches that shape deliberately: a
       * fake that still answered `equals` would keep passing after the real
       * code stopped asking it, and the round trips this change exists to save
       * would quietly come back.
       */
      if (collection === 'businesses') {
        const slugs = (where as unknown as { slug?: { in?: string[] } })?.slug?.in ?? []
        const found = slugs.filter((slug) => taken.has(slug)).map((slug) => ({ id: 99, slug }))
        return { docs: found, totalDocs: found.length }
      }

      // qr-codes, asked by allocateCode whether a freshly generated code is
      // free. Nothing is taken here, so the first attempt always wins.
      return { docs: [], totalDocs: 0 }
    }),
    create: vi.fn(async (args: Call) => {
      created.push(args)
      return { id: created.length }
    }),
    update: vi.fn(async (args: Call & { id: unknown }) => {
      updated.push(args)
      return { id: args.id }
    }),
    delete: vi.fn(async (args: { collection: string; id: unknown }) => {
      deleted.push(args)
      return { id: args.id }
    }),
  } as unknown as Payload

  return { payload, created, updated, deleted }
}

describe('a dry run', () => {
  it('maps everything and writes nothing at all', async () => {
    const { payload, created } = recordingPayload()

    const result = await runImport(payload, {
      csv,
      batch: 'test-batch',
      dryRun: true,
    })

    expect(result.parsed).toBe(SAMPLE_ROWS)
    expect(result.created).toBe(0)
    expect(created).toHaveLength(0)
    expect(payload.create).not.toHaveBeenCalled()
  })

  /** Including the placeholder image, which is a write like any other. */
  it('does not even create the placeholder image', async () => {
    const { payload } = recordingPayload()
    await runImport(payload, { csv, batch: 'test-batch', dryRun: true })

    expect(payload.find).not.toHaveBeenCalled()
  })

  it('still reports the warnings a real run would', async () => {
    const { payload } = recordingPayload()
    const result = await runImport(payload, { csv, batch: 'test-batch', dryRun: true })

    expect(result.warnings.length).toBeGreaterThan(2)
  })
})

describe('a real run', () => {
  it('creates one listing per row', async () => {
    const { payload, created } = recordingPayload()
    const result = await runImport(payload, { csv, batch: 'keserwan-test' })

    const listings = created.filter((call) => call.collection === 'businesses')
    expect(listings).toHaveLength(SAMPLE_ROWS)
    expect(result.created).toBe(SAMPLE_ROWS)
    expect(result.failures).toHaveLength(0)
  })

  /**
   * The single most consequential field. Published, an imported directory
   * becomes hundreds of thin entries under a brand that sells itself on being
   * curated.
   */
  it('makes every one of them a draft', async () => {
    const { payload, created } = recordingPayload()
    await runImport(payload, { csv, batch: 'keserwan-test' })

    for (const call of created.filter((c) => c.collection === 'businesses')) {
      expect(call.data._status, String(call.data.name)).toBe('draft')
      expect(call.draft).toBe(true)
    }
  })

  /** Without this, the batch cannot be found again and cannot be removed. */
  it('stamps the batch on every listing', async () => {
    const { payload, created } = recordingPayload()
    await runImport(payload, { csv, batch: 'keserwan-test' })

    for (const call of created.filter((c) => c.collection === 'businesses')) {
      expect(call.data.importBatch).toBe('keserwan-test')
    }
  })

  /**
   * The rule that keeps an import from dictating the shape of the product: it
   * writes only fields the collection already had. A spreadsheet always carries
   * more than the site models, and the temptation is to add a column for each.
   */
  it('writes no field the collection does not already have', async () => {
    const { payload, created } = recordingPayload()
    await runImport(payload, { csv, batch: 'keserwan-test' })

    const allowed = new Set([
      'name',
      'slug',
      'tagline',
      'heroImage',
      'category',
      'subcategories',
      'governorate',
      'district',
      'address',
      'priceRange',
      'googleRating',
      'ratingCheckedAt',
      'description',
      'tags',
      'seasonality',
      'tier',
      'importBatch',
      'qrCode',
      '_status',
    ])

    for (const call of created.filter((c) => c.collection === 'businesses')) {
      for (const key of Object.keys(call.data)) {
        expect(allowed, `${key} is not a field the site has`).toContain(key)
      }
    }
  })

  /** Contact details are deliberately left in the spreadsheet. */
  it('never writes a phone number or a social handle', async () => {
    const { payload, created } = recordingPayload()
    await runImport(payload, { csv, batch: 'keserwan-test' })

    const serialised = JSON.stringify(created)
    expect(serialised).not.toMatch(/\+961/)
    expect(serialised).not.toContain('contact')
    expect(serialised).not.toContain('@sampleguide')
  })

  it('gives every listing the one shared placeholder image', async () => {
    const { payload, created } = recordingPayload()
    await runImport(payload, { csv, batch: 'keserwan-test' })

    const listings = created.filter((c) => c.collection === 'businesses')
    const images = new Set(listings.map((call) => call.data.heroImage))
    expect(images).toEqual(new Set([1]))
  })

  it('never creates a second placeholder when one already exists', async () => {
    const { payload, created } = recordingPayload()
    await runImport(payload, { csv, batch: 'keserwan-test' })

    expect(created.filter((call) => call.collection === 'media')).toHaveLength(0)
  })

  /**
   * The bug this replaced, stated as the query rather than as the outcome.
   *
   * `placeholderId` asked for `filename equals "import-placeholder.jpg"`, and
   * nothing is ever stored under that name: `unguessableFilename` renames every
   * upload and `formatOptions` converts it to WebP, so the row says
   * `import-placeholder-a3f19c4e2b7d5081cf20b114.webp`. The lookup matched
   * nothing, every listing uploaded its own, and production accumulated 308
   * near-identical gradients with five derived sizes each.
   *
   * Asserted on the query because the outcome is easy to fake and the query is
   * the thing that was wrong.
   */
  it('looks the placeholder up by stem, because the stored name is randomised', async () => {
    const { payload } = recordingPayload()
    await runImport(payload, { csv, batch: 'keserwan-test', limit: 2 })

    const [args] =
      vi
        .mocked(payload.find)
        .mock.calls.find(([a]) => (a as { collection: string }).collection === 'media') ?? []

    const filename = (args as { where?: { filename?: Record<string, unknown> } })?.where?.filename

    expect(filename?.like).toBe('import-placeholder')
    expect(filename?.equals, 'an exact filename can never match a randomised one').toBeUndefined()
  })

  /** One upload for the whole file, even when nothing exists to find. */
  it('uploads the placeholder once for a whole window, not once per listing', async () => {
    const { payload, created } = recordingPayload()

    vi.mocked(payload.find).mockImplementation((async (args: { collection: string }) => {
      // Nothing exists yet: the first window has to create the placeholder.
      if (args.collection === 'media') return { docs: [], totalDocs: 0 }
      if (args.collection === 'businesses') return { docs: [], totalDocs: 0 }
      return { docs: [], totalDocs: 0 }
    }) as never)

    await runImport(payload, { csv, batch: 'keserwan-test', limit: 10 })

    expect(created.filter((call) => call.collection === 'media')).toHaveLength(1)
  })

  /**
   * A run that dies partway through - a dropped connection is enough - has to
   * be restartable without producing a second copy of everything.
   */
  it('skips a listing that is already there rather than duplicating it', async () => {
    const { payload, created } = recordingPayload(['blue-table', 'terrace-nine'])
    const result = await runImport(payload, { csv, batch: 'keserwan-test' })

    expect(result.skippedExisting).toBe(2)
    expect(result.created).toBe(18)
    expect(created.filter((c) => c.collection === 'businesses')).toHaveLength(18)
  })

  it('honours a limit, for a look before the whole file', async () => {
    const { payload } = recordingPayload()
    const result = await runImport(payload, { csv, batch: 'keserwan-test', limit: 5 })

    expect(result.created).toBe(5)
    expect(result.parsed).toBe(SAMPLE_ROWS)
  })

  /**
   * A real file is long enough that dying on the last row and keeping nothing
   * would waste the whole job.
   */
  it('carries on past a row that fails to save, and names it', async () => {
    const { payload } = recordingPayload()
    let listings = 0

    vi.mocked(payload.create).mockImplementation((async (args: { collection: string }) => {
      if (args.collection !== 'businesses') return { id: 1000, collection: args.collection }

      listings += 1
      if (listings === 3) throw new Error('unique constraint')
      return { id: listings, collection: args.collection }
    }) as never)

    const result = await runImport(payload, { csv, batch: 'keserwan-test' })

    expect(result.failures).toHaveLength(1)
    expect(result.failures[0]?.error).toContain('unique constraint')
    expect(result.created).toBe(19)
  })
})

/**
 * The QR code, which is the actual deliverable.
 *
 * # Why the code is minted before the listing
 *
 * `ensureQrCode` mints one in an afterChange hook and then saves the listing a
 * second time to point at it. On a versioned collection with three array fields
 * that second save cost about twenty of the fifty-seven round trips a listing
 * took - measured - and in production every one of those crosses the Atlantic.
 *
 * A listing created with `qrCode` already set never enters the hook, so the
 * expensive save happens once and the cheap link goes on the code instead.
 *
 * That reordering is only safe if both halves really are written, which is what
 * these assert. A listing with no code cannot go to the printer, and a code
 * that does not point back at its listing cannot be found by `removeImport`,
 * which reaches codes through the listing that owns them.
 */
describe('the QR code each listing arrives with', () => {
  it('is minted before the listing, so the listing is written once', async () => {
    const { payload, created } = recordingPayload()
    await runImport(payload, { csv, batch: 'keserwan-test', limit: 3 })

    const order = created.map((call) => call.collection)
    expect(order).toEqual([
      'qr-codes',
      'businesses',
      'qr-codes',
      'businesses',
      'qr-codes',
      'businesses',
    ])
  })

  it('is on the listing at the moment the listing is created', async () => {
    const { payload, created } = recordingPayload()
    await runImport(payload, { csv, batch: 'keserwan-test' })

    for (const call of created.filter((c) => c.collection === 'businesses')) {
      expect(call.data.qrCode, String(call.data.name)).toBeDefined()
    }
  })

  it('points back at its listing', async () => {
    const { payload, created, updated } = recordingPayload()
    await runImport(payload, { csv, batch: 'keserwan-test' })

    const listings = created.filter((c) => c.collection === 'businesses')
    const links = updated.filter((c) => c.collection === 'qr-codes')

    expect(links).toHaveLength(listings.length)
    for (const link of links) {
      expect(link.data.business).toBeDefined()
    }
  })

  /** Nothing about the code should tempt anyone to publish the listing. */
  it('is printable rather than digital, and belongs to a business', async () => {
    const { payload, created } = recordingPayload()
    await runImport(payload, { csv, batch: 'keserwan-test', limit: 2 })

    for (const call of created.filter((c) => c.collection === 'qr-codes')) {
      expect(call.data.targetType).toBe('business')
      expect(call.data.active).toBe(true)
      expect(call.data.code).toMatch(/^[A-Z0-9]{5,10}$/)
    }
  })

  /**
   * The window a half-finished mint leaves open. A code created for a listing
   * that then fails to save points at nothing, and `removeImport` would never
   * find it - so the run takes it back rather than leaving a row nobody can
   * account for.
   */
  it('is deleted again when its listing fails to save', async () => {
    const { payload, deleted } = recordingPayload()
    let listings = 0

    vi.mocked(payload.create).mockImplementation((async (args: { collection: string }) => {
      if (args.collection !== 'businesses') return { id: 500 + listings, collection: 'qr-codes' }

      listings += 1
      if (listings === 2) throw new Error('unique constraint')
      return { id: listings, collection: args.collection }
    }) as never)

    const result = await runImport(payload, { csv, batch: 'keserwan-test', limit: 3 })

    expect(result.failures).toHaveLength(1)
    expect(deleted).toHaveLength(1)
    expect(deleted[0]?.collection).toBe('qr-codes')
  })

  /**
   * The cleanup must not become the error. `payload.delete` throwing before it
   * returns a promise - which is what a missing method does - used to escape
   * the handler and take down the whole window, replacing the row's real error
   * with a confusing one. Found by a fake that had no delete.
   */
  it('reports the listing failure even when the cleanup itself fails', async () => {
    const { payload } = recordingPayload()

    vi.mocked(payload.create).mockImplementation((async (args: { collection: string }) => {
      if (args.collection === 'businesses') throw new Error('unique constraint')
      return { id: 1, collection: args.collection }
    }) as never)

    vi.mocked(payload.delete).mockImplementation((() => {
      throw new Error('delete is not available')
    }) as never)

    const result = await runImport(payload, { csv, batch: 'keserwan-test', limit: 2 })

    expect(result.failures).toHaveLength(2)
    for (const failure of result.failures) {
      expect(failure.error).toContain('unique constraint')
    }
  })

  /**
   * The round trips this whole change exists to save. Asked once for the
   * window, not once for each listing - and `pagination: false` is what stops
   * Payload adding a count query alongside the select.
   */
  it('asks once per window whether the slugs are taken, not once per listing', async () => {
    const { payload } = recordingPayload()
    await runImport(payload, { csv, batch: 'keserwan-test', limit: 10 })

    const slugQueries = vi
      .mocked(payload.find)
      .mock.calls.filter(([args]) => (args as { collection: string }).collection === 'businesses')

    expect(slugQueries).toHaveLength(1)

    const [args] = slugQueries[0] ?? []
    const where = (args as { where?: { slug?: { in?: string[] } } })?.where
    expect(where?.slug?.in).toHaveLength(10)
    expect((args as { pagination?: boolean }).pagination).toBe(false)
  })
})
