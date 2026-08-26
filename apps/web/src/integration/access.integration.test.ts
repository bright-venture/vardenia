import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { Payload } from 'payload'
import {
  PRIVATE_BUSINESS_FIELDS,
  restGet,
  restPost,
  setupDatabase,
  staffToken,
  teardownDatabase,
} from './setup'

/**
 * The question the unit tests could not answer.
 *
 * access/index.test.ts proves the helpers return the right answer.
 * collections/access-policy.test.ts proves each collection wires the right
 * helper into the right slot. Neither proves that Payload, having been
 * configured correctly, actually withholds the field when a stranger asks - and
 * that is the only claim that matters, because it is the one an advertiser's
 * contract value rests on.
 *
 * These run the real REST handler against a real Postgres with the real seed
 * data in it. If a Payload upgrade changed how field-level read access is
 * applied, every unit test would still pass and these would not.
 */

let payload: Payload
let token: string

beforeAll(async () => {
  const ctx = await setupDatabase()
  payload = ctx.payload
  token = await staffToken(payload)
}, 300_000)

afterAll(async () => {
  await teardownDatabase()
}, 300_000)

const auth = () => ({ Authorization: `JWT ${token}` })

interface Listing {
  slug?: string
  [key: string]: unknown
}

const docsOf = (body: Record<string, unknown>) => (body.docs ?? []) as Listing[]

describe('anonymous reads of /api/businesses', () => {
  it('returns the published listings', async () => {
    const { status, body } = await restGet('/api/businesses?limit=100')

    expect(status).toBe(200)
    const slugs = docsOf(body).map((d) => d.slug)
    expect(slugs).toContain('hotel-albergo')
    expect(slugs).toContain('chateau-ksara')
  })

  /**
   * The one this file exists for.
   *
   * These four fields carry field-level `read: isStaffFieldLevel`. The tab they
   * sit in also has an `admin.condition`, which hides them in the admin UI and
   * does nothing whatsoever to the API. If those field rules were ever deleted
   * on the assumption the condition was doing the work, this is what catches it.
   */
  it.each(PRIVATE_BUSINESS_FIELDS)('never includes %s', async (field) => {
    const { body } = await restGet('/api/businesses?limit=100')
    const listings = docsOf(body)

    expect(listings.length).toBeGreaterThan(0)
    for (const listing of listings) {
      expect(listing, `${listing.slug} leaked ${field}`).not.toHaveProperty(field)
    }
  })

  it('does not leak a contract value anywhere in the response text', async () => {
    // A field can be absent from the parsed docs and still be present somewhere
    // in the payload, for instance inside a populated relationship.
    const { body } = await restGet('/api/businesses?limit=100&depth=2')
    const raw = JSON.stringify(body)

    expect(raw).not.toContain('internalNotes')
    expect(raw).not.toContain('Renewal handled by the GM')
    expect(raw).not.toContain('Contract lapses in September')
  })

  it('still exposes tier and verified, which the site renders', async () => {
    const { body } = await restGet('/api/businesses?limit=100')
    const albergo = docsOf(body).find((d) => d.slug === 'hotel-albergo')

    expect(albergo?.tier).toBe('partner')
    expect(albergo?.verified).toBe(true)
  })

  it('hides the draft listing entirely', async () => {
    const { body } = await restGet('/api/businesses?limit=100')

    expect(docsOf(body).map((d) => d.slug)).not.toContain('beit-douma')
    // The constraint has to filter in the database rather than after paging, or
    // the total quietly tells you how much is hidden.
    expect(JSON.stringify(body)).not.toContain('beit-douma')
  })

  it('cannot reach the draft by asking for it directly', async () => {
    const { body } = await restGet('/api/businesses?where[slug][equals]=beit-douma')
    expect(docsOf(body)).toHaveLength(0)
  })

  it('cannot opt into drafts with a query parameter', async () => {
    const { body } = await restGet('/api/businesses?draft=true&limit=100')
    expect(docsOf(body).map((d) => d.slug)).not.toContain('beit-douma')
  })
})

describe('staff reads of /api/businesses', () => {
  it('include the commercial fields', async () => {
    const { status, body } = await restGet('/api/businesses?limit=100', { headers: auth() })

    expect(status).toBe(200)
    const albergo = docsOf(body).find((d) => d.slug === 'hotel-albergo')

    expect(albergo).toBeDefined()
    expect(albergo).toHaveProperty('internalNotes')
    expect(albergo?.contractEndsAt).toBeTruthy()
  })

  it('include the draft listing', async () => {
    const { body } = await restGet('/api/businesses?limit=100&draft=true', { headers: auth() })
    expect(docsOf(body).map((d) => d.slug)).toContain('beit-douma')
  })
})

describe('other collections', () => {
  it('withholds the print run on issues from anonymous callers', async () => {
    const { body } = await restGet('/api/issues?limit=10')
    const issues = docsOf(body)

    expect(issues.length).toBeGreaterThan(0)
    for (const issue of issues) {
      expect(issue).not.toHaveProperty('printRun')
    }
  })

  it('gives the print run to staff', async () => {
    const { body } = await restGet('/api/issues?limit=10', { headers: auth() })
    const seeded = docsOf(body).find((d) => d.slug === 'summer-2026')
    expect(seeded?.printRun).toBe(15000)
  })

  it('refuses anonymous access to qr-codes, scan-events and users', async () => {
    for (const collection of ['qr-codes', 'scan-events', 'users']) {
      const { status } = await restGet(`/api/${collection}?limit=1`)
      expect(status, `${collection} was readable anonymously`).toBe(403)
    }
  })

  it('keeps media and articles public, which the site needs', async () => {
    expect((await restGet('/api/media?limit=1')).status).toBe(200)
    expect((await restGet('/api/articles?limit=1')).status).toBe(200)
  })
})

const ANONYMOUS_WRITES: [string, unknown][] = [
  ['/api/businesses', { name: 'Intruder', slug: 'intruder' }],
  ['/api/articles', { title: 'Intruder', slug: 'intruder' }],
  ['/api/issues', { title: 'Intruder', issueNumber: 999 }],
  ['/api/scan-events', { code: 'AAAAAAA', scannedAt: new Date().toISOString() }],
  ['/api/users', { email: 'intruder@example.com', password: 'x', roles: ['admin'] }],
]

describe('anonymous writes', () => {
  /**
   * Runs first, because the assertion below cannot tell the two apart.
   *
   * Payload answers 404 for a collection it does not have, and this file used to
   * list /api/pages. That collection was deleted three days after this test was
   * written, so the line was asserting that a route which no longer exists
   * refuses writes - which it does, for the wrong reason, and would have failed
   * here as an access-control problem. Name the real cause instead.
   */
  it('lists only collections that still exist', () => {
    const slugs = payload.config.collections.map((c) => c.slug)

    for (const [path] of ANONYMOUS_WRITES) {
      const slug = path.replace('/api/', '')
      expect(slugs, `${path} names a collection that is no longer configured`).toContain(slug)
    }
  })

  it('are refused on every collection', async () => {
    const attempts = ANONYMOUS_WRITES

    for (const [path, body] of attempts) {
      const { status } = await restPost(path, body)
      expect([401, 403], `${path} accepted an anonymous write (${status})`).toContain(status)
    }
  })

  it('leave nothing behind after being refused', async () => {
    const { body } = await restGet('/api/businesses?where[slug][equals]=intruder')
    expect(docsOf(body)).toHaveLength(0)
  })
})

/**
 * Scan events are written by the redirect route through the local API, which
 * bypasses access control deliberately. Over HTTP nobody may create one, and
 * that includes staff: a scan count you can POST to is not evidence.
 */
describe('scan events are append-only over HTTP', () => {
  it('refuses a signed-in create', async () => {
    const { status } = await restPost(
      '/api/scan-events',
      { code: 'AAAAAAA', scannedAt: new Date().toISOString() },
      { headers: auth() },
    )

    expect([401, 403]).toContain(status)
  })
})
