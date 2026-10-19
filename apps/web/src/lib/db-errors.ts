/**
 * A Postgres unique-index refusal, however it arrived.
 *
 * Two shapes reach us. The raw driver error carries code 23505, sometimes a few
 * `cause`s deep. But a write made through Payload never arrives that way: its
 * adapter catches the 23505 and rethrows it as a `ValidationError` reading
 * "Value must be unique", with the database code gone. This used to look for
 * the code alone, so every refusal that came through Payload - a fee statement
 * drawn up twice at once, a second review - went unrecognised and surfaced as a
 * plain error instead of the answer it was written to give.
 *
 * Payload's form is told apart from an ordinary validation error by
 * `tableName`, which its adapter adds to the entries of a unique refusal and
 * which field validation never sets. Not by the message, which is translated.
 */
export function isUniqueViolation(error: unknown): boolean {
  return uniqueViolation(error) !== null
}

/**
 * What a unique refusal names, or null when the error is not one.
 *
 * For the raw driver error that is the constraint name. For Payload's form it is
 * the field path the adapter worked out: `number` for a statement number, or the
 * columns of an index Payload does not know about, like "business_id, period".
 * An empty string means a unique refusal that named nothing.
 */
export function uniqueViolation(error: unknown): string | null {
  for (let current: unknown = error, depth = 0; current && depth < 5; depth++) {
    const value = current as {
      code?: unknown
      constraint?: unknown
      name?: unknown
      data?: { errors?: { path?: unknown; tableName?: unknown }[] }
      cause?: unknown
    }
    if (value.code === '23505') {
      return typeof value.constraint === 'string' ? value.constraint : ''
    }
    if (value.name === 'ValidationError' && Array.isArray(value.data?.errors)) {
      const refusal = value.data.errors.find((entry) => typeof entry?.tableName === 'string')
      if (refusal) return typeof refusal.path === 'string' ? refusal.path : ''
    }
    current = value.cause
  }
  return null
}
