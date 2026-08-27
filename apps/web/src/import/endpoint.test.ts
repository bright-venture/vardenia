import { describe, expect, it, vi } from 'vitest'
import { importListingsEndpoint } from './endpoint'
import { SAMPLE_CSV, SAMPLE_ROWS } from './sample-listings'

/**
 * The admin panel's import endpoint.
 *
 * # What is actually being guarded
 *
 * This creates listings. Payload does not apply collection access to a custom
 * endpoint, so the role check here is the only thing between an anonymous POST
 * and a directory full of rows somebody else wrote. Most of these tests are
 * about that, and about the window clamp - the two places where a mistake is
 * not visible in the admin panel.
 */

const csv = SAMPLE_CSV

const handler = importListingsEndpoint.handler as (req: unknown) => Promise<Response>

/**
 * A CSV of `count` distinct listings, for the cases that need a file longer
 * than the window cap. Built from the fixture's header so it stays in step with
 * it, with a unique name per row so no slug collides.
 */
function manyRows(count: number): string {
  const [header] = csv.split('\n')
  const blank = Array<string>(23).fill('')

  const rows = Array.from({ length: count }, (_, index) => {
    const cells = [...blank]
    cells[0] = String(index + 1)
    cells[1] = 'Restaurants'
    cells[2] = 'Keserwan District'
    cells[4] = 'Jounieh'
    cells[5] = `Generated Listing ${index + 1}`
    return cells.join(',')
  })

  return [header, ...rows].join('\n')
}

interface CallOptions {
  roles?: string[] | null
  body?: unknown
  onImport?: (args: Record<string, unknown>) => void
}

/**
 * Enough of a PayloadRequest for the handler, with `create` recorded rather
 * than performed. The mapping is tested elsewhere; what matters here is which
 * options reach runImport.
 */
function call({ roles = ['admin'], body = {}, onImport }: CallOptions = {}) {
  const req = {
    user: roles === null ? null : { id: 1, roles },
    json: async () => body,
    payload: {
      logger: { error: vi.fn(), info: vi.fn() },
      find: vi.fn(async ({ collection }: { collection: string }) =>
        collection === 'media' ? { docs: [{ id: 1 }], totalDocs: 1 } : { docs: [], totalDocs: 0 },
      ),
      create: vi.fn(async () => {
        onImport?.({})
        return { id: 1 }
      }),
    },
  }

  return handler(req)
}

/**
 * The response shape, stated rather than left as `Record<string, never>`.
 *
 * That earlier alias typed every value as `never`, so `body.warnings.length`
 * did not compile and `body.parsed` compared to a number by accident. A test
 * helper that types away the thing under test is not a helper.
 */
interface ImportBody_ {
  parsed?: number
  created?: number
  skippedExisting?: number
  unmappable?: unknown[]
  warnings?: unknown[]
  failures?: unknown[]
  nextOffset?: number | null
  error?: string
}

const read = async (response: Response) => (await response.json()) as ImportBody_

describe('who may call it', () => {
  it('answers an admin', async () => {
    const response = await call({ body: { csv, batch: 'a-batch', dryRun: true } })
    expect(response.status).toBe(200)
  })

  it('answers staff', async () => {
    const response = await call({ roles: ['staff'], body: { csv, batch: 'a-batch', dryRun: true } })
    expect(response.status).toBe(200)
  })

  /**
   * The one that matters. An unauthenticated POST to a route that creates
   * listings is a public write, and nothing in the admin panel would show it.
   */
  it('refuses nobody at all', async () => {
    const response = await call({ roles: null, body: { csv, batch: 'a-batch' } })
    expect(response.status).toBe(403)
  })

  it('refuses a signed-in customer', async () => {
    const response = await call({ roles: ['customer'], body: { csv, batch: 'a-batch' } })
    expect(response.status).toBe(403)
  })

  it('refuses a user with no roles at all', async () => {
    const response = await call({ roles: [], body: { csv, batch: 'a-batch' } })
    expect(response.status).toBe(403)
  })

  /** Checked before the body is read, so a huge payload from a stranger is cheap. */
  it('refuses before parsing anything', async () => {
    const req = {
      user: null,
      json: vi.fn(async () => ({})),
      payload: { logger: { error: vi.fn() } },
    }

    await handler(req)
    expect(req.json).not.toHaveBeenCalled()
  })
})

describe('what it accepts', () => {
  it('refuses a body that is not JSON', async () => {
    const req = {
      user: { roles: ['admin'] },
      json: async () => {
        throw new Error('not json')
      },
      payload: { logger: { error: vi.fn() } },
    }

    expect((await handler(req)).status).toBe(400)
  })

  it('refuses an empty file', async () => {
    expect((await call({ body: { csv: '   ', batch: 'a-batch' } })).status).toBe(400)
  })

  it('refuses a file over 5MB', async () => {
    const huge = `${'x'.repeat(5 * 1024 * 1024 + 1)}`
    expect((await call({ body: { csv: huge, batch: 'a-batch' } })).status).toBe(413)
  })

  /**
   * Without a batch the import cannot be removed again, which is the whole
   * safety story for bulk data. Required even for a dry run, so the rehearsal
   * is the same call as the real thing.
   */
  it('refuses a missing or malformed batch name', async () => {
    for (const batch of [
      '',
      '  ',
      'ab',
      'Has Capitals',
      'has spaces',
      'has_underscores',
      '-leading',
    ]) {
      const response = await call({ body: { csv, batch } })
      expect(response.status, `batch: "${batch}"`).toBe(400)
    }
  })

  it('accepts an ordinary batch name', async () => {
    const response = await call({ body: { csv, batch: 'keserwan-2026-08', dryRun: true } })
    expect(response.status).toBe(200)
  })
})

describe('the window', () => {
  it('reports where to resume, and how many listings there are in all', async () => {
    const body = await read(await call({ body: { csv, batch: 'a-batch', dryRun: true, limit: 5 } }))
    expect(body.parsed).toBe(SAMPLE_ROWS)
    expect(body.nextOffset).toBe(5)
  })

  it('reports null once the file is finished', async () => {
    const body = await read(
      await call({ body: { csv, batch: 'a-batch', dryRun: true, offset: 18, limit: 5 } }),
    )
    expect(body.nextOffset).toBeNull()
  })

  /**
   * A caller asking for the whole file in one window gets a function killed
   * partway through, which is exactly what windowing exists to prevent. Clamped
   * rather than refused: refusing would only teach the caller to send the
   * maximum.
   *
   * Needs a file longer than the cap to be observable at all. Against the
   * twenty-row fixture, a clamp to 25 and no clamp produce the same answer -
   * which is how a broken clamp would pass a test that looked reasonable.
   */
  it('clamps a window that is too large', async () => {
    const long = manyRows(60)
    const body = await read(
      await call({ body: { csv: long, batch: 'a-batch', dryRun: true, limit: 10000 } }),
    )

    expect(body.parsed).toBe(60)
    expect(body.nextOffset).toBe(25)
  })

  it('ignores a nonsense offset or limit rather than failing', async () => {
    const body = await read(
      await call({
        body: { csv, batch: 'a-batch', dryRun: true, offset: -7, limit: 'lots' },
      }),
    )
    expect(body.nextOffset).toBe(5)
  })
})

describe('a dry run', () => {
  it('writes nothing', async () => {
    let wrote = false
    await call({
      body: { csv, batch: 'a-batch', dryRun: true },
      onImport: () => {
        wrote = true
      },
    })

    expect(wrote).toBe(false)
  })

  it('still reports what the file contains', async () => {
    const body = await read(await call({ body: { csv, batch: 'a-batch', dryRun: true } }))
    expect(body.parsed).toBe(SAMPLE_ROWS)
    expect(Array.isArray(body.warnings)).toBe(true)
  })
})

/**
 * The check button, which sends `limit: 0` meaning "describe the whole file".
 *
 * It did not. `counted(0, 5)` returns 0, `0 || DEFAULT_WINDOW` is 5, and the
 * dry run therefore examined the first five rows while reporting `parsed` for
 * all of them. Against the real Keserwan file that showed "308 listings, 0 rows
 * needing a look" - the first five rows are clean hotels - when 56 rows have
 * something wrong with them.
 *
 * Worse than a missing feature: it is a check that says the file is fine.
 */
describe('the check button', () => {
  it('describes every row, not just the first window', async () => {
    const body = await read(
      await call({ body: { csv, batch: 'a-batch', dryRun: true, offset: 0, limit: 0 } }),
    )

    expect(body.parsed).toBe(SAMPLE_ROWS)
    expect(body.warnings?.length ?? 0).toBeGreaterThan(2)
  })

  /**
   * The number that made the bug invisible. `parsed` counted the whole file
   * while `warnings` counted one window, so the report looked complete.
   */
  it('counts warnings over the same rows it claims to have parsed', async () => {
    const whole = await read(
      await call({ body: { csv, batch: 'a-batch', dryRun: true, limit: 0 } }),
    )
    const window = await read(
      await call({ body: { csv, batch: 'a-batch', dryRun: true, limit: 5 } }),
    )

    expect(whole.parsed).toBe(window.parsed)
    expect(whole.warnings?.length ?? 0).toBeGreaterThan(window.warnings?.length ?? 0)
  })

  it('still clamps a real import, where limit 0 is not a request for everything', async () => {
    const body = await read(await call({ body: { csv: manyRows(60), batch: 'a-batch', limit: 0 } }))
    expect(body.nextOffset).toBe(5)
  })
})
