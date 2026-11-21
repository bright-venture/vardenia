import { describe, expect, it } from 'vitest'
import { validateTier } from './tier'
import { goldFloorCheck } from '../globals/Settings'
import { validateMaxGold, validateMaxPlatinum } from '../globals/Settings'

type Doc = { id: number; tier: string; category: string }
type Where = Record<string, unknown>

/** Evaluates the subset of Payload's where syntax the validators build. */
function matches(doc: Record<string, unknown>, where: Where): boolean {
  return Object.entries(where).every(([key, cond]) => {
    if (key === 'and') return (cond as Where[]).every((w) => matches(doc, w))
    const c = cond as { equals?: unknown; not_equals?: unknown }
    if ('equals' in c) return doc[key] === c.equals
    if ('not_equals' in c) return doc[key] !== c.not_equals
    throw new Error(`unsupported where on ${key}`)
  })
}

function stub(docs: Doc[], settings: Record<string, unknown> = {}) {
  const payload = {
    findGlobal: async () => settings,
    count: async ({ where }: { where: Where }) => ({
      totalDocs: docs.filter((d) => matches(d, where)).length,
    }),
    find: async ({ where }: { where: Where }) => ({
      docs: docs.filter((d) => matches(d, where)),
    }),
    findByID: async ({ id }: { id: number }) => docs.find((d) => d.id === id) ?? null,
  }
  return { payload } as never
}

const gold = (n: number, category: string, from = 1): Doc[] =>
  Array.from({ length: n }, (_, i) => ({ id: from + i, tier: 'gold', category }))
const platinum = (n: number, from = 100): Doc[] =>
  Array.from({ length: n }, (_, i) => ({ id: from + i, tier: 'platinum', category: 'tourism' }))

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const run = (value: string, docs: Doc[], opts: Record<string, unknown>, settings = {}): any =>
  (validateTier as any)(value, {
    req: stub(docs, settings),
    options: [{ label: 'x', value }],
    ...opts,
  })

describe('validateTier, gold per category', () => {
  const full = gold(6, 'hospitality')

  it('counts only the same category', async () => {
    const docs = [...full, ...gold(6, 'tourism', 20)]
    expect(await run('gold', full, { data: { category: 'tourism' } })).toBe(true)
    expect(await run('gold', docs, { data: { category: 'tourism' } })).not.toBe(true)
  })

  it('refuses a seventh in a full category, naming the limit', async () => {
    const r = await run('gold', full, { data: { category: 'hospitality' } })
    expect(r).toContain('6')
  })

  it('does not count platinum listings of that category', async () => {
    const docs = [
      ...gold(5, 'hospitality'),
      ...platinum(3).map((d) => ({ ...d, category: 'hospitality' })),
    ]
    expect(await run('gold', docs, { data: { category: 'hospitality' } })).toBe(true)
  })

  it('excludes the listing itself from the count', async () => {
    // Listing 1 is one of the six; saved gold again in place, it is not refused.
    expect(
      await run('gold', full, {
        id: 1,
        previousValue: 'silver',
        data: { category: 'hospitality' },
      }),
    ).toBe(true)
    // A listing outside the six is refused.
    expect(
      await run('gold', full, {
        id: 50,
        previousValue: 'silver',
        data: { category: 'hospitality' },
      }),
    ).not.toBe(true)
  })

  it('skips the check when both tier and category are unchanged', async () => {
    const docs = [...full, { id: 50, tier: 'gold', category: 'hospitality' }]
    expect(
      await run('gold', docs, { id: 50, previousValue: 'gold', data: { category: 'hospitality' } }),
    ).toBe(true)
  })

  it('refuses moving an existing gold listing into a full category', async () => {
    const docs = [...full, { id: 50, tier: 'gold', category: 'tourism' }]
    const r = await run('gold', docs, {
      id: 50,
      previousValue: 'gold',
      data: { category: 'hospitality' },
    })
    expect(r).not.toBe(true)
  })

  it('sees the stored category on a partial update that leaves category out', async () => {
    const docs = [...full, { id: 50, tier: 'gold', category: 'hospitality' }]
    expect(await run('gold', docs, { id: 50, previousValue: 'gold', data: {} })).toBe(true)
    // Silver to gold, category from the stored listing, full: refused.
    const silver = [...full, { id: 51, tier: 'silver', category: 'hospitality' }]
    expect(await run('gold', silver, { id: 51, previousValue: 'silver', data: {} })).not.toBe(true)
  })

  it('fails closed when there is no category to count in', async () => {
    const r = await run('gold', full, { data: {} })
    expect(r).not.toBe(true)
    expect(r).toContain('category')
  })

  it('follows the admin setting', async () => {
    const docs = gold(2, 'hospitality')
    expect(
      await run('gold', docs, { data: { category: 'hospitality' } }, { maxGoldPerCategory: 3 }),
    ).toBe(true)
    expect(
      await run('gold', docs, { data: { category: 'hospitality' } }, { maxGoldPerCategory: 2 }),
    ).not.toBe(true)
  })
})

describe('validateTier, platinum overall', () => {
  it('refuses one more at the limit, whatever the category', async () => {
    expect(await run('platinum', platinum(5), { data: { category: 'x' } })).toBe(true)
    expect(await run('platinum', platinum(6), { data: { category: 'x' } })).toContain('6')
  })

  it('does not count gold listings, and excludes the listing itself', async () => {
    expect(await run('platinum', [...gold(9, 'a'), ...platinum(5)], { data: {} })).toBe(true)
    expect(await run('platinum', platinum(6), { id: 100, previousValue: 'silver', data: {} })).toBe(
      true,
    )
  })

  it('keeps an unchanged platinum listing, and follows the setting', async () => {
    expect(
      await run('platinum', platinum(8), { id: 100, previousValue: 'platinum', data: {} }),
    ).toBe(true)
    expect(await run('platinum', platinum(2), { data: {} }, { maxPlatinum: 2 })).not.toBe(true)
  })
})

describe('settings validators refuse lowering below the number sold', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const gv = (v: number, docs: Doc[]): any =>
    (validateMaxGold as any)(v, { req: stub(docs), required: false })
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const pv = (v: number, docs: Doc[]): any =>
    (validateMaxPlatinum as any)(v, { req: stub(docs), required: false })

  it('gold: measured against the fullest category, platinum ignored', async () => {
    const docs = [...gold(4, 'hospitality'), ...gold(2, 'tourism', 20), ...platinum(9)]
    expect(await gv(4, docs)).toBe(true)
    expect(await gv(3, docs)).toContain('hospitality')
  })

  it('platinum: measured against platinum listings only', async () => {
    const docs = [...platinum(4), ...gold(9, 'a')]
    expect(await pv(4, docs)).toBe(true)
    expect(await pv(3, docs)).toContain('4 platinum listings')
  })

  it('exposes the pure floor check too', () => {
    expect(goldFloorCheck(1, { category: 'a', count: 2 })).not.toBe(true)
  })
})
