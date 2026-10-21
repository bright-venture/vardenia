import { describe, expect, it } from 'vitest'
import type { Field } from 'payload'
import { QrCodes } from './QrCodes'

/**
 * A listing mints its own code when saved. Two listings were then given a
 * code each by hand and ended up with two apiece, a stray beside the real one
 * on the print sheet.
 */

const field = QrCodes.fields.find((f: Field) => 'name' in f && f.name === 'business') as {
  validate: (value: unknown, options: unknown) => Promise<string | true>
}

const run = (value: unknown, existing: { code: string }[], extra: Record<string, unknown> = {}) => {
  const asked: unknown[] = []
  const options = {
    req: {
      payload: {
        find: async (args: unknown) => {
          asked.push(args)
          return { docs: existing }
        },
      },
    },
    operation: 'create',
    siblingData: { targetType: 'business', placement: 'magazine-page' },
    ...extra,
  }
  return { result: field.validate(value, options), asked }
}

describe('one code per listing and placement', () => {
  it('refuses a second code and names the one that exists', async () => {
    await expect(run(1626, [{ code: '3Y262P3' }]).result).resolves.toMatch(
      /already has code 3Y262P3/,
    )
  })

  it('allows the first code for a listing', async () => {
    await expect(run(1626, []).result).resolves.toBe(true)
  })

  it('looks only at the same placement, and never counts the code being saved', async () => {
    const { result, asked } = run(1626, [], {
      id: 1629,
      operation: 'update',
      previousValue: 5,
      siblingData: { targetType: 'business', placement: 't-shirt' },
    })
    await result
    expect(JSON.stringify(asked[0])).toContain('"t-shirt"')
    expect(JSON.stringify(asked[0])).toContain('"not_equals":1629')
  })

  it('leaves an existing pair editable, so it can be cleaned up', async () => {
    const { result, asked } = run(1626, [{ code: '3Y262P3' }], {
      id: 1629,
      operation: 'update',
      previousValue: 1626,
    })
    await expect(result).resolves.toBe(true)
    expect(asked).toHaveLength(0)
  })

  it('has nothing to say about codes that do not open a listing', async () => {
    const { result } = run(null, [{ code: 'X' }], { siblingData: { targetType: 'home' } })
    await expect(result).resolves.toBe(true)
  })
})
