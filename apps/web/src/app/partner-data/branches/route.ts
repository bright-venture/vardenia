import { getPayload } from 'payload'
import { branchRequestSchema } from '@vardenia/core'
import config from '../../../payload.config'
import { BUSINESS_USER_COLLECTION, ownedBusinessIds } from '../../../access/index'
import { siteOrigin } from '../../../lib/auth-email'
import { sameOrigin } from '../../../lib/billing-auth'
import { createBranch } from '../../../lib/branches'
import { branchRequestEmails } from '../../../lib/branch-email'
import { teamAlertAddress } from '../../../lib/place-submission-email'
import { withRateLimit } from '../../../lib/rate-limit'
import { reportError } from '../../../lib/report'

/**
 * A partner adds a branch of a restaurant they own (Task 9). JSON in, JSON
 * out: `POST /partner-data/branches`.
 *
 * lib/branches is the access rule and does the work in one transaction; this
 * is the door. Order, cheapest refusal first: rate limit, same origin, JSON
 * content type and size, then who is asking (anonymous 401; a customer or a
 * staff account 403 - staff add listings in the admin, never as a partner),
 * then the body (core branchRequestSchema: strict, an unknown key is refused
 * with 400 naming it), then a first ownership check on the session's own
 * listings (404, the same answer as for a listing that does not exist, so no
 * existence is told). The service checks ownership again on the partner's
 * row as stored, inside its transaction.
 *
 * The emails are sent after the branch exists and cannot undo it: a failure
 * is reported and the partner still gets a 201.
 *
 * Not under /api (Payload's) and excluded from locale routing in proxy.ts.
 * Under its own -data prefix, so the dashboard keeps every /partner/* path
 * for pages.
 */

export const dynamic = 'force-dynamic'

/**
 * Per minute, per address, counted in Postgres. The daily limit per partner
 * (core MAX_NEW_BRANCHES_PER_DAY) is the real bound; this stops a loop.
 */
const BRANCH_REQUESTS_PER_WINDOW = 10

/** A branch request is a few hundred bytes; contact and hours stay well under this. */
const MAX_BODY_BYTES = 16 * 1024

const json = (body: unknown, status = 200) =>
  Response.json(body, { status, headers: { 'cache-control': 'no-store' } })

export const POST = withRateLimit(
  async (request: Request) => {
    if (!sameOrigin(request)) {
      return json({ ok: false, message: 'Cross-site request refused.' }, 403)
    }
    if (!(request.headers.get('content-type') ?? '').toLowerCase().includes('application/json')) {
      return json({ ok: false, message: 'Send the branch as JSON.' }, 415)
    }
    const length = Number(request.headers.get('content-length') ?? '0')
    if (Number.isFinite(length) && length > MAX_BODY_BYTES) {
      return json({ ok: false, message: 'That request is too large.' }, 413)
    }

    const payload = await getPayload({ config })
    const { user } = await payload
      .auth({ headers: request.headers })
      .catch(() => ({ user: null }) as { user: null })
    if (!user) return json({ ok: false, message: 'Please sign in to your partner account.' }, 401)
    if (user.collection !== BUSINESS_USER_COLLECTION) {
      return json({ ok: false, message: 'Only a partner account can add a branch.' }, 403)
    }

    const raw = await request.text().catch(() => '')
    if (raw.length > MAX_BODY_BYTES) {
      return json({ ok: false, message: 'That request is too large.' }, 413)
    }
    let body: unknown
    try {
      body = JSON.parse(raw)
    } catch {
      return json({ ok: false, message: 'Send the branch as JSON.' }, 400)
    }

    const parsed = branchRequestSchema.safeParse(body)
    if (!parsed.success) {
      return json(
        {
          ok: false,
          code: 'invalid',
          message: 'Please check the branch details.',
          issues: parsed.error.issues.map((issue) => ({
            path: issue.path.join('.'),
            message: issue.message,
            ...('keys' in issue ? { keys: issue.keys } : {}),
          })),
        },
        400,
      )
    }
    const input = parsed.data

    if (!ownedBusinessIds(user).map(String).includes(String(input.sourceListingId))) {
      return json(
        { ok: false, code: 'not-found', message: 'That listing was not found among yours.' },
        404,
      )
    }

    const account = user as unknown as {
      id: number
      email?: unknown
      name?: unknown
      phone?: unknown
    }
    const partner = {
      id: Number(account.id),
      email: String(account.email ?? ''),
      name: String(account.name ?? ''),
      phone: typeof account.phone === 'string' ? account.phone : null,
    }

    const outcome = await createBranch({ payload, partner, input })
    if (!outcome.ok) {
      return json({ ok: false, code: outcome.code, message: outcome.message }, outcome.status)
    }

    // Best effort from here: the branch exists, whatever happens.
    const emails = branchRequestEmails({
      listingId: outcome.listingId,
      branchName: input.name,
      sourceName: outcome.sourceName,
      brandName: outcome.brandName,
      brandCreated: outcome.brandCreated,
      governorate: input.governorate,
      city: input.city,
      address: input.address,
      partnerName: partner.name || partner.email,
      partnerEmail: partner.email,
      locale: input.locale ?? 'en',
      origin: siteOrigin(),
    })
    const extra = { listingId: outcome.listingId, partnerId: partner.id }
    const team = teamAlertAddress()
    if (team) {
      try {
        await payload.sendEmail({ to: team, subject: emails.team.subject, html: emails.team.html })
      } catch (error) {
        await reportError(error, { source: 'partner.branch.email.team', extra })
      }
    }
    if (partner.email) {
      try {
        await payload.sendEmail({
          to: partner.email,
          subject: emails.partner.subject,
          html: emails.partner.html,
        })
      } catch (error) {
        await reportError(error, { source: 'partner.branch.email.partner', extra })
      }
    }

    return json({ ok: true, listingId: outcome.listingId, brandId: outcome.brandId }, 201)
  },
  BRANCH_REQUESTS_PER_WINDOW,
  { shared: true },
)
