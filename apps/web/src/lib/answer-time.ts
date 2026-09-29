import { getPayload } from 'payload'
import config from '../payload.config'

/**
 * "Usually answers within 3 hours", for a listing that confirms requests by hand.
 *
 * The honest version of a booking site's urgency line. Rather than telling a
 * guest a place is nearly full, it tells them how long the wait for an answer
 * usually is, which is the thing a request-based booking actually asks them to
 * put up with. It also nudges a slow venue, because the number is public.
 *
 * Worked out from `answeredAt` (hooks/stampAnsweredAt), which only a venue or
 * staff answering sets, so automatic confirmations and guest cancellations
 * never flatter or spoil it.
 */

/** Look this far back: a venue that got faster should get credit for it. */
export const ANSWER_WINDOW_DAYS = 90

/** Fewer answered requests than this is an anecdote, not "usually". */
export const ANSWER_MIN_SAMPLE = 3

/** Past a day, the line would discourage more than inform, so it is not shown. */
export const ANSWER_MAX_HOURS = 24

const HOUR = 3_600_000

/**
 * The typical wait, in whole hours rounded up (so "within" is true of the
 * median), or null when there are too few answers or it is slower than a day.
 *
 * The median rather than the mean: one request that sat over a weekend should
 * not turn a venue that answers in an hour into one that answers in nine.
 */
export function typicalAnswerHours(
  pairs: { createdAt?: string | null; answeredAt?: string | null }[],
): number | null {
  const waits = pairs
    .map((pair) => {
      const asked = Date.parse(String(pair.createdAt ?? ''))
      const answered = Date.parse(String(pair.answeredAt ?? ''))
      return Number.isFinite(asked) && Number.isFinite(answered) && answered >= asked
        ? answered - asked
        : null
    })
    .filter((wait): wait is number => wait !== null)
    .sort((a, b) => a - b)

  if (waits.length < ANSWER_MIN_SAMPLE) return null

  const middle = Math.floor(waits.length / 2)
  const median = waits.length % 2 === 1 ? waits[middle]! : (waits[middle - 1]! + waits[middle]!) / 2

  const hours = Math.max(1, Math.ceil(median / HOUR))
  return hours <= ANSWER_MAX_HOURS ? hours : null
}

/** The typical wait for one listing, read from its recent answered requests. */
export async function listingAnswerHours(businessId: number | string): Promise<number | null> {
  const payload = await getPayload({ config })
  const since = new Date(Date.now() - ANSWER_WINDOW_DAYS * 86_400_000).toISOString()

  const result = await payload
    .find({
      collection: 'bookings',
      where: {
        and: [
          { business: { equals: businessId } },
          { answeredAt: { exists: true } },
          { createdAt: { greater_than: since } },
        ],
      },
      select: { createdAt: true, answeredAt: true },
      sort: '-createdAt',
      limit: 50,
      depth: 0,
      // Guests cannot read bookings; only a number leaves this function.
      overrideAccess: true,
    })
    .catch(() => null)

  return result ? typicalAnswerHours(result.docs as never) : null
}
