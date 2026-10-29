import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Access, FieldAccess } from 'payload'
import { Receipts, copyBookingCustomer, requireReceiptStorage } from './Receipts'
import { Bookings } from './Bookings'

/**
 * Receipts carry card digits and names, so the rules that keep them private are
 * the whole point of the collection: who can read one, and that one is never
 * written to a disk that would lose it.
 */

const staff = { id: 1, collection: 'users', roles: ['staff'] }
const guest = { id: 5, collection: 'customers' }
const partner = { id: 7, collection: 'business-users' }

const read = Receipts.access!.read as Access
const asUser = (user: unknown) => read({ req: { user } } as never)

describe('who can read a receipt', () => {
  it('lets the team read every receipt', () => {
    expect(asUser(staff)).toBe(true)
  })

  it('lets a guest read only the receipts on their own bookings', () => {
    expect(asUser(guest)).toEqual({ customer: { equals: 5 } })
  })

  it('shows a venue and an anonymous visitor nothing', () => {
    expect(asUser(partner)).toBe(false)
    expect(asUser(null)).toBe(false)
  })

  it('keeps the files outside the public folder, and takes no SVG', () => {
    const upload = Receipts.upload as { staticDir: string; mimeTypes: string[] }
    expect(upload.staticDir.startsWith('public')).toBe(false)
    expect(upload.mimeTypes).not.toContain('image/svg+xml')
  })
})

describe('the receipt on a booking', () => {
  const fields = JSON.stringify(Bookings.fields, (_, value) =>
    typeof value === 'function' ? undefined : value,
  )
  const receipt = (() => {
    const walk = (list: unknown[]): unknown => {
      for (const field of list as { name?: string; fields?: unknown[] }[]) {
        if (field.name === 'receipt') return field
        if (field.fields) {
          const found = walk(field.fields)
          if (found) return found
        }
      }
      return null
    }
    return walk(Bookings.fields) as { access: { read: FieldAccess } }
  })()

  it('is on the booking', () => {
    expect(fields).toContain('"receipt"')
  })

  it('is readable by the guest and the team, never the venue', () => {
    const can = (user: unknown) => receipt.access.read({ req: { user } } as never)
    expect(can(staff)).toBe(true)
    expect(can(guest)).toBe(true)
    expect(can(partner)).toBe(false)
  })
})

describe('storage', () => {
  afterEach(() => vi.unstubAllEnvs())

  const create = () => requireReceiptStorage({ operation: 'create', args: {} } as never)

  it('refuses an upload in production with no private bucket set', () => {
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('S3_RECEIPTS_BUCKET', '')
    expect(create).toThrow(/S3_RECEIPTS_BUCKET/)
  })

  it('accepts one once the bucket is set, and always in development', () => {
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('S3_RECEIPTS_BUCKET', 'receipts')
    expect(create).not.toThrow()
    vi.stubEnv('NODE_ENV', 'development')
    vi.stubEnv('S3_RECEIPTS_BUCKET', '')
    expect(create).not.toThrow()
  })
})

describe('whose receipt it is', () => {
  const run = (data: Record<string, unknown>, booking: unknown) =>
    copyBookingCustomer({
      data,
      operation: 'create',
      req: { payload: { findByID: vi.fn(async () => booking) } },
    } as never)

  it('takes the guest from the booking, whatever the request said', async () => {
    const data = await run({ booking: 40, customer: 99 }, { id: 40, customer: 5 })
    expect(data).toMatchObject({ customer: 5 })
  })

  it('refuses a receipt with no booking, or a booking that does not exist', async () => {
    await expect(run({}, null)).rejects.toThrow(/booking/)
    await expect(run({ booking: 41 }, null)).rejects.toThrow(/does not exist/)
  })
})
