/**
 * The secrets-and-personal-data cleaner, on its own so the browser can use it
 * too (25 November 2026, for Sentry): lib/report imports node:crypto and the
 * database, which a client bundle cannot. lib/report re-exports it unchanged.
 */

/**
 * Secrets and personal data, removed before anything is stored.
 *
 * An error table is a place people paste into chat messages and screenshots, and
 * it is read by everyone with staff access rather than by whoever holds the
 * production credentials. Two things must never reach it:
 *
 *  - **Secrets.** A failed database connection puts the whole connection string,
 *    password included, in `error.message`. So does a misconfigured Resend key.
 *  - **Customer data.** An email address in a stack trace turns a debugging aid
 *    into a list of everyone who tried to book something.
 *
 * Each pattern replaces with a labelled marker rather than deleting, so the
 * shape of the message survives and it stays possible to see that an address was
 * there without seeing whose.
 */
const REDACTIONS: [RegExp, string][] = [
  // Connection strings, credentials and all. Before the generic URL rule.
  [/\b(postgres(?:ql)?|mysql|mongodb(?:\+srv)?|redis|amqp):\/\/\S+/gi, '$1://[redacted]'],
  // Any other URL carrying user:password@
  [/\b(https?:\/\/)[^/\s:@]+:[^/\s@]+@/gi, '$1[redacted]@'],
  // JWTs, which is what our own session cookie is.
  [/\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]+/g, '[jwt]'],
  // Provider keys with recognisable prefixes.
  [/\b(re|sk|pk|rk|whsec)_[A-Za-z0-9_-]{8,}/g, '$1_[redacted]'],
  /**
   * key=value forms, in query strings, headers, and JSON.
   *
   * Three shapes had to be covered and the first draft caught only one:
   *
   *   password=hunter2                 a query string
   *   Authorization: Bearer <token>    a header, where the value has a space in
   *                                    it, so stopping at whitespace redacted
   *                                    the word "Bearer" and kept the token
   *   {"password":"hunter2"}           JSON, where the key is quoted, so a
   *                                    separator match of `=` or `:` never fired
   *
   * Both misses were found by the tests below rather than by reading it back.
   *
   * The quoting is captured and put back rather than swallowed, so redacting a
   * JSON blob leaves valid JSON. The first version produced
   * `{"password=[redacted],"reference":"ABCD1234"}`, which is not parseable -
   * and `extra` is exactly the field somebody would want to parse.
   */
  [
    /(["']?)\b(password|passwd|secret|token|api[_-]?key|authorization|auth)\b\1(\s*[=:]\s*)(["']?)(?:Bearer\s+|JWT\s+)?[^\s,;&"'}\]]+\4/gi,
    '$1$2$1$3$4[redacted]$4',
  ],
  // Email addresses.
  [/\b[\w.+-]+@[\w-]+\.[\w.-]+\b/g, '[email]'],
  // Long opaque strings: reset tokens, verification tokens, session ids.
  [/\b[a-f0-9]{32,}\b/gi, '[hex]'],
]

export function redact(text: string): string {
  return REDACTIONS.reduce((out, [pattern, replacement]) => out.replace(pattern, replacement), text)
}
