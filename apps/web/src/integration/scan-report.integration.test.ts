import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { Payload } from 'payload'
import { listingScanReport, parseRange, scanEventExport } from '../lib/scan-report'
import { setupDatabase, teardownDatabase } from './setup'

/**
 * The scan report, run against real rows.
 *
 * This is raw SQL: three left joins, a `{schema}` placeholder, `count(*) filter`
 * for the direct/shared split and `mode() within group` for the top city. None
 * of its arithmetic had ever been checked. It produces the numbers an advertiser
 * is shown at renewal, so "it returned some rows" is not good enough - the
 * totals have to reconcile against the underlying scan events.
 *
 * The seed generates 220 events from a fixed random seed, so these numbers are
 * reproducible rather than approximate.
 */

let payload: Payload

beforeAll(async () => {
  const ctx = await setupDatabase()
  payload = ctx.payload
}, 300_000)

afterAll(async () => {
  await teardownDatabase()
}, 300_000)

/** The default window: 90 days back, which covers everything the seed makes. */
const fullRange = () => parseRange(new URLSearchParams(), new Date())

describe('listingScanReport', () => {
  it('returns one row per code that was scanned', async () => {
    const rows = await listingScanReport(fullRange())
    expect(rows.length).toBeGreaterThan(0)

    const codes = rows.map((r) => r.code)
    expect(new Set(codes).size, 'a code appears twice').toBe(codes.length)
  })

  it('attributes every row to a business and the print issue', async () => {
    const rows = await listingScanReport(fullRange())

    for (const row of rows) {
      expect(row.business, `${row.code} has no business`).toBeTruthy()
      expect(row.issueNumber, `${row.code} is not attributed to an issue`).toBe(1)
    }
  })

  /**
   * The report is what an advertiser sees; scan-events is the record. If the two
   * ever disagree the report is worthless, and a grouping or join mistake is
   * exactly how they would come to disagree.
   */
  it('totals reconcile with the scan events table', async () => {
    const rows = await listingScanReport(fullRange())
    const reported = rows.reduce((sum, r) => sum + r.scans, 0)

    const actual = await payload.find({ collection: 'scan-events', limit: 0, depth: 0 })
    expect(reported).toBe(actual.totalDocs)
  })

  it('splits direct and shared scans without losing any', async () => {
    const rows = await listingScanReport(fullRange())

    for (const row of rows) {
      expect(row.directScans + row.sharedScans, `${row.code} split does not add up`).toBe(row.scans)
    }
  })

  it('splits platforms without exceeding the total', async () => {
    const rows = await listingScanReport(fullRange())

    for (const row of rows) {
      expect(row.ios + row.android + row.web).toBeLessThanOrEqual(row.scans)
    }
  })

  it('orders by scans, descending', async () => {
    const rows = await listingScanReport(fullRange())
    const counts = rows.map((r) => r.scans)
    expect([...counts].sort((a, b) => b - a)).toEqual(counts)
  })

  it('reports a top city that was actually recorded', async () => {
    const rows = await listingScanReport(fullRange())
    const events = await payload.find({ collection: 'scan-events', limit: 1000, depth: 0 })
    const seen = new Set((events.docs as { city?: string }[]).map((d) => d.city).filter(Boolean))

    for (const row of rows) {
      expect(row.cities).toBeGreaterThan(0)
      expect(seen.has(row.topCity ?? ''), `${row.topCity} was never recorded`).toBe(true)
    }
  })

  it('counts distinct cities no higher than the scans behind them', async () => {
    const rows = await listingScanReport(fullRange())
    for (const row of rows) {
      expect(row.cities).toBeLessThanOrEqual(row.scans)
    }
  })

  it('keeps first and last scan inside the window, and in order', async () => {
    const range = fullRange()
    const rows = await listingScanReport(range)

    for (const row of rows) {
      expect(row.firstScan).toBeTruthy()
      expect(row.lastScan).toBeTruthy()
      expect(row.firstScan!.getTime()).toBeLessThanOrEqual(row.lastScan!.getTime())
      expect(row.firstScan!.getTime()).toBeGreaterThanOrEqual(range.from.getTime())
      expect(row.lastScan!.getTime()).toBeLessThan(range.to.getTime())
    }
  })

  /**
   * The seed skews scans towards recent dates on purpose, so a narrow window has
   * to return fewer than a wide one. If the date bounds were ignored - easy to do
   * wrong in a query built by string substitution - both would return everything.
   */
  it('honours the date window', async () => {
    const now = new Date()
    const wide = await listingScanReport(fullRange())
    const narrow = await listingScanReport({
      from: new Date(now.getTime() - 7 * 86_400_000),
      to: now,
    })

    const wideTotal = wide.reduce((s, r) => s + r.scans, 0)
    const narrowTotal = narrow.reduce((s, r) => s + r.scans, 0)

    expect(narrowTotal).toBeGreaterThan(0)
    expect(narrowTotal).toBeLessThan(wideTotal)
  })

  it('returns nothing for a window before any scan happened', async () => {
    const rows = await listingScanReport({
      from: new Date('2000-01-01'),
      to: new Date('2000-12-31'),
    })

    expect(rows).toHaveLength(0)
  })
})

describe('scanEventExport', () => {
  it('returns the raw log, newest first', async () => {
    const rows = await scanEventExport(fullRange())
    expect(rows.length).toBeGreaterThan(0)

    const times = rows.map((r) => r.scannedAt.getTime())
    expect([...times].sort((a, b) => b - a)).toEqual(times)
  })

  it('carries the business name and placement on every row', async () => {
    const rows = await scanEventExport(fullRange())

    for (const row of rows.slice(0, 50)) {
      expect(row.code).toBeTruthy()
      expect(row.business, `${row.code} has no business name`).toBeTruthy()
      expect(row.placement).toBe('magazine-page')
    }
  })

  /** Unbounded, this is a way to take the database down from a browser tab. */
  it('respects the limit', async () => {
    const rows = await scanEventExport(fullRange(), 10)
    expect(rows).toHaveLength(10)
  })

  it('agrees with the aggregate report on the total', async () => {
    const detail = await scanEventExport(fullRange(), 50_000)
    const summary = await listingScanReport(fullRange())

    expect(detail.length).toBe(summary.reduce((s, r) => s + r.scans, 0))
  })
})
