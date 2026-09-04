import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { Payload } from 'payload'
import type { Pool } from 'pg'
import { rawDb, DB_SCHEMA } from '../lib/db'
import {
  exportPermanence,
  findDrift,
  restorePermanence,
  serialize,
  type PermanenceFile,
} from '../backup/permanence'
import { setupDatabase, teardownDatabase } from './setup'

/**
 * The restore path, run against real rows.
 *
 * A backup nobody has restored is a belief, not a backup. So this does the whole
 * round trip against a real database: export the permanence layer, break it, put
 * it back from the file, and check every code points where it started.
 *
 * Every destructive test runs inside a transaction that is rolled back, so the
 * shared seed the rest of the suite depends on is left exactly as it was found.
 * That is also why restorePermanence does not open its own transaction: the CLI
 * wraps it and commits, the dry run wraps it and rolls back, and these tests wrap
 * it and roll back - all three the identical code path.
 */

let payload: Payload
let pool: Pool
let baseline: PermanenceFile

beforeAll(async () => {
  const ctx = await setupDatabase()
  payload = ctx.payload
  // The adapter's real pg pool. rawDb exposes it as a minimal query interface;
  // the transaction tests below also need connect(), which the real pool has.
  pool = rawDb(payload).pool as unknown as Pool
  baseline = await exportPermanence({ query: (t, v) => pool.query(t, v) }, DB_SCHEMA)
}, 300_000)

afterAll(async () => {
  await teardownDatabase()
}, 300_000)

/** A code -> its target signature, for comparing two exports without ids. */
function signature(file: PermanenceFile): Map<string, string> {
  return new Map(
    file.codes.map((c) => [
      c.code,
      JSON.stringify([
        c.targetType,
        c.placement,
        c.active,
        c.businessSlug ?? null,
        c.articleSlug ?? null,
        c.issueSlug ?? null,
        c.category ?? null,
        c.externalUrl ?? null,
      ]),
    ]),
  )
}

describe('exportPermanence', () => {
  it('exports every seeded code', () => {
    expect(baseline.codes.length).toBeGreaterThan(0)
    expect(baseline.count).toBe(baseline.codes.length)
  })

  it('finds no drift in a freshly seeded database', () => {
    expect(findDrift(baseline)).toEqual([])
  })

  it('is sorted by code, so the file diffs cleanly', () => {
    const codes = baseline.codes.map((c) => c.code)
    expect([...codes].sort()).toEqual(codes)
  })

  it('serialises identically on a second run', async () => {
    const again = await exportPermanence({ query: (t, v) => pool.query(t, v) }, DB_SCHEMA)
    expect(serialize(again)).toBe(serialize(baseline))
  })

  it('records a target for every code that needs one', () => {
    for (const c of baseline.codes) {
      if (c.targetType === 'business') expect(c.businessSlug, c.code).toBeTruthy()
      if (c.targetType === 'article') expect(c.articleSlug, c.code).toBeTruthy()
    }
  })
})

describe('restorePermanence', () => {
  it('rebuilds every code after the table is emptied', async () => {
    const client = await pool.connect()
    try {
      await client.query('BEGIN')

      // The back-reference is ON DELETE set null, so emptying the codes leaves
      // the businesses pointing at nothing - exactly the post-disaster state.
      await client.query(`delete from "${DB_SCHEMA}"."qr_codes"`)
      const empty = await exportPermanence(client, DB_SCHEMA)
      expect(empty.codes).toHaveLength(0)

      const result = await restorePermanence(client, baseline, DB_SCHEMA)
      expect(result.unresolved).toEqual([])
      expect(result.inserted).toBe(baseline.codes.length)
      expect(result.updated).toBe(0)

      const restored = await exportPermanence(client, DB_SCHEMA)
      expect(signature(restored)).toEqual(signature(baseline))

      // Every business code's back-reference is reattached, so the dashboard and
      // the QR download find the code again.
      const businessCodes = baseline.codes.filter((c) => c.targetType === 'business')
      expect(result.relinked).toBe(businessCodes.length)
      const { rows } = await client.query(
        `select count(*)::int as n
         from "${DB_SCHEMA}"."businesses" b
         join "${DB_SCHEMA}"."qr_codes" q on q.id = b.qr_code_id
         where q.business_id = b.id`,
      )
      expect(rows[0]!.n).toBe(businessCodes.length)

      await client.query('ROLLBACK')
    } finally {
      client.release()
    }
  })

  it('re-points a code that was tampered with, and relinks it', async () => {
    const target = baseline.codes.find((c) => c.targetType === 'business' && c.businessSlug)
    expect(target, 'the seed has at least one business code').toBeTruthy()

    const client = await pool.connect()
    try {
      await client.query('BEGIN')

      // Break the row: deactivate it and cut it loose from its business, the way
      // a bad edit or a partial restore would.
      await client.query(
        `update "${DB_SCHEMA}"."qr_codes" set active = false, business_id = null where code = $1`,
        [target!.code],
      )
      await client.query(
        `update "${DB_SCHEMA}"."businesses" b
         set qr_code_id = null
         from "${DB_SCHEMA}"."qr_codes" q
         where q.code = $1 and b.id is not null and b.slug = $2`,
        [target!.code, target!.businessSlug],
      )

      const result = await restorePermanence(client, baseline, DB_SCHEMA)
      expect(result.unresolved).toEqual([])
      // Nothing was deleted, so this is the update path, not the insert path.
      expect(result.inserted).toBe(0)

      const { rows } = await client.query(
        `select q.active, q.business_id, b.id as expected_business, b.qr_code_id
         from "${DB_SCHEMA}"."qr_codes" q
         join "${DB_SCHEMA}"."businesses" b on b.slug = $2
         where q.code = $1`,
        [target!.code, target!.businessSlug],
      )
      const row = rows[0]!
      expect(row.active).toBe(true)
      expect(row.business_id).toBe(row.expected_business)
      // The business now points back at this exact code row.
      const idRow = await client.query(`select id from "${DB_SCHEMA}"."qr_codes" where code = $1`, [
        target!.code,
      ])
      expect(row.qr_code_id).toBe(idRow.rows[0]!.id)

      await client.query('ROLLBACK')
    } finally {
      client.release()
    }
  })

  it('skips a code whose listing is missing rather than pointing it at nothing', async () => {
    const target = baseline.codes.find((c) => c.targetType === 'business' && c.businessSlug)
    const broken: PermanenceFile = {
      ...baseline,
      codes: [{ ...target!, businessSlug: 'a-slug-no-listing-has' }],
      count: 1,
    }

    const client = await pool.connect()
    try {
      await client.query('BEGIN')
      const result = await restorePermanence(client, broken, DB_SCHEMA)
      expect(result.inserted).toBe(0)
      expect(result.updated).toBe(0)
      expect(result.unresolved).toEqual([
        { code: target!.code, targetType: 'business', slug: 'a-slug-no-listing-has' },
      ])
      await client.query('ROLLBACK')
    } finally {
      client.release()
    }
  })

  it('refuses a file from an incompatible version', async () => {
    const client = await pool.connect()
    try {
      await client.query('BEGIN')
      await expect(
        restorePermanence(client, { ...baseline, version: 999 }, DB_SCHEMA),
      ).rejects.toThrow(/version/)
      await client.query('ROLLBACK')
    } finally {
      client.release()
    }
  })
})
