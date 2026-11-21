import { describe, expect, it, vi } from 'vitest'
import { RETENTION, applyRetention, daysBefore, monthsBefore } from './retention'
import { privacyPolicy } from './legal'

const NOW = new Date('2028-06-15T12:00:00Z')

describe('dates', () => {
  it('counts calendar months and plain days', () => {
    expect(monthsBefore(NOW, 12).toISOString()).toBe('2027-06-15T12:00:00.000Z')
    expect(daysBefore(NOW, 90).toISOString()).toBe('2028-03-17T12:00:00.000Z')
  })
})

/**
 * Bookings are kept for good as the business record (20 November 2026); what
 * is personal in them goes when the account closes (lib/account-deletion).
 */
describe('bookings are never touched by the job', () => {
  it('reads and writes no booking at all', async () => {
    const touched: string[] = []
    const record = (args: { collection?: string }) => {
      if (args?.collection) touched.push(args.collection)
    }
    const payload = {
      find: vi.fn(async (args: { collection: string }) => (record(args), { docs: [] })),
      count: vi.fn(async (args: { collection: string }) => (record(args), { totalDocs: 0 })),
      delete: vi.fn(async (args: { collection: string }) => record(args)),
      db: {
        deleteMany: vi.fn(async (args: { collection: string }) => record(args)),
        deleteOne: vi.fn(async (args: { collection: string }) => record(args)),
        updateOne: vi.fn(async (args: { collection: string }) => record(args)),
        findOne: vi.fn(async (args: { collection: string }) => record(args)),
      },
      logger: { error: vi.fn() },
    }
    await applyRetention(payload as never, { now: NOW })
    expect(touched).not.toContain('bookings')
    expect(new Set(touched)).toEqual(new Set(['receipts', 'scan-events', 'error-events']))
  })
})

/** The policy promises these numbers; the job must keep the same ones. */
describe('the privacy policy and the job agree', () => {
  const lines = privacyPolicy()
    .sections.flatMap((section) => section.body)
    .join(' ')

  it('names the same periods', () => {
    expect(RETENTION).toEqual({ scanMonths: 12, errorDays: 90, orphanReceiptMonths: 12 })
    expect(lines).toContain('**Records of printed-code scans**: 12 months.')
    expect(lines).toContain('**Error records**: 90 days.')
  })

  it('keeps bookings as anonymous records, with no time limit', () => {
    expect(lines).not.toContain('12 months after the visit')
    expect(lines).toMatch(/\*\*Bookings\*\*: kept as the record of each visit/)
    expect(lines).toContain('the booking stays only as an anonymous record')
  })
})
