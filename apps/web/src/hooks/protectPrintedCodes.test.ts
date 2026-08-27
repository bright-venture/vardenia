import { describe, expect, it } from 'vitest'
import { protectBusinessWithPrintedCode, protectPrintedCodes } from './protectPrintedCodes'

/**
 * The guard that stops a code in circulation from being deleted, and the one
 * narrow way past it.
 *
 * # Why the exemption is tested harder than the rule
 *
 * The rule exists because a real code was already stranded once: a listing was
 * deleted and recreated during testing and its code silently changed from
 * MWSW9XS to AASBVQR. After a print run, every copy carrying the old code points
 * at nothing for a year.
 *
 * The exemption exists because a bulk-imported demo directory has to be
 * removable, and somebody on the team will scan one of its codes to show it
 * working - which is exactly what the rule treats as "in circulation".
 *
 * So the exemption is a hole in a safety rule, and the tests below are mostly
 * about proving the hole is the size it is supposed to be: reachable only for a
 * listing that carries the exact batch being torn down, and never for a listing
 * a person created.
 */

interface FakeDocs {
  codes: Record<string, Record<string, unknown>>
  businesses: Record<string, Record<string, unknown>>
}

/** Enough of `req` for these hooks, with no database anywhere near it. */
function fakeReq(docs: FakeDocs) {
  return {
    payload: {
      findByID: async ({ collection, id }: { collection: string; id: string | number }) => {
        const store = collection === 'qr-codes' ? docs.codes : docs.businesses
        const found = store[String(id)]
        if (!found) throw new Error(`no ${collection} ${id}`)
        return found
      },
      find: async ({ where }: { where: { business: { equals: string | number } } }) => {
        const businessId = String(where.business.equals)
        const found = Object.values(docs.codes).filter(
          (code) => String(code.business) === businessId,
        )
        return { docs: found }
      },
    },
  } as never
}

const call = (
  hook: typeof protectPrintedCodes,
  id: string,
  docs: FakeDocs,
  context: Record<string, unknown> = {},
) => hook({ id, req: fakeReq(docs), context, collection: {} as never } as never)

describe('a code that is not in circulation', () => {
  it('deletes freely when it has never been scanned and is on no issue', async () => {
    const docs: FakeDocs = {
      codes: { '1': { id: 1, code: 'AAA1111', scanCount: 0, business: 10 } },
      businesses: { '10': { id: 10 } },
    }

    await expect(call(protectPrintedCodes, '1', docs)).resolves.toBeUndefined()
  })
})

describe('a code that is in circulation', () => {
  const scanned: FakeDocs = {
    codes: { '1': { id: 1, code: 'AAA1111', scanCount: 3, business: 10 } },
    businesses: { '10': { id: 10, name: 'A real listing' } },
  }

  const onIssue: FakeDocs = {
    codes: { '2': { id: 2, code: 'BBB2222', scanCount: 0, issue: 7, business: 11 } },
    businesses: { '11': { id: 11 } },
  }

  it('refuses deletion when it has been scanned', async () => {
    await expect(call(protectPrintedCodes, '1', scanned)).rejects.toThrow(/scanned 3 times/)
  })

  it('refuses deletion when it is assigned to an issue', async () => {
    await expect(call(protectPrintedCodes, '2', onIssue)).rejects.toThrow(/print issue/)
  })

  it('says what to do instead rather than only refusing', async () => {
    await expect(call(protectPrintedCodes, '1', scanned)).rejects.toThrow(/Uncheck "active"/)
  })
})

/**
 * The important half. Each of these describes a way somebody could try to get a
 * protected code deleted, and every one of them has to fail.
 */
describe('the teardown exemption', () => {
  const imported: FakeDocs = {
    codes: { '1': { id: 1, code: 'AAA1111', scanCount: 5, business: 10 } },
    businesses: { '10': { id: 10, name: 'Imported demo', importBatch: 'keserwan-2026-08' } },
  }

  const real: FakeDocs = {
    codes: { '2': { id: 2, code: 'BBB2222', scanCount: 5, business: 11 } },
    businesses: { '11': { id: 11, name: 'A paying customer' } },
  }

  it('lets a scanned code go when its listing carries that batch', async () => {
    await expect(
      call(protectPrintedCodes, '1', imported, { importTeardown: 'keserwan-2026-08' }),
    ).resolves.toBeUndefined()
  })

  /**
   * The one that would matter if it ever broke. A caller claiming a teardown
   * gets nothing unless the listing itself agrees, so a real listing is
   * unreachable however the call is dressed up.
   */
  it('refuses a real listing even when the caller claims a teardown', async () => {
    await expect(
      call(protectPrintedCodes, '2', real, { importTeardown: 'keserwan-2026-08' }),
    ).rejects.toThrow(/cannot be deleted/)
  })

  it('refuses when the batch named is not the batch the listing carries', async () => {
    await expect(
      call(protectPrintedCodes, '1', imported, { importTeardown: 'some-other-batch' }),
    ).rejects.toThrow(/cannot be deleted/)
  })

  it('refuses an empty batch, which would otherwise match a listing with none', async () => {
    await expect(call(protectPrintedCodes, '2', real, { importTeardown: '' })).rejects.toThrow(
      /cannot be deleted/,
    )
  })

  it('refuses a batch that is not a string', async () => {
    for (const value of [true, 1, {}, ['keserwan-2026-08']]) {
      await expect(
        call(protectPrintedCodes, '1', imported, { importTeardown: value }),
      ).rejects.toThrow(/cannot be deleted/)
    }
  })

  /** A listing that has gone missing is not a licence to delete its code. */
  it('refuses when the listing cannot be read at all', async () => {
    const orphan: FakeDocs = {
      codes: { '3': { id: 3, code: 'CCC3333', scanCount: 2, business: 999 } },
      businesses: {},
    }

    await expect(
      call(protectPrintedCodes, '3', orphan, { importTeardown: 'keserwan-2026-08' }),
    ).rejects.toThrow(/cannot be deleted/)
  })
})

describe('deleting the business itself', () => {
  const imported: FakeDocs = {
    codes: { '1': { id: 1, code: 'AAA1111', scanCount: 5, business: 10 } },
    businesses: { '10': { id: 10, name: 'Imported demo', importBatch: 'keserwan-2026-08' } },
  }

  const real: FakeDocs = {
    codes: { '2': { id: 2, code: 'BBB2222', scanCount: 5, business: 11 } },
    businesses: { '11': { id: 11, name: 'A paying customer' } },
  }

  it('refuses when the listing owns a code in circulation', async () => {
    await expect(call(protectBusinessWithPrintedCode, '11', real)).rejects.toThrow(/BBB2222/)
  })

  it('names the code and the reason, not just a refusal', async () => {
    await expect(call(protectBusinessWithPrintedCode, '11', real)).rejects.toThrow(
      /scanned 5 times/,
    )
  })

  it('allows it during a teardown of its own batch', async () => {
    await expect(
      call(protectBusinessWithPrintedCode, '10', imported, { importTeardown: 'keserwan-2026-08' }),
    ).resolves.toBeUndefined()
  })

  it('still refuses a real listing during a teardown', async () => {
    await expect(
      call(protectBusinessWithPrintedCode, '11', real, { importTeardown: 'keserwan-2026-08' }),
    ).rejects.toThrow(/already in circulation/)
  })

  it('allows a listing whose codes are all uncommitted, with no exemption needed', async () => {
    const fresh: FakeDocs = {
      codes: { '4': { id: 4, code: 'DDD4444', scanCount: 0, business: 12 } },
      businesses: { '12': { id: 12 } },
    }

    await expect(call(protectBusinessWithPrintedCode, '12', fresh)).resolves.toBeUndefined()
  })
})

/**
 * The second exemption, for emptying a database before launch.
 *
 * Broader than the batch teardown by design, and therefore shaped so it cannot
 * reach the one code that must never go: the printed `home` code pointing at
 * vardenia.com, which belongs to no listing.
 */
describe('clearing every listing', () => {
  const attached: FakeDocs = {
    codes: { '1': { id: 1, code: 'AAA1111', scanCount: 40, issue: 3, business: 10 } },
    businesses: { '10': { id: 10, name: 'A listing being cleared' } },
  }

  /** The home code. No business, and it is the one that is really printed. */
  const home: FakeDocs = {
    codes: { '9': { id: 9, code: 'CFHH5WH', scanCount: 12, business: undefined } },
    businesses: {},
  }

  it('lets a scanned code attached to a listing go', async () => {
    await expect(
      call(protectPrintedCodes, '1', attached, { clearAllListings: true }),
    ).resolves.toBeUndefined()
  })

  it('lets a listing go even with a code on a print issue', async () => {
    await expect(
      call(protectBusinessWithPrintedCode, '10', attached, { clearAllListings: true }),
    ).resolves.toBeUndefined()
  })

  /**
   * The one that would lose the printed code on the back cover. "Remove every
   * listing" and "remove the code pointing at vardenia.com" are different
   * requests, and only the first has ever been made.
   */
  it('refuses the home code, which belongs to no listing', async () => {
    await expect(call(protectPrintedCodes, '9', home, { clearAllListings: true })).rejects.toThrow(
      /cannot be deleted/,
    )
  })

  it('refuses anything short of the flag being exactly true', async () => {
    for (const value of ['true', 1, {}, 'yes']) {
      await expect(
        call(protectPrintedCodes, '1', attached, { clearAllListings: value }),
      ).rejects.toThrow(/cannot be deleted/)
    }
  })

  it('changes nothing when the flag is absent', async () => {
    await expect(call(protectPrintedCodes, '1', attached)).rejects.toThrow(/cannot be deleted/)
  })
})
