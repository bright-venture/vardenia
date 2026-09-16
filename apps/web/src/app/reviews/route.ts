import { headers as nextHeaders } from 'next/headers'
import { getPayload } from 'payload'
import { reviewRequestSchema, fieldErrors } from '@vardenia/core'
import config from '../../payload.config'
import { CUSTOMER_COLLECTION } from '../../access/index'
import { createReview } from '../../lib/review-service'
import { RATE_LIMIT, withRateLimit } from '../../lib/rate-limit'
import { reportError } from '../../lib/report'

/**
 * The public review endpoint - the one door a review comes through.
 *
 * `reviews.create` is closed in Payload precisely so this is the only way in: a
 * generic REST create would let anyone with an account review a place they never
 * went, or set a review live without approval. Here the caller is checked to be
 * a verified customer, and lib/review-service proves the completed booking and
 * the one-per-listing rule before writing a pending row.
 *
 * Not under /api, which is Payload's. Refusals carry a `code` the form maps to a
 * localised message, rather than prose, since the messages are few and want to
 * be sayable in ten languages.
 */

export const dynamic = 'force-dynamic'

const json = (body: unknown, status = 200) =>
  Response.json(body, { status, headers: { 'cache-control': 'no-store' } })

const STATUS_FOR = {
  'not-eligible': 403,
  'already-reviewed': 409,
  'not-found': 404,
  error: 500,
} as const

export const POST = withRateLimit(
  async (request: Request) => {
    let body: unknown
    try {
      body = await request.json()
    } catch {
      return json({ ok: false, message: 'Expected a JSON body.' }, 400)
    }

    const parsed = reviewRequestSchema.safeParse(body)
    if (!parsed.success) {
      return json({ ok: false, errors: fieldErrors(parsed.error) }, 400)
    }

    const payload = await getPayload({ config })

    const auth = await payload
      .auth({ headers: await nextHeaders() })
      .catch(() => ({ user: null }) as { user: null })

    const customer = auth.user
    if (!customer || customer.collection !== CUSTOMER_COLLECTION) {
      return json({ ok: false, code: 'signed-out' }, 401)
    }
    if (!customer._verified) {
      return json({ ok: false, code: 'unverified' }, 403)
    }

    const customerId = Number(customer.id)
    if (!Number.isInteger(customerId)) {
      await reportError(new Error(`Customer id is not an integer: ${String(customer.id)}`), {
        source: 'review.request',
        path: '/reviews',
      })
      return json({ ok: false, code: 'error' }, 500)
    }

    const outcome = await createReview({
      payload,
      request: parsed.data,
      customerId,
      customerName: String((customer as { name?: unknown }).name ?? ''),
    })

    if (!outcome.ok) {
      if (outcome.code === 'error') {
        await reportError(new Error('review create failed'), {
          source: 'review.request',
          path: '/reviews',
          group: 'review.request.unexpected',
          extra: { business: parsed.data.business },
        })
      }
      return json({ ok: false, code: outcome.code }, STATUS_FOR[outcome.code])
    }

    return json({ ok: true }, 201)
  },
  RATE_LIMIT.WRITE_PER_WINDOW,
  { shared: true },
)
