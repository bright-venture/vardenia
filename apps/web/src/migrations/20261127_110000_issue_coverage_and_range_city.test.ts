import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { migrations } from './index'

/**
 * Pins the parts of the migration the database alone guarantees: the lock
 * timeout comes first, and the NULL-city case of the unique index is covered
 * by a partial index (Payload's (issue, governorate, city) index treats NULL
 * cities as distinct).
 */
const source = readFileSync(
  new URL('./20261127_110000_issue_coverage_and_range_city.ts', import.meta.url),
  'utf8',
)
const [up, down] = source.split('export async function down')

describe('migration 20261127_110000_issue_coverage_and_range_city', () => {
  it('is registered right after the "No listings" page type', () => {
    const names = migrations.map((m) => m.name)
    const at = names.indexOf('20261127_110000_issue_coverage_and_range_city')
    expect(names[at - 1]).toBe('20261127_100000_template_no_listings')
  })

  it('sets the lock timeout before any change, both ways', () => {
    for (const part of [up!, down!]) {
      // SQL comments left out: they may name the statements they explain.
      const sqlText = part.slice(part.indexOf('sql`')).replace(/--.*$/gm, '')
      expect(sqlText.indexOf("SET LOCAL lock_timeout = '5s'")).toBeGreaterThan(-1)
      expect(sqlText.indexOf("SET LOCAL lock_timeout = '5s'")).toBeLessThan(
        sqlText.search(/ALTER|CREATE|DROP|DO \$\$/),
      )
    }
  })

  it('replaces the unique index, keeping one governorate-wide block per governorate', () => {
    expect(up).toContain('DROP INDEX IF EXISTS "payload"."issue_governorate_idx"')
    expect(up).toContain(
      'CREATE UNIQUE INDEX IF NOT EXISTS "issue_governorate_city_idx" ON "payload"."listing_ranges" USING btree ("issue_id","governorate","city")',
    )
    expect(up).toMatch(
      /CREATE UNIQUE INDEX IF NOT EXISTS "listing_ranges_governorate_wide_idx" ON "payload"\."listing_ranges" USING btree \("issue_id","governorate"\) WHERE "city" IS NULL/,
    )
  })

  it('reuses the governorate and city types, and adds the columns only once', () => {
    expect(up).toContain(
      'ADD COLUMN IF NOT EXISTS "governorate" "payload"."enum_listing_ranges_governorate"',
    )
    expect(up).toContain('ADD COLUMN IF NOT EXISTS "city" "payload"."enum_businesses_city"')
    expect(up).toContain(
      `ADD COLUMN IF NOT EXISTS "coverage" "payload"."enum_issues_coverage" DEFAULT 'all-lebanon'`,
    )
  })

  it('refuses to roll back while a range has a city, then restores the old index', () => {
    expect(down).toMatch(
      /IF EXISTS \(SELECT 1 FROM "payload"\."listing_ranges" WHERE "city" IS NOT NULL\)/,
    )
    expect(down).toContain('RAISE EXCEPTION')
    expect(down).toContain('CREATE UNIQUE INDEX IF NOT EXISTS "issue_governorate_idx"')
  })
})
