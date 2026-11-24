import { describe, expect, it } from 'vitest'
import type { FieldAccess } from 'payload'
import { PARTNER_EDITABLE_FIELDS } from '@vardenia/core'
import { Businesses } from './Businesses'
import { PlaceUploadSessions } from './PlaceUploadSessions'
import { Settings } from '../globals/Settings'
import { memoryPayload } from '../lib/__fixtures__/memory-payload'

/**
 * Storage for the Magazine Places form (Task 2): the lifecycle statuses, the
 * staff-only reference / payment / terms fields, and the closed upload-session
 * collection.
 */

type Loose = {
  name?: string
  type?: string
  fields?: Loose[]
  tabs?: { label?: string; fields: Loose[] }[]
  options?: { value: string }[]
  access?: Record<string, FieldAccess>
  unique?: boolean
  defaultValue?: unknown
}

const find = (fields: Loose[], path: string[]): Loose => {
  const [head, ...rest] = path
  for (const f of fields) {
    if (f.name === head) return rest.length ? find(f.fields ?? [], rest) : f
    if (f.tabs) {
      for (const tab of f.tabs) {
        try {
          return find(tab.fields, path)
        } catch {
          /* next tab */
        }
      }
    }
  }
  throw new Error(`no field ${path.join('.')}`)
}

const submission = (...path: string[]) =>
  find(Businesses.fields as unknown as Loose[], ['submission', ...path])

const ctx = (user: unknown) => ({ req: { user } }) as unknown as Parameters<FieldAccess>[0]
const staff = { id: 2, collection: 'users', roles: ['staff'] }
const owner = { id: 20, collection: 'business-users', businesses: [7] }
const customer = { id: 21, collection: 'customers' }

describe('submission status', () => {
  it('accepts the whole lifecycle, with rejected still there', () => {
    const values = submission('status').options!.map((o) => o.value)
    for (const v of [
      'incomplete',
      'abandoned',
      'pending',
      'accepted',
      'lapsed',
      'approved',
      'rejected',
      'expired',
    ]) {
      expect(values, v).toContain(v)
    }
  })
})

const STAFF_ONLY: string[][] = [
  ['status'],
  ['reference'],
  ['acceptedAt'],
  ['paymentDeadline'],
  ['payment'],
  ['payment', 'status'],
  ['payment', 'amount'],
  ['payment', 'currency'],
  ['payment', 'method'],
  ['payment', 'senderNumber'],
  ['payment', 'whishAt'],
  ['payment', 'paidAt'],
  ['payment', 'markedBy'],
  ['terms'],
  ['terms', 'version'],
  ['terms', 'priceAtAcceptance'],
  ['terms', 'currency'],
  ['terms', 'termMonths'],
  ['terms', 'acceptedAt'],
]

describe('reference, payment and terms fields', () => {
  it.each(STAFF_ONLY)(
    '%s: staff read and write it; owners, customers and the public cannot',
    (...path) => {
      const access = submission(...path).access!
      expect(access.read!(ctx(staff))).toBe(true)
      expect(access.update!(ctx(staff))).toBe(true)
      for (const who of [owner, customer, null]) {
        expect(access.read!(ctx(who)), `read as ${JSON.stringify(who)}`).toBe(false)
        expect(access.update!(ctx(who)), `write as ${JSON.stringify(who)}`).toBe(false)
        expect(access.create!(ctx(who)), `create as ${JSON.stringify(who)}`).toBe(false)
      }
    },
  )

  it('is never partner-editable', () => {
    const editable = PARTNER_EDITABLE_FIELDS as readonly string[]
    expect(editable).not.toContain('submission')
    expect(editable).not.toContain('_status')
    for (const f of ['payment', 'terms', 'reference', 'paymentDeadline', 'acceptedAt']) {
      expect(editable, f).not.toContain(f)
    }
  })

  it('has a unique reference, unpaid by default, and the agreed method options', () => {
    expect(submission('reference').unique).toBe(true)
    expect(submission('payment', 'status').defaultValue).toBe('unpaid')
    expect(submission('payment', 'status').options!.map((o) => o.value)).toEqual(['unpaid', 'paid'])
    expect(submission('payment', 'method').options!.map((o) => o.value)).toEqual([
      'whish',
      'cash',
      'desk',
    ])
    expect((submission('payment', 'markedBy') as { relationTo?: string }).relationTo).toBe('users')
  })

  it('writes the sender number in one normalised shape', () => {
    const hooks = (
      submission('payment', 'senderNumber') as unknown as {
        hooks: { beforeValidate: ((a: { value: unknown }) => unknown)[] }
      }
    ).hooks
    const run = (value: unknown) => hooks.beforeValidate[0]!({ value })
    expect(run('+961 3 123 456')).toBe('03123456')
    expect(run('00961 3 123 456')).toBe('03123456')
    expect(run(undefined)).toBeUndefined()
    expect(run('not a number')).toBe('not a number')
  })
})

describe('place-upload-sessions', () => {
  it('has no API access at all, for anybody', async () => {
    const access = PlaceUploadSessions.access as Record<string, (a: never) => unknown>
    for (const action of ['read', 'create', 'update', 'delete']) {
      for (const who of [staff, owner, null]) {
        expect(await access[action]!({ req: { user: who } } as never), action).toBe(false)
      }
    }
    expect(PlaceUploadSessions.admin?.hidden).toBe(true)
  })

  it('stores a hash of the token (unique), never the token', () => {
    const names = (PlaceUploadSessions.fields as Loose[]).map((f) => f.name)
    expect(names).toEqual(
      expect.arrayContaining([
        'tokenHash',
        'business',
        'expiresAt',
        'logoReceived',
        'heroReceived',
        'closedAt',
      ]),
    )
    expect(names).not.toContain('token')
    expect(
      (PlaceUploadSessions.fields as Loose[]).find((f) => f.name === 'tokenHash')!.unique,
    ).toBe(true)
  })
})

describe('Magazine places settings fields', () => {
  it('are in an admin-only group with the agreed defaults', () => {
    const group = find(Settings.fields as unknown as Loose[], ['magazinePlaces'])
    expect(group.access!.read!(ctx(staff))).toBe(false)
    expect(group.access!.update!(ctx(staff))).toBe(false)
    const admin = { id: 1, collection: 'users', roles: ['admin'] }
    expect(group.access!.update!(ctx(admin))).toBe(true)
    const defaults = Object.fromEntries(group.fields!.map((f) => [f.name, f.defaultValue]))
    expect(defaults).toEqual({
      pricePerYear: 20,
      currency: 'USD',
      termMonths: 12,
      paymentDeadlineDays: 7,
      holdMinutes: 30,
      whishNumber: '+96179300350',
      termsVersion: '2026-11',
    })
  })
})

/**
 * Public path: every listing read in lib/listings.ts, lib/brands.ts and
 * lib/home-listings.ts runs with overrideAccess:false, so the collection's
 * read rule (access.publishedStaffOrOwned: `_status = published`) applies, and
 * the count queries restate it as PUBLISHED_SQL. A form submission that is not
 * finished is a draft, so it is never in either.
 */
describe('unfinished submissions are never listed publicly', () => {
  const rows = ['incomplete', 'abandoned', 'accepted', 'lapsed', 'pending'].map((status, i) => ({
    id: i + 1,
    name: status,
    _status: 'draft',
    submission: { status },
  }))
  const db = memoryPayload({
    businesses: [
      ...rows,
      { id: 99, name: 'live', _status: 'published', submission: { status: 'approved' } },
    ],
  })

  it('the public query returns only the published one', async () => {
    const found = await db.find({
      collection: 'businesses',
      overrideAccess: false,
      user: null,
      limit: 100,
    } as never)
    expect((found.docs as { id: number }[]).map((d) => d.id)).toEqual([99])
  })

  it('a form status alone is not what makes a listing public', async () => {
    const found = await db.find({
      collection: 'businesses',
      overrideAccess: false,
      user: null,
      where: { 'submission.status': { in: ['incomplete', 'abandoned', 'accepted', 'lapsed'] } },
    } as never)
    expect(found.docs).toHaveLength(0)
  })
})
