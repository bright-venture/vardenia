import type { EmailAdapter } from 'payload'
import { reportError } from './report'

/**
 * A ceiling on how much mail this application can send.
 *
 * Everything else that guards the mail path guards a *caller*: the auth routes
 * allow ten requests a minute per address, and Payload locks an account after
 * repeated failures. Neither bounds the total. An address rotation, a retry loop
 * in a hook, or a bug that calls `sendEmail` inside a `for` over three hundred
 * listings all sit comfortably inside every existing limit and still send
 * thousands of messages.
 *
 * Two things go wrong when that happens, and the second is the expensive one. A
 * bill arrives. And the domain's sending reputation is spent, which means
 * ordinary password resets start landing in junk for everybody, for weeks, and
 * there is no button to undo it.
 *
 * # Why it wraps the adapter rather than the helpers
 *
 * `lib/booking-email`, `hooks/notifyNewError` and the auth routes all call
 * `payload.sendEmail`, but so does Payload itself for verification and password
 * reset - and those are the ones an attacker actually aims at. Wrapping our own
 * helpers would have left the flooding case uncovered. The adapter is the one
 * point every message passes through, ours and Payload's alike.
 *
 * # Two ceilings, for two different failures
 *
 * Per recipient bounds what one mailbox can be made to receive, which is the
 * inbox-flooding attack. Global bounds the bill and the domain reputation, which
 * is the runaway-loop accident. Neither substitutes for the other: a thousand
 * messages to a thousand addresses passes the first and should not pass the
 * second.
 *
 * # In memory, per process
 *
 * The same shape and the same caveat as lib/rate-limit: across several
 * serverless instances each keeps its own tally, so the effective ceiling is
 * this number times the instance count. That is a weaker guarantee, not a
 * broken one - it turns an unbounded number into a bounded one, and it costs no
 * round trip on a path that is already sending over the network.
 */

/** An hour. Long enough that a burst cannot hide inside one window. */
const WINDOW_MS = 60 * 60_000

/**
 * Messages one address may receive an hour.
 *
 * A person who has genuinely lost their password, asked for a new verification
 * mail, and made a booking in the same hour is at three or four. Five leaves
 * room for that and stops the sixth, which is where flooding starts.
 */
const PER_RECIPIENT = 5

/**
 * Messages this application may send in total, per hour.
 *
 * Deliberately far above real volume and far below a runaway. Today the site
 * sends a handful a day. Two hundred an hour is a number nothing legitimate
 * reaches at this stage; when a real campaign needs more, raise it knowingly
 * rather than discovering the cap in production.
 *
 * If this ever fires, something is wrong. It is reported as an error event, not
 * merely counted, because a silent ceiling is how you find out weeks later that
 * half your mail stopped.
 */
const GLOBAL_PER_WINDOW = 200

/** Stop the map growing without bound on a long-lived server. */
const SWEEP_INTERVAL_MS = 10 * 60_000

interface Counter {
  count: number
  resetAt: number
}

const perRecipient = new Map<string, Counter>()
let global: Counter = { count: 0, resetAt: 0 }
let lastSweep = 0

function bump(map: Map<string, Counter>, key: string, now: number, limit: number): boolean {
  const existing = map.get(key)

  if (!existing || existing.resetAt <= now) {
    map.set(key, { count: 1, resetAt: now + WINDOW_MS })
    return true
  }

  if (existing.count >= limit) return false

  existing.count += 1
  return true
}

function sweep(now: number): void {
  if (now - lastSweep < SWEEP_INTERVAL_MS) return
  lastSweep = now

  for (const [key, counter] of perRecipient) {
    if (counter.resetAt <= now) perRecipient.delete(key)
  }
}

/** Every address a message is going to, lowercased. */
export function recipientsOf(to: unknown): string[] {
  const flatten = (value: unknown): string[] => {
    if (typeof value === 'string') return value.split(',').map((part) => part.trim())
    if (Array.isArray(value)) return value.flatMap(flatten)
    if (value && typeof value === 'object' && 'address' in value) {
      return flatten((value as { address: unknown }).address)
    }
    return []
  }

  return flatten(to)
    .map((address) => address.toLowerCase())
    .filter(Boolean)
}

export type CapVerdict =
  { allowed: true } | { allowed: false; reason: 'recipient' | 'global'; detail: string }

/**
 * Whether one message may be sent, counting it if so.
 *
 * The global counter is only advanced once the recipient check has passed, so a
 * blocked message does not consume the budget it was refused from.
 */
export function checkSendBudget(addresses: string[], now = Date.now()): CapVerdict {
  sweep(now)

  /**
   * Lowercased here as well as in `recipientsOf`, so the ceiling holds whoever
   * calls it. `Victim@Example.com` and `victim@example.com` are one mailbox, and
   * a caller that skipped the normalising step would otherwise hand a flooder
   * two buckets, then four, by varying the capitals.
   */
  const recipients = addresses.map((address) => address.toLowerCase())

  if (global.resetAt <= now) global = { count: 0, resetAt: now + WINDOW_MS }

  if (global.count >= GLOBAL_PER_WINDOW) {
    return {
      allowed: false,
      reason: 'global',
      detail: `${GLOBAL_PER_WINDOW} messages in an hour`,
    }
  }

  // Checked against every recipient before any is counted, so a message to two
  // addresses does not charge the first when the second is over its limit.
  for (const address of recipients) {
    const counter = perRecipient.get(address)
    if (counter && counter.resetAt > now && counter.count >= PER_RECIPIENT) {
      return {
        allowed: false,
        reason: 'recipient',
        detail: `${address} has had ${PER_RECIPIENT} messages in the last hour`,
      }
    }
  }

  for (const address of recipients) bump(perRecipient, address, now, PER_RECIPIENT)
  global.count += 1

  return { allowed: true }
}

/**
 * Wrap an email adapter so it cannot exceed the ceilings above.
 *
 * # An adapter is a factory, not an object
 *
 * Payload's `EmailAdapter` is a function it calls once with the payload
 * instance, which returns the thing holding `sendEmail`. So this wraps the
 * factory and decorates what it produces. Wrapping the factory as though it
 * were the adapter typechecks against nothing and fails at boot.
 *
 * # It fails open, deliberately
 *
 * If anything in the accounting throws, the message is sent. A bug in a
 * spending cap must not be able to stop every password reset on the site - that
 * turns a cost control into an outage, and the failure it prevents is a bill
 * rather than a broken product.
 */
export function withSendCap<T extends EmailAdapter<unknown>>(adapter: T): T {
  const wrapped: EmailAdapter<unknown> = (args) => {
    const initialised = adapter(args)
    const send = initialised.sendEmail

    return {
      ...initialised,
      sendEmail: async (message) => {
        let verdict: CapVerdict

        try {
          verdict = checkSendBudget(recipientsOf(message.to))
        } catch (error) {
          void reportError(error, { source: 'email.cap', extra: { stage: 'accounting' } })
          return send(message)
        }

        if (verdict.allowed) return send(message)

        /**
         * Reported rather than thrown. Throwing would fail the request that
         * asked for the mail - a signup, a booking - and the caller cannot do
         * anything useful about a ceiling. What matters is that a person finds
         * out, which is what the error event is for.
         */
        void reportError(new Error(`Email refused by the send cap: ${verdict.detail}`), {
          source: 'email.cap',
          extra: {
            reason: verdict.reason,
            subject: typeof message.subject === 'string' ? message.subject : null,
            // Recipients are deliberately absent. This lands in a collection
            // staff read, and a refused password reset should not put somebody's
            // address in it. `detail` names one address only for the recipient
            // case, where it is the whole point.
          },
        })

        return undefined
      },
    }
  }

  return wrapped as T
}

/** Test seam, matching __resetRateLimit in lib/rate-limit. */
export function __resetSendCap(): void {
  perRecipient.clear()
  global = { count: 0, resetAt: 0 }
  lastSweep = 0
}

export const SEND_CAP = { WINDOW_MS, PER_RECIPIENT, GLOBAL_PER_WINDOW } as const
