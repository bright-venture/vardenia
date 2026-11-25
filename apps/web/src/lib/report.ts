import { createHash } from 'node:crypto'
import { rawDb } from './db'
import { redact } from './redact'

/**
 * Where a production error goes.
 *
 * Until now: nowhere. Netlify keeps function logs for a while and nobody reads
 * them, which was defensible while the site had no users and stopped being
 * defensible the moment a customer could lose a booking.
 *
 * The problem is specific to how this codebase is written. Several failures are
 * deliberately swallowed, and correctly so - a booking whose confirmation email
 * failed is still a real booking, and rolling it back over a mail provider's bad
 * minute would be worse. But "log it and carry on" only works if somebody reads
 * the log. This is the somebody.
 *
 * # One function, one place
 *
 * Everything calls `reportError`. What sits behind it is a detail: today a
 * Payload collection, which costs nothing and shows up in the admin panel staff
 * already have open. Adding Sentry later is this file and nothing else.
 *
 * Server-side only. Client errors - hydration failures, a form's JavaScript
 * breaking - are not covered, and would need a public endpoint with its own rate
 * limiting before they could be. Worth doing, not done here.
 *
 * # Grouping, which is also the retention policy
 *
 * Errors are grouped by fingerprint and counted, rather than appended. A crash
 * loop therefore updates one row a thousand times instead of writing a thousand
 * rows, so the table is bounded by how many *distinct* things are broken. That
 * is a number that stays small even when the site does not.
 */

// The cleaner lives in lib/redact so the browser (Sentry) can share it.
export { redact }

/**
 * A message with the variable parts taken out, so two occurrences of one bug
 * group together.
 *
 * "Booking 8213 failed" and "Booking 9902 failed" are the same bug and must not
 * become two rows. Numbers, quoted values and bracketed ids go; the words stay,
 * because the words are what identifies it.
 */
export function normaliseMessage(message: string): string {
  return redact(message)
    .replace(/\d+/g, '#')
    .replace(/"[^"]*"|'[^']*'/g, "'*'")
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 500)
}

/**
 * Which file of ours the error came from, without the line number.
 *
 * The file, and only the file, and that is the whole point. An earlier version
 * kept the full frame including `:line:column`, which grouped correctly until
 * the first deploy: a bundled build moves every line, so the same bug fingerprints
 * differently afterwards, its count resets to one, and a long-standing problem
 * looks like a brand new one every time we ship. Caught by reporting the same
 * bug from two places and watching it split.
 *
 * The absolute prefix goes too - `/var/task/...` on the server, a drive letter
 * on a laptop - so the same bug is one bug wherever it was seen.
 *
 * The cost is that two different bugs in one file can merge if their messages
 * normalise alike. That is the right way round: a merged pair is still visible
 * and still gets fixed, while a bug whose history resets every Tuesday is one
 * nobody ever notices is chronic.
 */
export function topFrame(stack: string | undefined): string {
  if (!stack) return ''

  const lines = stack.split('\n').slice(1)
  const ours =
    lines.find((line) => line.includes('/src/') || line.includes('\\src\\')) ?? lines[0] ?? ''

  const normalised = ours
    .replace(/\\/g, '/')
    // Keep from `src/` onwards, dropping whatever absolute path preceded it.
    .replace(/^.*?(?=src\/)/, '')
    // Drop `:line:column`, and any trailing `)` from the frame's own formatting.
    .replace(/:\d+:\d+\)?$/, '')
    .replace(/^\s*at\s+/, '')
    .trim()

  return redact(normalised).slice(0, 300)
}

export interface Fingerprintable {
  name?: string
  message?: string
  stack?: string
  /** Set by the caller when the automatic grouping would be wrong. */
  group?: string
}

/**
 * The identity of a bug, as a short hash.
 *
 * Name plus normalised message plus the top frame of our own code. Including the
 * frame separates two different callers hitting the same generic message, which
 * is the difference between "a database write failed" and knowing which one.
 */
export function fingerprint(error: Fingerprintable): string {
  const parts = error.group
    ? [error.group]
    : [error.name ?? 'Error', normaliseMessage(error.message ?? ''), topFrame(error.stack)]

  return createHash('sha256').update(parts.join('|')).digest('hex').slice(0, 16)
}

export type ErrorLevel = 'error' | 'warning'

export interface ReportContext {
  /** What was happening: 'booking.confirmation-email', 'auth.reset'. */
  source: string
  /** Request path, when there is one. */
  path?: string
  level?: ErrorLevel
  /** Anything else worth having. Redacted and truncated before storage. */
  extra?: Record<string, unknown>
  /** Overrides automatic grouping when the message alone would scatter it. */
  group?: string
}

/** Shape of what gets stored, built purely so it can be tested without a database. */
export interface ErrorRecord {
  fingerprint: string
  name: string
  message: string
  stack: string
  source: string
  path: string
  level: ErrorLevel
  extra: string
}

/** How long a message may be before a shorter `cause` is preferred to it. */
const UNREADABLE_MESSAGE = 300

/**
 * The message a person should read, which is not always `error.message`.
 *
 * A failed database query arrives with the entire SELECT statement as its
 * message - two thousand characters of column list and lateral joins - and the
 * actual reason tucked into `cause`:
 *
 *   message: 'Failed query: select "businesses"."id", ... (2000 chars)'
 *   cause:   'invalid input syntax for type integer: "NaN"'
 *
 * Storing the first makes the table unreadable, which defeats the point of
 * having one. Worse, it breaks grouping: every failed query on a collection
 * truncates to the same first 500 characters, so unrelated bugs merge into one
 * row. Both were visible the first time real errors went through this, and
 * neither was visible in the unit tests, where messages are short.
 *
 * The long form is not lost - it is still in the console line, which is what the
 * platform logs keep.
 */
const asError = (value: unknown): { name: string; message: string; stack?: string } => {
  if (value instanceof Error) {
    const cause = (value as { cause?: unknown }).cause
    const causeMessage =
      cause instanceof Error ? cause.message : typeof cause === 'string' ? cause : ''

    const message =
      causeMessage && value.message.length > UNREADABLE_MESSAGE ? causeMessage : value.message

    return { name: value.name, message, stack: value.stack }
  }
  if (typeof value === 'string') return { name: 'Error', message: value }
  return { name: 'Error', message: safeStringify(value) }
}

/**
 * The same readable message, for showing to a person rather than storing.
 *
 * The listing import put the raw form on screen: "Failed query: insert into
 * qr_codes ..." with the parameters, and the reason Postgres gave nowhere.
 */
export function readableMessage(value: unknown): string {
  return asError(value).message
}

function safeStringify(value: unknown): string {
  try {
    return JSON.stringify(value) ?? String(value)
  } catch {
    // Circular, or something with a throwing getter. Neither is worth failing over.
    return String(value)
  }
}

/**
 * Fingerprints written recently by this instance, so a tight loop does not turn
 * one bug into a thousand database writes.
 *
 * The cost is an undercount during a storm: the row says it happened twice when
 * it happened four hundred times. That is the right thing to trade away, because
 * the number nobody needs is the exact one - what a person triaging wants to
 * know is that it is happening now and roughly how much, and `lastSeen` carries
 * the first half of that on its own.
 *
 * Per instance and per process, like any in-memory state on serverless. Several
 * warm instances will each write once per window, which errs towards recording
 * more rather than less.
 */
const recentlyWritten = new Map<string, number>()
const COALESCE_MS = 10_000

/** Also bounds the map, so a long-lived instance seeing many distinct bugs cannot grow it forever. */
function shouldWrite(fp: string, now: number): boolean {
  const last = recentlyWritten.get(fp)
  if (last !== undefined && now - last < COALESCE_MS) return false

  for (const [key, at] of recentlyWritten) {
    if (now - at > COALESCE_MS) recentlyWritten.delete(key)
  }

  recentlyWritten.set(fp, now)
  return true
}

export function buildRecord(error: unknown, context: ReportContext): ErrorRecord {
  const { name, message, stack } = asError(error)

  return {
    fingerprint: fingerprint({ name, message, stack, group: context.group }),
    name: name.slice(0, 120),
    /**
     * Short, because this is the column shown in the admin list view. Two
     * thousand characters there is a wall of text nobody scans past; the full
     * message survives in the console line and therefore in the platform logs.
     */
    message: redact(message).slice(0, 500),
    // Trimmed hard: the useful part of a stack is the first few frames, and the
    // rest is framework internals that make the row unreadable in a table.
    stack: redact((stack ?? '').split('\n').slice(0, 12).join('\n')).slice(0, 4000),
    source: context.source.slice(0, 120),
    path: (context.path ?? '').slice(0, 300),
    level: context.level ?? 'error',
    extra: redact(safeStringify(context.extra ?? {})).slice(0, 2000),
  }
}

/**
 * Record an error. Never throws, never blocks anything important.
 *
 * The console line always happens and happens first, because it is the half that
 * still works when the database is the thing that is broken. The row is best
 * effort on top of it.
 *
 * # It must not be able to make an outage worse
 *
 * Three rules, and they are the reason this function is longer than it looks
 * like it should be:
 *
 *  - **It cannot throw.** Every caller is already inside a `catch` that decided
 *    to carry on. An exception raised here would convert a handled failure into
 *    an unhandled one, which is precisely backwards.
 *  - **It cannot recurse.** A failure while recording a failure is logged to the
 *    console and goes no further. Reporting it would call this again.
 *  - **It cannot flood.** See `shouldWrite`.
 */
export async function reportError(error: unknown, context: ReportContext): Promise<void> {
  const record = buildRecord(error, context)

  // The second copy, in Sentry (lib/sentry), with the stack and the context
  // tags; cleaned by its beforeSend. Inert without a DSN.
  try {
    const Sentry = await import('@sentry/nextjs')
    Sentry.captureException(error, {
      level: record.level === 'warning' ? 'warning' : 'error',
      tags: { source: record.source },
      extra: { path: record.path, fingerprint: record.fingerprint },
    })
  } catch {
    // Monitoring must never be the thing that fails.
  }

  // First, and unconditionally. Netlify captures stdout.
  console.error(
    `[${record.level}] ${record.source}: ${record.message}`,
    JSON.stringify({ fingerprint: record.fingerprint, path: record.path, extra: record.extra }),
  )

  if (!shouldWrite(record.fingerprint, Date.now())) return

  try {
    const { getPayload } = await import('payload')
    const { default: config } = await import('../payload.config')
    const payload = await getPayload({ config })

    const existing = await payload.find({
      collection: 'error-events',
      where: { fingerprint: { equals: record.fingerprint } },
      limit: 1,
      depth: 0,
      overrideAccess: true,
    })

    const now = new Date().toISOString()
    const found = existing.docs[0]

    if (found) {
      /**
       * `count = count + 1` in the database, not `found.count + 1` here.
       *
       * The previous version read the row and wrote back the number it had
       * read. Two occurrences of the same bug arriving together both read 5 and
       * both write 6, so one is lost - and that is precisely what happens in a
       * crash loop, which is the one time the number matters. The scan counter
       * in /g/[code] already did it this way; this did not.
       *
       * Raw SQL because Payload's update takes a value rather than an
       * expression, so there is no way to say "one more than whatever is there"
       * through the document API.
       *
       * Only the update path bypasses Payload. Creating still goes through it
       * below, which is what fires the afterChange hook that mails on a bug's
       * first sighting - see hooks/notifyNewError.
       */
      const db = rawDb(payload)
      const table = `"${db.schema}"."${db.table('error_events')}"`

      await db.pool.query(
        `update ${table}
            set count = count + 1,
                last_seen = $2,
                updated_at = $2,
                -- A bug somebody ticked off that has happened again is not
                -- resolved. Leaving it ticked is how a regression stays hidden.
                resolved = false,
                -- Refreshed because the newest occurrence is the one worth
                -- reading: path and stack may differ between callers.
                message = $3,
                stack = $4,
                path = $5,
                extra = $6
          where fingerprint = $1`,
        [record.fingerprint, now, record.message, record.stack, record.path, record.extra],
      )
      return
    }

    await payload.create({
      collection: 'error-events',
      data: { ...record, count: 1, firstSeen: now, lastSeen: now, resolved: false },
      overrideAccess: true,
    })
  } catch (failure) {
    // Deliberately terminal. See the note above about recursion.
    console.error('[error] report.persist-failed', String(failure))
  }
}
