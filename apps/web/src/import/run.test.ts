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

interface Recorder {
  payload: Payload
  created: { collection: string; data: Record<string, unknown>; draft?: boolean }[]
}

/** `existingSlugs` makes the re-run case testable without two passes. */
function recordingPayload(existingSlugs: string[] = []): Recorder {
  const created: Recorder['created'] = []
  const taken = new Set(existingSlugs)

  const payload = {
    find: vi.fn(async ({ collection, where }: { collection: string; where?: never }) => {
      if (collection === 'media') return { docs: [{ id: 1 }], totalDocs: 1 }

      const slug = (where as unknown as { slug?: { equals: string } })?.slug?.equals
      const found = slug && taken.has(slug) ? [{ id: 99 }] : []
      return { docs: found, totalDocs: found.length }
    }),
    create: vi.fn(async (args: { collection: string; data: Record<string, unknown> }) => {
      created.push(args)
      return { id: created.length }
    }),
  } as unknown as Payload

  return { payload, created }
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
    let calls = 0

    vi.mocked(payload.create).mockImplementation((async (args: { collection: string }) => {
      calls += 1
      if (calls === 3) throw new Error('unique constraint')
      return { id: calls, collection: args.collection }
    }) as never)

    const result = await runImport(payload, { csv, batch: 'keserwan-test' })

    expect(result.failures).toHaveLength(1)
    expect(result.failures[0]?.error).toContain('unique constraint')
    expect(result.created).toBe(19)
  })
})
