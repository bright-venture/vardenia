import { describe, expect, it, vi } from 'vitest'
import type { Payload } from 'payload'
import { normalizeCode } from '@vardenia/core'
import { allocateCode } from './allocate-code'

/**
 * Minting a code nothing else is using.
 *
 * The interesting behaviour is all in the unhappy path. A code that collides is
 * two listings behind one printed symbol, and a code that comes back malformed
 * is a symbol that resolves to nothing - both of them permanent once the
 * magazine is out.
 */

/** `taken` is the set of codes the database already holds. */
function fakePayload(taken: string[] = []) {
  const asked: string[] = []

  const payload = {
    find: vi.fn(async ({ where }: { where?: { code?: { equals?: string } } }) => {
      const code = where?.code?.equals ?? ''
      asked.push(code)
      const hit = taken.includes(code)
      return { docs: hit ? [{ code }] : [], totalDocs: hit ? 1 : 0 }
    }),
  } as unknown as Payload

  return { payload, asked }
}

describe('allocateCode', () => {
  it('returns a code', async () => {
    const { payload } = fakePayload()
    expect(await allocateCode(payload)).toBeTruthy()
  })

  /**
   * The code is typed off a printed page by readers who mis-see 0 for O. If what
   * this mints does not survive normalizeCode, the code on the paper and the code
   * in the database are different strings.
   */
  it('mints something the reader-facing parser accepts back', async () => {
    const { payload } = fakePayload()
    const code = (await allocateCode(payload))!
    expect(normalizeCode(code)).toBe(code)
  })

  it('asks the database whether the code is free before handing it over', async () => {
    const { payload, asked } = fakePayload()
    const code = await allocateCode(payload)
    expect(asked).toContain(code)
  })

  it('tries again when the one it generated is taken', async () => {
    // The generator cannot be steered from here, so the collision is staged from
    // the other side: the first two codes it asks about come back taken.
    const { payload, asked } = fakePayload()
    const find = payload.find as unknown as ReturnType<typeof vi.fn>
    let look = 0
    find.mockImplementation(async ({ where }: { where?: { code?: { equals?: string } } }) => {
      asked.push(where?.code?.equals ?? '')
      look += 1
      return look <= 2 ? { docs: [{}], totalDocs: 1 } : { docs: [], totalDocs: 0 }
    })

    const code = await allocateCode(payload)

    expect(asked, 'settled for the first code without checking again').toHaveLength(3)
    expect(code).toBe(asked[2])
    expect([asked[0], asked[1]], 'handed back a code it was told was taken').not.toContain(code)
  })

  /**
   * Null, not a throw, and not a duplicate. The two callers handle it
   * differently on purpose - see the note in allocate-code.ts.
   */
  it('gives up rather than returning a code it knows is taken', async () => {
    const { payload } = fakePayload()
    // Everything is taken.
    ;(payload.find as unknown as ReturnType<typeof vi.fn>).mockImplementation(async () => ({
      docs: [{}],
      totalDocs: 1,
    }))

    expect(await allocateCode(payload)).toBeNull()
  })

  it('gives up after a bounded number of attempts, not forever', async () => {
    const { payload } = fakePayload()
    const find = payload.find as unknown as ReturnType<typeof vi.fn>
    find.mockImplementation(async () => ({ docs: [{}], totalDocs: 1 }))

    await allocateCode(payload)
    expect(find.mock.calls.length).toBeLessThanOrEqual(5)
  })

  it('does not hand the same code to two callers in a row', async () => {
    const { payload } = fakePayload()
    const codes = await Promise.all([
      allocateCode(payload),
      allocateCode(payload),
      allocateCode(payload),
    ])
    expect(new Set(codes).size).toBe(codes.length)
  })
})
