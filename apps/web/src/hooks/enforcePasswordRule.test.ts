import { describe, expect, it } from 'vitest'
import { ValidationError } from 'payload'
import { enforcePasswordRule } from './enforcePasswordRule'

const run = (data: Record<string, unknown> | undefined) =>
  enforcePasswordRule({ collection: { slug: 'business-users' }, data } as never)

/** The same rule for every account and every path (20 November 2026). */
describe('the password rule on create and update', () => {
  it.each([['abc'], ['abcdefghi'], ['          '], ['   abc    ']])('refuses %j', (password) => {
    expect(() => run({ email: 'a@b.co', password })).toThrow(ValidationError)
  })

  it('accepts 10 real characters', () => {
    const data = { email: 'a@b.co', password: 'Faraya-2026' }
    expect(run(data)).toBe(data)
  })

  it('leaves saves without a password alone', () => {
    expect(run({ name: 'Renamed' })).toEqual({ name: 'Renamed' })
    expect(run({ password: '' })).toEqual({ password: '' })
    expect(run(undefined)).toBeUndefined()
  })

  it('names the field, so the admin shows it under the password', () => {
    try {
      run({ password: 'short' })
    } catch (error) {
      expect(JSON.stringify((error as ValidationError).data)).toContain('"path":"password"')
    }
  })
})
