import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

/**
 * The core backend migration (20261121_134843_core_backend) installs the
 * seating capacity trigger from seating-capacity-trigger.sql. That file stays
 * the single source: this keeps the migration's copy identical, and checks the
 * hand-written parts the generator would not have produced.
 */
const TRIGGER = readFileSync(new URL('./seating-capacity-trigger.sql', import.meta.url), 'utf8')
const MIGRATION = readFileSync(
  new URL('../migrations/20261121_134843_core_backend.ts', import.meta.url),
  'utf8',
)
const [UP = '', DOWN = ''] = MIGRATION.split('export async function down')

const NEW_TABLES = [
  'businesses_facilities',
  'businesses_popular_facilities',
  'businesses_property_highlights',
  'businesses_stay_packages',
  'businesses_stay_packages_locales',
  'businesses_seating_areas',
  'businesses_seating_areas_locales',
  'brands',
  'brands_locales',
  'bookings_price_lines',
]

describe('the core backend migration', () => {
  it('carries the trigger SQL file verbatim in its up', () => {
    expect(UP).toContain(TRIGGER.replace(/\n+$/, ''))
  })

  it('installs the trigger after the column it names exists', () => {
    expect(UP.indexOf('ADD COLUMN "area"')).toBeGreaterThan(-1)
    expect(UP.indexOf('CREATE TRIGGER enforce_booking_capacity')).toBeGreaterThan(
      UP.indexOf('ADD COLUMN "area"'),
    )
  })

  it('creates every new table and turns row level security on for each', () => {
    for (const table of NEW_TABLES) {
      expect(UP).toContain(`CREATE TABLE "payload"."${table}"`)
      expect(UP).toContain(`ALTER TABLE "payload"."${table}" ENABLE ROW LEVEL SECURITY;`)
    }
  })

  it('adds platinum after gold without recreating the tier enum', () => {
    expect(UP).toContain(
      `ALTER TYPE "payload"."enum_businesses_tier" ADD VALUE IF NOT EXISTS 'platinum' AFTER 'gold';`,
    )
    expect(UP).not.toMatch(/DROP TYPE/)
    expect(UP).not.toMatch(/SET DATA TYPE text/)
  })

  it('drops the old columns instead of renaming them, and adds the new ones', () => {
    expect(UP).not.toMatch(/RENAME COLUMN/)
    expect(UP).toContain('DROP COLUMN "gold_places"')
    expect(UP).toContain('DROP COLUMN "submission_public_phone"')
    expect(UP).toContain('DROP COLUMN "submission_website"')
    expect(UP).toContain('ADD COLUMN "max_gold_per_category" numeric;')
    expect(UP).toContain('ADD COLUMN "max_platinum" numeric;')
    expect(UP).toContain('ADD COLUMN "contact_phone" varchar;')
  })

  it('keeps media and listings when a partner or a brand is deleted', () => {
    expect(UP).toMatch(
      /"media_uploaded_by_id_business_users_id_fk" FOREIGN KEY \("uploaded_by_id"\) REFERENCES "payload"\."business_users"\("id"\) ON DELETE set null/,
    )
    expect(UP).toMatch(
      /"businesses_brand_id_brands_id_fk" FOREIGN KEY \("brand_id"\) REFERENCES "payload"\."brands"\("id"\) ON DELETE set null/,
    )
  })

  it('sets getaways to capacity 1', () => {
    expect(UP).toMatch(/SET "booking_capacity" = 1/)
    expect(UP).toContain(`WHERE "value"::text = 'getaways'`)
  })

  it('rolls back the trigger before dropping bookings.area, and never recreates an enum', () => {
    const oldTrigger = DOWN.indexOf(
      'BEFORE INSERT OR UPDATE OF "start", "end", status, business_id\n',
    )
    expect(oldTrigger).toBeGreaterThan(-1)
    expect(oldTrigger).toBeLessThan(DOWN.indexOf('DROP COLUMN IF EXISTS "area"'))
    expect(DOWN).not.toMatch(/SET DATA TYPE text/)
    expect(DOWN).toContain('DROP CONSTRAINT IF EXISTS "businesses_brand_id_brands_id_fk"')
  })
})
