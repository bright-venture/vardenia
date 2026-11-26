import { describe, expect, it } from 'vitest'
import { Businesses, validHeroImage } from './Businesses'

const options = (data: unknown) =>
  ({
    data,
    relationTo: 'media',
    req: {
      payload: { collections: {}, db: { defaultIDType: 'number' } },
      t: (key: string) => key,
    },
  }) as never

const REQUIRED = 'validation:required'
const check = (value: unknown, status?: string) =>
  validHeroImage(value, options(status === undefined ? {} : { submission: { status } }))

describe('validHeroImage', () => {
  const optional = ['incomplete', 'abandoned', 'rejected']
  const required = ['pending', 'accepted', 'approved', 'lapsed', 'expired']

  it.each(optional)('allows no photo while %s', async (status) => {
    expect(await check(null, status)).toBe(true)
    expect(await check(undefined, status)).toBe(true)
    expect(await check(5, status)).toBe(true)
  })

  it.each(required)('requires a photo when %s, and accepts one', async (status) => {
    expect(await check(null, status)).toBe(REQUIRED)
    expect(await check(undefined, status)).toBe(REQUIRED)
    expect(await check(5, status)).toBe(true)
  })

  it('requires a photo for a listing staff create (no submission)', async () => {
    expect(await check(null)).toBe(REQUIRED)
    expect(await validHeroImage(null, options({ submission: null }))).toBe(REQUIRED)
    expect(await validHeroImage(null, options({}))).toBe(REQUIRED)
    expect(await check(7)).toBe(true)
  })

  it("still runs Payload's own upload validation after the status check", async () => {
    // An id that is not a valid number is refused by Payload's upload validator.
    expect(await check('not-a-number', 'pending')).toMatch(/invalid relationships/)
    // ...but an unfinished form skips it, since no photo is expected.
    expect(await check('not-a-number', 'incomplete')).toBe(true)
  })

  it('is the validator of the heroImage field, which is no longer plain required', () => {
    const find = (fields: unknown[]): Record<string, unknown> | undefined => {
      for (const f of fields as Record<string, unknown>[]) {
        if (f.name === 'heroImage') return f
        const nested = (f.fields ??
          (f.tabs as { fields: unknown[] }[] | undefined)?.flatMap((t) => t.fields)) as
          unknown[] | undefined
        const hit = nested && find(nested)
        if (hit) return hit
      }
    }
    const field = find(Businesses.fields)!
    expect(field.validate).toBe(validHeroImage)
    expect(field.required).toBeUndefined()
  })
})
