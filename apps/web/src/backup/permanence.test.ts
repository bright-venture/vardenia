import { describe, expect, it } from 'vitest'
import { assertIdentifier, exportPermanence, type SqlExecutor } from './permanence'

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

/**
 * A shirt's location is in the backup, because on a shirt code it is the only
 * thing that says which shirt it is. It is written only when set, so the entry
 * for every magazine code, and the committed file's diff, stay as they were.
 */
describe('exportPermanence location', () => {
  const row = (code: string, placement: string, location: string | null) => ({
    code,
    target_type: 'home',
    placement,
    active: true,
    category: null,
    external_url: null,
    location,
    business_slug: null,
    article_slug: null,
    issue_slug: null,
  })

  it('keeps a shirt location and leaves magazine codes unchanged', async () => {
    let sql = ''
    const exec: SqlExecutor = {
      query: async (text) => {
        sql = text
        return {
          rows: [
            row('AAAAAAA', 'magazine-page', null),
            row('BBBBBBB', 't-shirt', 'Byblos old souk'),
          ],
        }
      },
    }

    const file = await exportPermanence(exec, 'payload')

    expect(sql).toContain('q.location')
    expect(file.codes[0]).toEqual({
      code: 'AAAAAAA',
      targetType: 'home',
      placement: 'magazine-page',
      active: true,
    })
    expect(file.codes[1]).toEqual({
      code: 'BBBBBBB',
      targetType: 'home',
      placement: 't-shirt',
      active: true,
      location: 'Byblos old souk',
    })
  })
})
