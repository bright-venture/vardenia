import { headers as nextHeaders } from 'next/headers'
import { getPayload } from 'payload'
import { canDispute, type DisputeOutcome, type StatementStatus } from '@vardenia/core'
import config from '../../../payload.config'
import { BUSINESS_USER_COLLECTION, ownedBusinessIds } from '../../../access/index'
import { RATE_LIMIT, withRateLimit } from '../../../lib/rate-limit'
import { reportError } from '../../../lib/report'

/**
 * Where a venue questions one line of its statement.
 *
 *   POST /billing/dispute  { statement, line, reason }
 *
 * The only write a venue can make to a statement. Statements are closed to
 * owners in Payload, so this route is the door, and it checks everything the
 * collection cannot express for one line of one array: the statement is the
 * venue's own, it has been sent, the seven days are not over, and this line has
 * not been questioned already. Then it marks that line and nothing else.
 *
 * A questioned line stays on the total until the team decides. Upheld takes it
 * off; rejected keeps it. See packages/core/src/booking-fees.
 *
 * JSON, like /reviews: a cross-site form cannot send it without a preflight,
 * and refusals carry a `code` the page turns into a message in its own language.
 */

export const dynamic = 'force-dynamic'

const json = (body: unknown, status = 200) =>
  Response.json(body, { status, headers: { 'cache-control': 'no-store' } })

interface Line {
  id?: string | null
  disputeOutcome?: DisputeOutcome | null
  disputeReason?: string | null
  disputedAt?: string | null
}

interface StatementDoc {
  id: number
  business?: unknown
  status: StatementStatus
  disputeUntil?: string | null
  lines?: Line[] | null
}

const idOf = (value: unknown): string | number | null => {
  if (typeof value === 'string' || typeof value === 'number') return value
  const id = (value as { id?: unknown } | null)?.id
  return typeof id === 'string' || typeof id === 'number' ? id : null
}

export const POST = withRateLimit(
  async (request: Request) => {
    let body: { statement?: unknown; line?: unknown; reason?: unknown }
    try {
      body = await request.json()
    } catch {
      return json({ ok: false, code: 'invalid' }, 400)
    }

    const statementId = Number(body.statement)
    const lineId = typeof body.line === 'string' ? body.line : ''
    const reason = typeof body.reason === 'string' ? body.reason.trim().slice(0, 300) : ''
    if (!Number.isInteger(statementId) || !lineId || reason.length < 3) {
      return json({ ok: false, code: 'invalid' }, 400)
    }

    const payload = await getPayload({ config })
    const auth = await payload
      .auth({ headers: await nextHeaders() })
      .catch(() => ({ user: null }) as { user: null })
    const owner = auth.user
    if (!owner || owner.collection !== BUSINESS_USER_COLLECTION) {
      return json({ ok: false, code: 'signed-out' }, 401)
    }

    const statement = (await payload
      .findByID({ collection: 'statements', id: statementId, depth: 0, overrideAccess: true })
      .catch(() => null)) as StatementDoc | null

    // Someone else's statement answers exactly like one that does not exist.
    const owned = ownedBusinessIds(owner).map(String)
    const businessId = idOf(statement?.business)
    if (!statement || businessId === null || !owned.includes(String(businessId))) {
      return json({ ok: false, code: 'not-found' }, 404)
    }

    const lines = statement.lines ?? []
    const line = lines.find((entry) => entry.id === lineId)
    if (!line) return json({ ok: false, code: 'not-found' }, 404)

    if (!canDispute(statement, line, new Date())) {
      return json({ ok: false, code: 'closed' }, 409)
    }

    try {
      await payload.update({
        collection: 'statements',
        id: statement.id,
        data: {
          lines: lines.map((entry) =>
            entry.id === lineId
              ? {
                  ...entry,
                  disputeOutcome: 'open',
                  disputeReason: reason,
                  disputedAt: new Date().toISOString(),
                }
              : entry,
          ),
        },
        depth: 0,
        overrideAccess: true,
        context: { skipStatementEmail: true },
      })
    } catch (error) {
      await reportError(error, { source: 'billing.dispute', extra: { statement: statement.id } })
      return json({ ok: false, code: 'error' }, 500)
    }

    return json({ ok: true })
  },
  RATE_LIMIT.WRITE_PER_WINDOW,
  { shared: true },
)
