import { describe, expect, it } from 'vitest'
import type { Payload } from 'payload'
import { DB_SCHEMA, assertDatabaseInternals, rawDb } from './db'

/**
 * These exist because the old inline version could not fail. `db.schemaName ??
 * 'public'` always produced a usable string, so the only way to notice it had
 * produced the wrong one was to notice scan counts had stopped moving.
 *
 * So the interesting assertions here are all negative: given internals that do
 * not match, does this throw rather than carry on.
 */

const pool = { query: async () => ({ rows: [] }) }

// Every table assertDatabaseInternals checks. Add one there, add it here.
const tableNameMap = new Map([
  ['qr_codes', 'qr_codes'],
  ['scan_events', 'scan_events'],
  ['businesses', 'businesses'],
  ['issues', 'issues'],
  ['error_events', 'error_events'],
])

/** Shaped like the real adapter, verified against a live Supabase connection. */
const fakePayload = (db: unknown) => ({ db }) as unknown as Payload

const healthy = () => fakePayload({ pool, schemaName: DB_SCHEMA, tableNameMap })

describe('rawDb', () => {
  it('returns the pool, the schema and a table resolver', () => {
    const db = rawDb(healthy())

    expect(db.pool).toBe(pool)
    expect(db.schema).toBe(DB_SCHEMA)
    expect(db.table('qr_codes')).toBe('qr_codes')
  })

  it('reports the schema from our own constant, never from the adapter', () => {
    // Even when the adapter agrees, the value returned is ours. Nothing the
    // adapter says can end up interpolated into SQL.
    const db = rawDb(healthy())
    expect(db.schema).toBe('payload')
  })

  it('resolves a custom dbName instead of assuming the default', () => {
    const renamed = fakePayload({
      pool,
      schemaName: DB_SCHEMA,
      tableNameMap: new Map([['qr_codes', 'vardenia_qr_codes']]),
    })

    expect(rawDb(renamed).table('qr_codes')).toBe('vardenia_qr_codes')
  })
})

describe('rawDb refuses anything it does not recognise', () => {
  it('throws when there is no pool', () => {
    const db = fakePayload({ schemaName: DB_SCHEMA, tableNameMap })
    expect(() => rawDb(db)).toThrow(/no connection pool/i)
  })

  /**
   * The one this whole module was written for. Previously this case silently
   * produced `public` and the scan counter wrote to the wrong schema.
   */
  it('throws when the adapter stops reporting a schema', () => {
    const db = fakePayload({ pool, tableNameMap })
    expect(() => rawDb(db)).toThrow(/expected schema "payload"/)
  })

  it('throws when the schema is not the one we configured', () => {
    const db = fakePayload({ pool, schemaName: 'public', tableNameMap })
    expect(() => rawDb(db)).toThrow(/but the adapter reports "public"/)
  })

  it('throws when the table map is missing or the wrong type', () => {
    for (const tableNameMap of [undefined, {}, [], 'qr_codes']) {
      const db = fakePayload({ pool, schemaName: DB_SCHEMA, tableNameMap })
      expect(() => rawDb(db)).toThrow(/tableNameMap/)
    }
  })

  it('throws when a table it needs is not registered', () => {
    const db = rawDb(healthy())
    expect(() => db.table('offers')).toThrow(/no table registered under "offers"/)
  })

  it('names Payload as the likely cause, so the message is actionable at 2am', () => {
    const db = fakePayload({ pool, schemaName: 'public', tableNameMap })
    expect(() => rawDb(db)).toThrow(/@payloadcms\/drizzle/)
  })
})

describe('assertDatabaseInternals', () => {
  it('passes on a healthy adapter', () => {
    expect(() => assertDatabaseInternals(healthy())).not.toThrow()
  })

  it('catches a collection whose table has gone missing', () => {
    const partial = fakePayload({
      pool,
      schemaName: DB_SCHEMA,
      tableNameMap: new Map([['qr_codes', 'qr_codes']]),
    })

    expect(() => assertDatabaseInternals(partial)).toThrow(/scan_events/)
  })

  it('refuses to boot when the schema is wrong', () => {
    const db = fakePayload({ pool, schemaName: 'public', tableNameMap })
    expect(() => assertDatabaseInternals(db)).toThrow()
  })
})
