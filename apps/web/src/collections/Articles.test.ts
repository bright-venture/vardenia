import { describe, expect, it } from 'vitest'
import { Articles, pageRange } from './Articles'

type Loose = {
  name?: string
  fields?: Loose[]
  validate?: (value: unknown, args: object) => true | string
}
const all = (fields: Loose[]): Loose[] =>
  fields.flatMap((f) => [f, ...(f.fields ? all(f.fields) : [])])
const field = (name: string) =>
  all(Articles.fields as unknown as Loose[]).find((f) => f.name === name)!

describe('articles', () => {
  it('requires a sponsor on a sponsored article, and only there', () => {
    const validate = field('sponsoredBy').validate!
    expect(validate(null, { data: { kind: 'sponsored' } })).not.toBe(true)
    expect(validate(12, { data: { kind: 'sponsored' } })).toBe(true)
    expect(validate(null, { data: { kind: 'feature' } })).toBe(true)
  })

  it('reads a printed page range forwards', () => {
    expect(pageRange(24, { siblingData: { pageFrom: 20 } })).toBe(true)
    expect(pageRange(20, { siblingData: { pageFrom: 20 } })).toBe(true)
    expect(pageRange(12, { siblingData: { pageFrom: 40 } })).not.toBe(true)
    expect(pageRange(null, { siblingData: { pageFrom: 40 } })).toBe(true)
  })

  it('dates an article the first time it is published, and keeps a date already set', () => {
    const hook = Articles.hooks!.beforeChange![0]! as (args: object) => Record<string, unknown>
    const fresh = hook({ data: { _status: 'published' }, originalDoc: {} })
    expect(typeof fresh.publishedAt).toBe('string')
    const kept = hook({
      data: { _status: 'published', publishedAt: '2026-05-01T00:00:00.000Z' },
      originalDoc: {},
    })
    expect(kept.publishedAt).toBe('2026-05-01T00:00:00.000Z')
    const draft = hook({ data: { _status: 'draft' }, originalDoc: {} })
    expect(draft.publishedAt).toBeUndefined()
  })
})
