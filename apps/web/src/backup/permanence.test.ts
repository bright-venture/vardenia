import { describe, expect, it } from 'vitest'
import { assertIdentifier } from './permanence'

/**
 * The only names spliced into the backup SQL. Postgres cannot bind an
 * identifier, so this is what stands between a careless caller and injection.
 */
describe('assertIdentifier', () => {
  it('passes the schema and table names the backup uses', () => {
    for (const name of ['payload', 'qr_codes', 'businesses', 'articles', 'issues']) {
      expect(assertIdentifier(name)).toBe(name)
    }
  })

  it('refuses anything that could close the quoted name or start new SQL', () => {
    for (const name of ['payload"; drop table x; --', 'a"b', 'Payload', 'a b', '', '1abc', 'a.b']) {
      expect(() => assertIdentifier(name)).toThrow(/plain SQL identifier/)
    }
  })
})
