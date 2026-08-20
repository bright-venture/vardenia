import { describe, expect, it } from 'vitest'
import { buildRecord, fingerprint, normaliseMessage, redact, topFrame } from './report'

/**
 * The two things that have to be right about error reporting.
 *
 * **Nothing sensitive is stored.** An error table is read by everyone with staff
 * access, gets pasted into chat, and appears in screenshots. A failed database
 * connection puts the password in `error.message`; a booking failure can put a
 * customer's address in a stack trace. Redaction is the whole reason this is
 * safe to keep in Postgres rather than behind a vendor's access controls.
 *
 * **Occurrences of one bug group together.** Without it a crash loop writes ten
 * thousand rows and buries everything else, and the table stops being something
 * anyone reads - which is the exact failure it exists to fix.
 */

describe('redact', () => {
  it('removes a database password', () => {
    const message = 'connect ECONNREFUSED postgresql://postgres.abc:hunter2@db.host:5432/postgres'
    const out = redact(message)
    expect(out).not.toContain('hunter2')
    expect(out).not.toContain('postgres.abc')
    // The shape survives, so the row still says what kind of failure it was.
    expect(out).toContain('ECONNREFUSED')
  })

  it('removes credentials from any URL', () => {
    expect(redact('failed https://admin:s3cret@vardenia.com/hook')).not.toContain('s3cret')
  })

  it('removes a session token', () => {
    const jwt = 'eyJhbGciOiJIUzI1NiJ9.eyJpZCI6MiwiY29sbCI6ImN1c3RvbWVycyJ9.abcdefghijk'
    expect(redact(`cookie payload-token=${jwt}`)).not.toContain('eyJhbGciOiJIUzI1NiJ9')
  })

  it('removes a provider key', () => {
    expect(redact('Resend rejected re_AbCd1234EfGh5678')).not.toContain('AbCd1234EfGh5678')
  })

  it.each([
    ['password=hunter2', 'hunter2'],
    ['secret: topsecretvalue', 'topsecretvalue'],
    ['api_key=abc123xyz', 'abc123xyz'],
    ['Authorization: Bearer abc.def.ghi', 'abc.def.ghi'],
  ])('removes %s', (input, secret) => {
    expect(redact(input)).not.toContain(secret)
  })

  /**
   * The one that turns a debugging aid into a mailing list. Booking and sign-up
   * failures both carry an address in the message.
   */
  it('removes an email address', () => {
    const out = redact('Could not send to sami.khoury+booking@example.com')
    expect(out).not.toContain('sami.khoury')
    expect(out).not.toContain('example.com')
    expect(out).toContain('[email]')
  })

  it('removes a reset or verification token', () => {
    const token = 'c25d34afb5230ec41f14178131b01d73477818f6'
    expect(redact(`invalid token ${token}`)).not.toContain(token)
  })

  it('leaves an ordinary message alone', () => {
    const message = 'This place is fully booked at that time.'
    expect(redact(message)).toBe(message)
  })
})

describe('normaliseMessage', () => {
  it('groups the same bug with different ids', () => {
    expect(normaliseMessage('Booking 8213 failed')).toBe(normaliseMessage('Booking 9902 failed'))
  })

  it('groups the same bug with different quoted values', () => {
    expect(normaliseMessage('Unknown column "phone"')).toBe(
      normaliseMessage('Unknown column "fax"'),
    )
  })

  it('keeps genuinely different messages apart', () => {
    expect(normaliseMessage('Booking failed')).not.toBe(normaliseMessage('Email failed'))
  })

  it('redacts before normalising, so a secret cannot survive as a number', () => {
    expect(normaliseMessage('password=hunter2')).not.toContain('hunter2')
  })
})

describe('topFrame', () => {
  const stack = [
    'Error: boom',
    '    at node_modules/pg/lib/client.js:1:1',
    '    at /var/task/apps/web/src/lib/booking-service.ts:42:9',
    '    at node_modules/next/dist/server.js:9:9',
  ].join('\n')

  it('prefers our own code over a dependency', () => {
    expect(topFrame(stack)).toContain('booking-service.ts')
  })

  /**
   * No line numbers, and no absolute prefix. A bundled build moves every line,
   * so keeping them meant the same bug fingerprinted differently after each
   * deploy - its count resetting to one, a chronic problem looking new every
   * time we shipped.
   */
  it('keeps the file and drops the line number', () => {
    expect(topFrame(stack)).toBe('src/lib/booking-service.ts')
  })

  it('drops the absolute prefix, so a laptop and the server agree', () => {
    const onServer = 'Error\n    at /var/task/apps/web/src/lib/x.ts:9:1'
    const onLaptop = 'Error\n    at C:\\Users\\dev\\vardenia\\apps\\web\\src\\lib\\x.ts:41:7'
    expect(topFrame(onServer)).toBe(topFrame(onLaptop))
  })

  it('falls back to the first frame when nothing is ours', () => {
    expect(topFrame('Error: boom\n    at node_modules/pg/lib/client.js:1:1')).toContain('pg')
  })

  it('handles a missing stack', () => {
    expect(topFrame(undefined)).toBe('')
  })
})

describe('fingerprint', () => {
  const err = (message: string, stack?: string) => ({ name: 'Error', message, stack })

  it('is stable for the same bug', () => {
    expect(fingerprint(err('Booking 1 failed'))).toBe(fingerprint(err('Booking 2 failed')))
  })

  it('differs for different bugs', () => {
    expect(fingerprint(err('Booking failed'))).not.toBe(fingerprint(err('Email failed')))
  })

  /**
   * The reason the stack frame is part of the identity. Two callers hitting the
   * same generic database message are two different bugs, and merging them means
   * fixing one and thinking both are done.
   */
  it('separates the same message thrown from different places', () => {
    const a = err('insert failed', 'Error\n    at /src/lib/booking-service.ts:10:1')
    const b = err('insert failed', 'Error\n    at /src/lib/session.ts:20:1')
    expect(fingerprint(a)).not.toBe(fingerprint(b))
  })

  it('honours an explicit group over the message', () => {
    const a = fingerprint({ ...err('one thing'), group: 'booking.request.unexpected' })
    const b = fingerprint({ ...err('quite another'), group: 'booking.request.unexpected' })
    expect(a).toBe(b)
  })

  /**
   * The regression this file exists to prevent. Same bug, same file, different
   * line - which is what every deploy produces - must stay one bug.
   */
  it('survives a deploy that moves the line numbers', () => {
    const before = err('insert failed', 'Error\n    at /var/task/src/lib/booking-service.ts:42:9')
    const after = err('insert failed', 'Error\n    at /var/task/src/lib/booking-service.ts:87:3')
    expect(fingerprint(before)).toBe(fingerprint(after))
  })

  it('is short enough to read and index', () => {
    expect(fingerprint(err('x'))).toHaveLength(16)
  })
})

describe('buildRecord', () => {
  it('accepts something that is not an Error at all', () => {
    // Anything can be thrown in JavaScript, and something eventually will be.
    expect(buildRecord('a bare string', { source: 's' }).message).toBe('a bare string')
    expect(buildRecord({ odd: true }, { source: 's' }).message).toContain('odd')
    expect(buildRecord(undefined, { source: 's' }).name).toBe('Error')
  })

  it('survives a value that cannot be serialised', () => {
    const circular: Record<string, unknown> = {}
    circular.self = circular
    expect(() => buildRecord(circular, { source: 's' })).not.toThrow()
  })

  it('redacts the message, the stack and the extra context', () => {
    const error = new Error('failed for sami@example.com')
    error.stack = 'Error: failed for sami@example.com\n    at /src/lib/x.ts:1:1'

    const record = buildRecord(error, {
      source: 'booking.request',
      extra: { email: 'other@example.com', password: 'hunter2' },
    })

    expect(record.message).not.toContain('sami@example.com')
    expect(record.stack).not.toContain('sami@example.com')
    expect(record.extra).not.toContain('other@example.com')
    expect(record.extra).not.toContain('hunter2')
  })

  it('bounds every field, so one enormous error cannot fill the table', () => {
    const error = new Error('x'.repeat(50_000))
    error.stack = Array.from({ length: 500 }, (_, i) => `    at frame${i}`).join('\n')

    const record = buildRecord(error, { source: 's'.repeat(500), path: '/p'.repeat(500) })

    expect(record.message.length).toBeLessThanOrEqual(2000)
    expect(record.stack.length).toBeLessThanOrEqual(4000)
    expect(record.source.length).toBeLessThanOrEqual(120)
    expect(record.path.length).toBeLessThanOrEqual(300)
  })

  it('defaults to error level', () => {
    expect(buildRecord(new Error('x'), { source: 's' }).level).toBe('error')
    expect(buildRecord(new Error('x'), { source: 's', level: 'warning' }).level).toBe('warning')
  })
})

/**
 * `extra` is the field a person reads when triaging, and the one most likely to
 * be parsed by something later. Redaction must not turn it into a string that
 * looks like JSON and is not.
 */
describe('redaction keeps JSON valid', () => {
  it('leaves a redacted object parseable', () => {
    const input = JSON.stringify({ password: 'hunter2', reference: 'ABCD1234' })
    const out = redact(input)

    expect(() => JSON.parse(out)).not.toThrow()
    expect(JSON.parse(out)).toEqual({ password: '[redacted]', reference: 'ABCD1234' })
  })

  it('keeps the extra field of a built record parseable', () => {
    const record = buildRecord(new Error('x'), {
      source: 's',
      extra: { token: 'abc123def456', email: 'sami@example.com', reference: 'ABCD1234' },
    })

    expect(() => JSON.parse(record.extra)).not.toThrow()
    const parsed = JSON.parse(record.extra) as Record<string, string>
    expect(parsed.reference).toBe('ABCD1234')
    expect(parsed.token).toBe('[redacted]')
    expect(parsed.email).toBe('[email]')
  })
})

/**
 * What a database failure actually looks like, which is not what the tests above
 * assume. Both of these were found by putting real errors through the reporter
 * and reading the table, not by unit testing.
 */
describe('a failed database query', () => {
  const failedQuery = (sql: string, reason: string) => {
    const error = new Error(`Failed query: ${sql}`)
    ;(error as { cause?: unknown }).cause = new Error(reason)
    return error
  }

  const LONG_SELECT = `select ${'"businesses"."column", '.repeat(120)} from "businesses"`

  it('reads the cause rather than the entire SELECT statement', () => {
    const record = buildRecord(
      failedQuery(LONG_SELECT, 'invalid input syntax for type integer: "NaN"'),
      { source: 'payload.businesses' },
    )
    expect(record.message).toBe('invalid input syntax for type integer: "NaN"')
    expect(record.message).not.toContain('select')
  })

  /**
   * The grouping bug this caused. Two unrelated failures on one collection both
   * began with the same two thousand characters of column list, so they
   * truncated to an identical string and merged into a single row - one bug
   * hiding another.
   */
  it('keeps two different query failures apart', () => {
    const a = failedQuery(LONG_SELECT, 'invalid input syntax for type integer: "NaN"')
    const b = failedQuery(LONG_SELECT, 'OFFSET must not be negative')

    // Through `buildRecord`, not `fingerprint` directly - resolving the cause is
    // part of building the record, and calling the hash on a raw Error skips it.
    expect(buildRecord(a, { source: 's' }).fingerprint).not.toBe(
      buildRecord(b, { source: 's' }).fingerprint,
    )
  })

  it('keeps the short original when there is no cause worth preferring', () => {
    expect(buildRecord(new Error('Booking failed'), { source: 's' }).message).toBe('Booking failed')
  })

  it('keeps a long message when nothing better is offered', () => {
    const record = buildRecord(new Error(LONG_SELECT), { source: 's' })
    expect(record.message.length).toBeGreaterThan(0)
    expect(record.message.length).toBeLessThanOrEqual(500)
  })
})
