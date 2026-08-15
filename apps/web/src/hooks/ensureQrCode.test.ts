import { describe, expect, it, vi } from 'vitest'
import type { CollectionAfterChangeHook } from 'payload'
import { ensureQrCode } from './ensureQrCode'

/**
 * The hook that guarantees every listing owns a printable code.
 *
 * Its failure mode is not a crash. It is two codes for one listing, both on the
 * print sheet, with nothing to say which one is already on paper - so these
 * tests are mostly about what it declines to do.
 */

interface Doc {
  id: number
  code?: string
  createdAt?: string
}

function harness({ codesForBusiness = [] as Doc[] }: { codesForBusiness?: Doc[] } = {}) {
  const created: Record<string, unknown>[] = []
  const updated: Record<string, unknown>[] = []

  const payload = {
    find: vi.fn(
      async ({ collection, where }: { collection: string; where?: Record<string, unknown> }) => {
        if (collection !== 'qr-codes') return { docs: [], totalDocs: 0 }

        // "is this generated code already taken" - always no, for these tests.
        if (where?.code) return { docs: [], totalDocs: 0 }

        // "does a code already point at this listing"
        if (where?.business) return { docs: codesForBusiness, totalDocs: codesForBusiness.length }

        return { docs: [], totalDocs: 0 }
      },
    ),
    create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
      const doc = { id: 900 + created.length, ...data }
      created.push(doc)
      return doc
    }),
    update: vi.fn(async (args: Record<string, unknown>) => {
      updated.push(args)
      return {}
    }),
    logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
  }

  const run = (doc: Record<string, unknown>, context: Record<string, unknown> = {}) =>
    (ensureQrCode as CollectionAfterChangeHook)({
      doc,
      req: { payload },
      context,
    } as never)

  return { payload, created, updated, run }
}

describe('ensureQrCode', () => {
  it('mints a code for a listing that has none', async () => {
    const h = harness()
    await h.run({ id: 1 })

    expect(h.created).toHaveLength(1)
    expect(h.created[0]).toMatchObject({ targetType: 'business', business: 1, active: true })
  })

  it('links the new code back to the listing', async () => {
    const h = harness()
    await h.run({ id: 1 })

    expect(h.updated).toHaveLength(1)
    expect(h.updated[0]).toMatchObject({ collection: 'businesses', id: 1 })
  })

  it('does nothing when the listing already points at a code', async () => {
    const h = harness()
    await h.run({ id: 1, qrCode: 42 })

    expect(h.created).toHaveLength(0)
    expect(h.updated).toHaveLength(0)
  })

  it('does not re-enter when its own link-back update fires the hook', async () => {
    const h = harness()
    await h.run({ id: 1 }, { skipQrGeneration: true })

    expect(h.created).toHaveLength(0)
  })

  /**
   * The bug. Minting is create-then-link; if the link fails the code exists and
   * the listing does not know it. Previously the next save minted a second one.
   */
  it('adopts an orphaned code instead of minting a second', async () => {
    const h = harness({ codesForBusiness: [{ id: 77, code: 'AASBVQR' }] })
    await h.run({ id: 1 })

    expect(h.created, 'minted a duplicate code').toHaveLength(0)
    expect(h.updated).toHaveLength(1)
    expect(h.updated[0]).toMatchObject({ id: 1, data: { qrCode: 77 } })
  })

  it('returns the adopted code on the document', async () => {
    const h = harness({ codesForBusiness: [{ id: 77, code: 'AASBVQR' }] })
    const result = (await h.run({ id: 1 })) as { qrCode?: number }

    expect(result.qrCode).toBe(77)
  })

  /**
   * Whichever code is oldest is the one most likely already printed, and paper
   * cannot be corrected. The query asks for it sorted; this checks the hook
   * takes the first rather than the last.
   */
  it('adopts the oldest code when somehow there are several', async () => {
    const h = harness({
      codesForBusiness: [
        { id: 77, code: 'AASBVQR', createdAt: '2026-01-01' },
        { id: 88, code: 'AXGRDH2', createdAt: '2026-06-01' },
      ],
    })
    await h.run({ id: 1 })

    expect(h.updated[0]).toMatchObject({ data: { qrCode: 77 } })
  })

  it('asks the database for the oldest, rather than sorting in memory', async () => {
    const h = harness({ codesForBusiness: [{ id: 77, code: 'AASBVQR' }] })
    await h.run({ id: 1 })

    const lookup = h.payload.find.mock.calls
      .map(([args]) => args as { where?: Record<string, unknown>; sort?: string })
      .find((args) => args.where?.business)

    expect(lookup?.sort).toBe('createdAt')
  })
})
