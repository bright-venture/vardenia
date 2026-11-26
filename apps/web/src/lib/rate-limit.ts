import { clientIp } from './scan-guard'

/**
 * A ceiling on how *often* one caller may hit the API.
 *
 * The companion to api-limits.ts. That bounds the cost of a single request;
 * this bounds how many of them arrive. Neither is sufficient alone: capped
 * requests issued in a tight loop still exhaust a ten-connection pool, and a
 * generous rate on unbounded requests is no protection at all.
 *
 * Deliberately NOT in middleware. Next runs middleware on the Edge runtime,
 * where module state lives in a short-lived isolate that may be recreated
 * between requests - a counter there would reset constantly and count almost
 * nothing. A route wrapper runs in the Node server, where module state persists
 * for the life of the process, which is what makes counting possible at all.
 *
 * Same caveat as scan-guard, and for the same reason: this state is per
 * process. On one long-lived server it is accurate. Across several instances
 * each keeps its own tally, so the effective limit multiplies by the instance
 * count. That is a weaker guarantee, not a broken one - the point is bounding
 * a scraper, and a limit that is three times too generous still does that.
 *
 * # Where that weaker guarantee is not good enough, and where it is
 *
 * The deployment shape is known now: Netlify functions, several warm at once.
 * So the choice is made per endpoint rather than deferred.
 *
 * Counted in Postgres (`shared: true`), because repeating the request is the
 * attack and a per-instance tally is not a limit:
 *
 *   - every auth path - login, forgot-password, reset-password, unlock, verify
 *     (see app/(payload)/api/[...slug])
 *   - the five /auth routes, which check passwords or send mail
 *   - /booking/request, which writes a row and sends mail
 *
 * Counted in memory, deliberately:
 *
 *   - REST and GraphQL reads. The data is public, `withApiLimits` caps the page
 *     size and `graphQL.maxComplexity` caps the query, so the worst outcome is
 *     a scraper reading the directory faster than we would like - which the CDN
 *     absorbs anyway. A database round trip on every public read would cost more
 *     than the abuse does.
 *   - /booking/availability, a read with no side effect.
 *
 * The scan guard is the remaining one, and it stays per-instance on purpose:
 * see the note on /g/ in `withRateLimit` below.
 */

/** Fixed window. Simple to reason about and cheap to keep. */
const WINDOW_MS = 60_000

/**
 * Requests per window, per address.
 *
 * Chosen to sit far above a person and far below a script. The admin panel is
 * chatty - a list view with relationship fields can fire a dozen requests - and
 * a whole office shares one address behind NAT, so the budget has to absorb
 * several staff working at once. Five requests a second sustained is not a
 * person; it is something automated.
 *
 * If this ever fires for real staff, raise it. A false positive here blocks
 * someone from doing their job, which is worse than a scraper getting a
 * slightly better rate.
 */
const MAX_PER_WINDOW = 300

/**
 * The budget for anything that costs something to be wrong about.
 *
 * 300 a minute was chosen for the admin panel, which fires a dozen requests to
 * render one list view. Applying the same number to the auth surface meant 300
 * password guesses a minute from one address, and - the one that actually bites
 * - 300 password-reset requests a minute aimed at one mailbox. Each of those
 * sends a real email, so the endpoint was a way to flood somebody's inbox and
 * burn the sending reputation of the domain at the same time.
 *
 * Ten a minute is far above a person who has forgotten their password twice and
 * far below anything automated. Payload's own `maxLoginAttempts` and `lockTime`
 * still guard the guessing case per account; this guards the cost per caller.
 */
const AUTH_PER_WINDOW = 10

/**
 * The ceiling for one internet connection across every email (21 November
 * 2026, authentication audit step 2).
 *
 * Sign-in, sign-up, forgot password, reset and verify used to share one counter
 * of AUTH_PER_WINDOW per address. Many people can share one address (a mobile
 * carrier, hotel or office Wi-Fi), so the eleventh person signing in within a
 * minute was refused with the right password. Now each email gets its own
 * AUTH_PER_WINDOW from that address (see checkRatePerEmail), and the address as
 * a whole gets this many: enough for a busy lobby, still far too few to try one
 * password on hundreds of accounts.
 */
const AUTH_CONNECTION_PER_WINDOW = 60

/**
 * Writes that cost something to be wrong about, but are not sign-ins.
 *
 * Its own number, and that is the whole point: buckets are keyed by
 * `${budget}:${ip}` (see checkRate), so reusing `AUTH_PER_WINDOW` here would put
 * bookings and logins in one counter - a customer booking four tables would eat
 * the allowance that lets them sign in. Two numbers, two buckets.
 *
 * Twenty a minute is far above somebody booking dinner and far below a script
 * aiming confirmation emails at a mailbox. `/booking/request` already demands a
 * verified account, so this is not the first line of defence; it bounds what one
 * account can cost once it exists.
 */
const WRITE_PER_WINDOW = 20

/**
 * The ceiling for one internet connection on one form, across every account
 * (22 November 2026).
 *
 * Every form that writes used to share one counter of WRITE_PER_WINDOW per
 * address: twenty Questions sends used up Event Staff, bookings, saves and
 * reviews for everyone on that connection. Lebanese carriers put many phones
 * behind one address, and a hotel lobby or restaurant shares one Wi-Fi, so a
 * busy evening could refuse a real guest's booking. Now each form has its own
 * counters (see checkRatePerAccount): WRITE_PER_WINDOW per signed-in account,
 * and this many per connection, enough for a busy lobby and still far too few
 * for one machine running dozens of accounts.
 */
const WRITE_CONNECTION_PER_WINDOW = 120

/** Stop the map growing without bound on a long-lived server. */
const SWEEP_INTERVAL_MS = 5 * 60_000

interface Window {
  count: number
  resetAt: number
}

const windows = new Map<string, Window>()
let lastSweep = 0

function sweep(now: number) {
  if (now - lastSweep < SWEEP_INTERVAL_MS) return
  lastSweep = now

  for (const [key, window] of windows) {
    if (window.resetAt <= now) windows.delete(key)
  }
}

export interface RateVerdict {
  allowed: boolean
  limit: number
  remaining: number
  /** Seconds until the window resets. Sent as Retry-After when blocked. */
  retryAfter: number
}

/**
 * Count one request against an address and say whether it may proceed.
 *
 * A caller we cannot identify - no proxy headers at all - is allowed through
 * rather than lumped into a single shared bucket. Sharing one counter across
 * every unidentifiable caller would let one script deny service to all of them,
 * which turns a mitigation into a vulnerability.
 */
export function checkRate(
  headers: Headers,
  now = Date.now(),
  budget = MAX_PER_WINDOW,
): RateVerdict {
  sweep(now)

  const ip = clientIp(headers)
  const unlimited: RateVerdict = {
    allowed: true,
    limit: budget,
    remaining: budget,
    retryAfter: 0,
  }
  if (!ip) return unlimited

  /**
   * Counted per budget, not per address alone.
   *
   * A shared counter would let the chatty admin panel spend the small auth
   * budget on a staff member's behalf, and then lock them out of signing in.
   * Two buckets keep an expensive endpoint tight without making the cheap ones
   * unusable.
   */
  return countInMemory(`${budget}:${ip}`, now, budget)
}

/** One request against a named in-memory counter. */
function countInMemory(key: string, now: number, budget: number): RateVerdict {
  sweep(now)
  const existing = windows.get(key)

  if (!existing || existing.resetAt <= now) {
    windows.set(key, { count: 1, resetAt: now + WINDOW_MS })
    return { allowed: true, limit: budget, remaining: budget - 1, retryAfter: 0 }
  }

  existing.count += 1

  const retryAfter = Math.max(1, Math.ceil((existing.resetAt - now) / 1000))
  const remaining = Math.max(0, budget - existing.count)

  return {
    allowed: existing.count <= budget,
    limit: budget,
    remaining,
    retryAfter,
  }
}

/** Standard headers, so a well-behaved client can back off before being blocked. */
export function rateHeaders(verdict: RateVerdict): Record<string, string> {
  return {
    'x-ratelimit-limit': String(verdict.limit),
    'x-ratelimit-remaining': String(verdict.remaining),
  }
}

export function tooManyRequests(verdict: RateVerdict): Response {
  return new Response('Too many requests. Slow down and try again shortly.', {
    status: 429,
    headers: {
      ...rateHeaders(verdict),
      'retry-after': String(verdict.retryAfter),
      'content-type': 'text/plain; charset=utf-8',
    },
  })
}

type Handler = (request: Request, context: never) => Promise<Response>

/**
 * The same decision, counted in Postgres instead of in this process.
 *
 * # Why the auth budget needs it and the general budget does not
 *
 * The Map above is per instance. On Netlify each warm container holds its own,
 * so the real budget is the configured one multiplied by however many are
 * running, and an attacker gets a fresh allowance by arriving at a different
 * one. For a budget of 300 general requests that is untidy. For a budget of 10
 * login attempts it is the difference between a limit and a decoration.
 *
 * The cost is one round trip, which on the current deployment is about 200ms.
 * That is acceptable on a login and would not be on every API read, which is why
 * this is opt-in rather than the default.
 *
 * # It fails open
 *
 * A database that cannot answer falls back to the in-memory count rather than
 * refusing. A rate limiter that turns a database outage into "nobody can sign
 * in, including staff, including to fix it" has converted a availability
 * problem into a worse one. The in-memory counter is weak, not absent, so the
 * fallback is a degraded limit rather than none.
 */
async function checkRateShared(
  headers: Headers,
  now: number,
  budget: number,
): Promise<RateVerdict> {
  const ip = clientIp(headers)
  const unlimited: RateVerdict = { allowed: true, limit: budget, remaining: budget, retryAfter: 0 }
  if (!ip) return unlimited

  const { payload, store } = await loadStore()
  return countShared(payload, store, store.bucketKey(budget, ip), `${budget}:${ip}`, now, budget)
}

async function loadStore() {
  const [{ getPayload }, config, store] = await Promise.all([
    import('payload'),
    import('../payload.config').then((m) => m.default),
    import('./rate-limit-store'),
  ])
  return { payload: await getPayload({ config }), store }
}

type Store = Awaited<ReturnType<typeof loadStore>>['store']
type LoadedPayload = Awaited<ReturnType<typeof loadStore>>['payload']

/** One request against a named counter in Postgres, or in memory if it cannot answer. */
async function countShared(
  payload: LoadedPayload,
  store: Store,
  storeKey: string,
  memoryKey: string,
  now: number,
  budget: number,
): Promise<RateVerdict> {
  const outcome = await store.hit(payload, storeKey, WINDOW_MS, now)

  // Unreachable database. See the note above on failing open.
  if (!outcome) return countInMemory(memoryKey, now, budget)

  /**
   * Swept from the request that happens to notice, roughly once per window per
   * instance. There is no scheduler on this platform, and a dedicated endpoint
   * would be another thing to remember to call.
   */
  if (Math.random() < 0.01) void store.sweepExpired(payload)

  const retryAfter = Math.max(1, Math.ceil((outcome.resetAt - now) / 1000))

  return {
    allowed: outcome.count <= budget,
    limit: budget,
    remaining: Math.max(0, budget - outcome.count),
    retryAfter,
  }
}

/**
 * The email a sign-in type request is about, lowercased, or '' when it has none
 * (a reset or verify link, signing out). Read from a copy of the body, so the
 * handler still gets the original.
 */
export async function emailOf(request: Request): Promise<string> {
  if (request.method !== 'POST') return ''
  if (!(request.headers.get('content-type') ?? '').includes('application/json')) return ''
  const body = (await request
    .clone()
    .json()
    .catch(() => null)) as { email?: unknown } | null
  const email = body?.email
  return typeof email === 'string' ? email.trim().toLowerCase().slice(0, 320) : ''
}

/**
 * Two counters for sign-in type requests (21 November 2026): AUTH_PER_WINDOW
 * per connection and email, and AUTH_CONNECTION_PER_WINDOW per connection.
 * Refused when either is over. Requests with no email share the connection's
 * own AUTH_PER_WINDOW counter, as before. Both keys are hashed in the store
 * (counterKey), so no address is kept as written.
 */
export async function checkRatePerEmail(request: Request, now: number): Promise<RateVerdict> {
  const ip = clientIp(request.headers)
  const unlimited: RateVerdict = {
    allowed: true,
    limit: AUTH_PER_WINDOW,
    remaining: AUTH_PER_WINDOW,
    retryAfter: 0,
  }
  if (!ip) return unlimited

  const email = await emailOf(request)
  const { payload, store } = await loadStore()
  const personKey = store.counterKey('auth-email', `${ip}|${email}`)
  const person = await countShared(
    payload,
    store,
    personKey,
    `auth-email:${personKey}`,
    now,
    AUTH_PER_WINDOW,
  )
  const connection = await countShared(
    payload,
    store,
    store.bucketKey(AUTH_CONNECTION_PER_WINDOW, ip),
    `${AUTH_CONNECTION_PER_WINDOW}:${ip}`,
    now,
    AUTH_CONNECTION_PER_WINDOW,
  )

  if (!person.allowed) return person
  if (!connection.allowed) return connection
  return person.remaining <= connection.remaining ? person : connection
}

/** The signed-in person, as "collection:id", or null. Never throws. */
async function accountOf(payload: LoadedPayload, headers: Headers): Promise<string | null> {
  try {
    const auth = (payload as { auth?: (args: { headers: Headers }) => Promise<unknown> }).auth
    if (typeof auth !== 'function') return null
    const result = (await auth.call(payload, { headers })) as {
      user?: { id?: unknown; collection?: unknown } | null
    }
    const user = result?.user
    if (!user || user.id === undefined || user.id === null) return null
    return `${String(user.collection ?? 'user')}:${String(user.id)}`
  } catch {
    return null
  }
}

/**
 * The counters for one form that writes something (22 November 2026).
 *
 * Each form (`action`) has its own counters, so one cannot use up another.
 *
 *  - `perAccount` and signed in: WRITE_PER_WINDOW per account, and
 *    WRITE_CONNECTION_PER_WINDOW per connection; refused when either is over,
 *    as for sign-in (checkRatePerEmail).
 *  - Otherwise (the Questions form, a "Did you go?" or receipt link opened while
 *    signed out): WRITE_PER_WINDOW per connection.
 *
 * Counted in the database, like the other shared limits, and keyed by hashes
 * (counterKey), so no address or account is stored as written.
 */
export async function checkRatePerAccount(
  request: Request,
  now: number,
  action: string,
  perAccount: boolean,
  /** A form that is polled or sends several files needs more than WRITE_PER_WINDOW. */
  perMinute: number = WRITE_PER_WINDOW,
): Promise<RateVerdict> {
  const ip = clientIp(request.headers)
  const unlimited: RateVerdict = {
    allowed: true,
    limit: perMinute,
    remaining: perMinute,
    retryAfter: 0,
  }
  if (!ip) return unlimited

  const { payload, store } = await loadStore()
  const account = perAccount ? await accountOf(payload, request.headers) : null

  if (!account) {
    const key = store.counterKey(`write:${action}`, ip)
    return countShared(payload, store, key, `write:${action}:${key}`, now, perMinute)
  }

  const personKey = store.counterKey(`write-account:${action}`, account)
  const person = await countShared(
    payload,
    store,
    personKey,
    `write-account:${action}:${personKey}`,
    now,
    WRITE_PER_WINDOW,
  )
  const connectionKey = store.counterKey(`write-connection:${action}`, ip)
  const connection = await countShared(
    payload,
    store,
    connectionKey,
    `write-connection:${action}:${connectionKey}`,
    now,
    WRITE_CONNECTION_PER_WINDOW,
  )

  if (!person.allowed) return person
  if (!connection.allowed) return connection
  return person.remaining <= connection.remaining ? person : connection
}

/**
 * One named counter in the database for a secret value (a session token): at
 * most `budget` a minute per `action` and value. The value is hashed with the
 * server secret (counterKey), so the token is never stored. Fails open to the
 * in-memory count like the others.
 */
export async function checkRatePerKey(
  action: string,
  value: string,
  budget: number,
  now = Date.now(),
): Promise<RateVerdict> {
  const { payload, store } = await loadStore()
  const key = store.counterKey(`key:${action}`, value)
  return countShared(payload, store, key, `key:${action}:${key}`, now, budget)
}

/**
 * Wrap a handler so repeated calls from one address are bounded.
 *
 * Pass `{ shared: true }` for anything an attacker would want to repeat -
 * signing in, asking for a reset, creating an account. That counts in Postgres
 * so the budget holds across instances; see checkRateShared.
 *
 * Never apply this to `/g/`. A printed code has to resolve for everyone, every
 * time, for as long as the paper is in circulation - a coach party of forty
 * scanning the same table tent from one hotel's Wi-Fi is a success, not an
 * attack. That route has its own protection in scan-guard, which limits what
 * gets *counted* and never what works.
 */
export function withRateLimit(
  handler: Handler,
  budget = MAX_PER_WINDOW,
  {
    shared = false,
    perEmail = false,
    action,
    perAccount = false,
    perMinute,
  }: {
    shared?: boolean
    perEmail?: boolean
    /** A form that writes: its own counters, always shared. See checkRatePerAccount. */
    action?: string
    perAccount?: boolean
    /** With `action` and no account: requests a minute per connection (default WRITE_PER_WINDOW). */
    perMinute?: number
  } = {},
): Handler {
  return async (request, context) => {
    const now = Date.now()
    // `perEmail`: the two sign-in counters, always shared. See checkRatePerEmail.
    const verdict = perEmail
      ? await checkRatePerEmail(request, now)
      : action
        ? await checkRatePerAccount(request, now, action, perAccount, perMinute)
        : shared
          ? await checkRateShared(request.headers, now, budget)
          : checkRate(request.headers, now, budget)
    if (!verdict.allowed) return tooManyRequests(verdict)

    return withHeaders(await handler(request, context), rateHeaders(verdict))
  }
}

/**
 * The response with these headers added.
 *
 * `Response.redirect()` returns a response whose headers are immutable, and
 * setting one throws "TypeError: immutable". The guest's "Yes, I went"
 * (/booking/attendance/answer) and the receipt form (/booking/receipt) both
 * answer with a redirect, so both failed with a 500 after doing their work's
 * redirect step (found on staging, 16 November 2026). Such a response is copied
 * into one that can take headers: same status, same body, same headers.
 */
function withHeaders(response: Response, extra: Record<string, string>): Response {
  try {
    for (const [key, value] of Object.entries(extra)) response.headers.set(key, value)
    return response
  } catch {
    const copy = new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: new Headers(response.headers),
    })
    for (const [key, value] of Object.entries(extra)) copy.headers.set(key, value)
    return copy
  }
}

/** Test seam. The map is module state, which a test must be able to reset. */
export function __resetRateLimit() {
  windows.clear()
  lastSweep = 0
}

export const RATE_LIMIT = {
  WINDOW_MS,
  MAX_PER_WINDOW,
  AUTH_PER_WINDOW,
  AUTH_CONNECTION_PER_WINDOW,
  WRITE_PER_WINDOW,
  WRITE_CONNECTION_PER_WINDOW,
} as const
