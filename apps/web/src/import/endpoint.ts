import type { Endpoint, PayloadRequest } from 'payload'
import { runImport } from './run'

/**
 * `POST /api/import-listings` - the admin panel's CSV import.
 *
 * # Why the browser sends the same file many times
 *
 * A window at a time. See the note on `nextOffset` in run.ts for the reason: a
 * listing takes a couple of seconds to write and a Netlify function is killed
 * at ten, so an import that runs inside one request cannot exist on this
 * deployment. The browser holds the loop because the browser has no timeout.
 *
 * Re-sending the file with each window costs a few hundred kilobytes and buys
 * a server that holds no state between requests, which is what makes a failed
 * window retryable rather than a half-finished job somebody has to reason
 * about.
 *
 * # Staff only, checked here rather than assumed
 *
 * `req.user` is whoever the admin cookie says. Payload does not apply
 * collection access to a custom endpoint, so an endpoint that creates listings
 * has to do its own check - and a missing check here would be a public write
 * route, not a public read one.
 */

const MAX_CSV_BYTES = 5 * 1024 * 1024

/**
 * The largest window a caller may ask for.
 *
 * Not a performance tuning knob - a guard. A caller asking for the whole file
 * in one window gets a function killed partway through, and the point of
 * windowing is that a window either finishes or does not. Anything larger is
 * clamped rather than refused, because refusing would only teach the caller to
 * send the maximum.
 */
const MAX_WINDOW = 25
const DEFAULT_WINDOW = 5

interface ImportBody {
  csv?: unknown
  batch?: unknown
  dryRun?: unknown
  offset?: unknown
  limit?: unknown
}

const isStaff = (user: PayloadRequest['user']): boolean => {
  const roles = (user as { roles?: unknown } | null)?.roles
  return Array.isArray(roles) && roles.some((role) => role === 'admin' || role === 'staff')
}

/** A finite, non-negative integer, or the fallback. */
const counted = (value: unknown, fallback: number): number => {
  const n = Number(value)
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : fallback
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })

export const importListingsEndpoint: Endpoint = {
  path: '/import-listings',
  method: 'post',
  handler: async (req) => {
    if (!isStaff(req.user)) {
      return json({ error: 'Staff only.' }, 403)
    }

    let body: ImportBody
    try {
      body = ((await req.json?.()) ?? {}) as ImportBody
    } catch {
      return json({ error: 'Expected a JSON body.' }, 400)
    }

    const csv = typeof body.csv === 'string' ? body.csv : ''
    const batch = typeof body.batch === 'string' ? body.batch.trim() : ''

    if (!csv.trim()) {
      return json({ error: 'No CSV was sent.' }, 400)
    }

    /**
     * Measured in bytes rather than characters. A CSV of Arabic business names
     * is three bytes a character, so a character count would let through a
     * payload three times the size it looked.
     */
    if (Buffer.byteLength(csv, 'utf8') > MAX_CSV_BYTES) {
      return json({ error: 'That file is larger than 5MB. Split it and import in parts.' }, 413)
    }

    /**
     * A batch name is required even for a dry run, so the two are the same call
     * and a dry run genuinely rehearses the import rather than a variant of it.
     */
    if (!/^[a-z0-9][a-z0-9-]{2,60}$/.test(batch)) {
      return json(
        {
          error:
            'A batch name is required: lower case letters, numbers and hyphens, 3 to 61 characters. It is what lets this import be removed again later.',
        },
        400,
      )
    }

    const dryRun = body.dryRun === true
    const offset = counted(body.offset, 0)
    const limit = Math.min(counted(body.limit, DEFAULT_WINDOW) || DEFAULT_WINDOW, MAX_WINDOW)

    try {
      const result = await runImport(req.payload, { csv, batch, dryRun, offset, limit })
      return json(result)
    } catch (error) {
      /**
       * Reported rather than swallowed. A failure here means the whole window
       * was refused - a malformed file, or the database being unreachable - and
       * the browser needs to distinguish that from a window where individual
       * rows failed, which comes back in `failures` with a 200.
       */
      req.payload.logger.error({ err: error, batch, offset }, 'Listing import window failed')

      return json({ error: error instanceof Error ? error.message : 'The import failed.' }, 500)
    }
  },
}
