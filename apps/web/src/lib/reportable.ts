/**
 * Whether an error Payload raised is our fault or the caller's.
 *
 * # The noise this removes
 *
 * `payload.config` reports every error Payload raises into the ErrorEvents
 * collection. That included authentication failures, so production accumulated:
 *
 *     The email or password provided is incorrect.  count 3  payload.users
 *     The email or password provided is incorrect.  count 1  payload.users
 *
 * Somebody mistyping a password is not a defect. Today that is four events out
 * of three, which is merely untidy; with real customers it is a permanent
 * background hum that buries the one row that matters. The collection is read by
 * staff in the admin panel, and a log nobody can skim is a log nobody reads -
 * which was the entire justification for building it.
 *
 * # Status, not message or class name
 *
 * Matching the message would break in any other language, and matching the class
 * name is impossible in production anyway: the stored `name` for these rows is
 * `"g"`, because the bundler minified `AuthenticationError` away.
 *
 * `APIError` carries a numeric `status`, and every Payload error class extends
 * it. So the split is the HTTP one, and it is the honest line: 4xx means the
 * request was wrong, 5xx means we were.
 *
 *     401 AuthenticationError, LockedAuth, UnauthorizedError
 *     403 Forbidden, UnverifiedEmail
 *     400 ValidationError, QueryError, MissingFile, FileUploadError
 *     404 NotFound
 *     423 Locked
 *     500 APIError, InvalidConfiguration, InvalidSchema, ErrorDeletingFile,
 *         FileRetrievalError
 *
 * # Anything without a status is still reported
 *
 * A plain `Error` has no status, and that is exactly the class of failure worth
 * keeping: the crash nobody modelled. The `favicon.ico` locale bug reached the
 * collection that way -
 *
 *     invalid input value for enum payload._locales: "favicon.ico"
 *
 * - and it was a real bug, found because it was recorded. So the default is to
 * report, and only a recognised client fault is dropped.
 *
 * # What this deliberately gives up
 *
 * Repeated failed logins stop being visible here, and that is a genuine loss of
 * one weak signal about brute force. It is the right trade: the error collection
 * is not a security log, and treating it as one is why it was filling with
 * things that are not errors. Rate limiting already bounds the attempt rate, and
 * Payload locks an account after repeated failures. If attempt monitoring is
 * wanted later it belongs in its own place, with its own retention, not mixed in
 * with crashes.
 */

/** The lowest and highest client-fault statuses, inclusive. */
const CLIENT_FAULT_MIN = 400
const CLIENT_FAULT_MAX = 499

/**
 * True when the error represents something broken, rather than a request that
 * was refused for a good reason.
 *
 * Errs towards reporting. An unrecognised shape, a missing status, a status that
 * is not a number: all report. Losing a real crash is worse than keeping a row
 * that turns out to be dull, so every uncertain case resolves that way.
 */
export function isApplicationFault(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return true
  if (!('status' in error)) return true

  const { status } = error as { status: unknown }
  if (typeof status !== 'number' || !Number.isFinite(status)) return true

  return !(status >= CLIENT_FAULT_MIN && status <= CLIENT_FAULT_MAX)
}

export const CLIENT_FAULT_RANGE = { min: CLIENT_FAULT_MIN, max: CLIENT_FAULT_MAX } as const
