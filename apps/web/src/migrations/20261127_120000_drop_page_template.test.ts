import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { migrations } from './index'

/**
 * The A/B/C page design is dropped (27 November 2026): the column and its
 * enum go, the lock timeout comes first, and `down` brings back an empty
 * column of the same type.
 */
const source = readFileSync(
  new URL('./20261127_120000_drop_page_template.ts', import.meta.url),
  'utf8',
)
const [up, down] = source.split('export async function down') as [string, string]
const sqlOf = (part: string) => part.slice(part.indexOf('sql`')).replace(/--.*$/gm, '')

describe('migration 20261127_120000_drop_page_template', () => {
  it('is registered last, after the issue coverage migration', () => {
    const names = migrations.map((m) => m.name)
    expect(names.at(-1)).toBe('20261127_120000_drop_page_template')
    expect(names.at(-2)).toBe('20261127_110000_issue_coverage_and_range_city')
  })

  it('sets the lock timeout before any change, both ways', () => {
    for (const part of [up, down]) {
      const text = sqlOf(part)
      expect(text.indexOf("SET LOCAL lock_timeout = '5s'")).toBeGreaterThan(-1)
      expect(text.indexOf("SET LOCAL lock_timeout = '5s'")).toBeLessThan(
        text.search(/ALTER|CREATE|DROP|DO \$\$/),
      )
    }
  })

  it('drops the column, then its type, and nothing else', () => {
    const text = sqlOf(up)
    const column = text.indexOf('DROP COLUMN IF EXISTS "submission_page_template"')
    const type = text.indexOf(
      'DROP TYPE IF EXISTS "payload"."enum_businesses_submission_page_template"',
    )
    expect(column).toBeGreaterThan(-1)
    expect(type).toBeGreaterThan(column)
    expect(text.match(/DROP /g)).toHaveLength(2)
  })

  it('brings back an empty column of the same type on down', () => {
    const text = sqlOf(down)
    expect(text).toContain("AS ENUM('a', 'b', 'c')")
    expect(text).toContain('ADD COLUMN IF NOT EXISTS "submission_page_template"')
  })
})
