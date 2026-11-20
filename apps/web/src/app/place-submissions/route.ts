import { getPayload } from 'payload'
import config from '../../payload.config'
import { siteOrigin } from '../../lib/auth-email'
import { createPlaceSubmission } from '../../lib/place-submission'
import { placeSubmissionEmails } from '../../lib/place-submission-email'
import {
  bodySizeProblem,
  parseSubmission,
  readForm,
  statusForOutcome,
} from '../../lib/place-submission-request'
import { withRateLimit } from '../../lib/rate-limit'
import { reportError } from '../../lib/report'
import { clientIp } from '../../lib/scan-guard'
import { verifyTurnstile } from '../../lib/turnstile'

/**
 * The public "add your place" endpoint: the only way an anonymous visitor
 * creates a listing. `businesses.create` and `media.create` stay staff-only;
 * lib/place-submission is the access rule, and this is the door to it.
 *
 * Not under /api, which Payload owns (see /booking/request).
 *
 * Order, cheapest refusal first: rate limit, body size (a header check, before
 * the body is read), Turnstile, JSON and schema, then the write, then the mail.
 *
 * The emails are sent after the draft exists and cannot undo it: a failure is
 * reported and the visitor still gets a 201.
 */

export const dynamic = 'force-dynamic'

/**
 * Per minute, per address. Its own number so it counts in its own bucket (the
 * bucket key includes the budget): a submission uploads photos and sends two
 * emails, and nobody legitimately submits more than a couple a minute.
 */
const SUBMISSIONS_PER_WINDOW = 5

const json = (body: unknown, status = 200) =>
  Response.json(body, { status, headers: { 'cache-control': 'no-store' } })

/** Team alerts go where error alerts go, unless a dedicated address is set. */
const teamAddress = () =>
  process.env.PLACE_SUBMISSION_ALERT_TO?.trim() || process.env.ERROR_ALERT_TO?.trim() || null

export const POST = withRateLimit(
  async (request: Request) => {
    const tooBig = bodySizeProblem(request.headers)
    if (tooBig) return json(tooBig.body, tooBig.status)

    const form = await readForm(request)
    if (!form) return json({ ok: false, message: 'Expected a form submission.' }, 400)

    const verdict = await verifyTurnstile(form.get('turnstileToken'), clientIp(request.headers))
    if (!verdict.ok) {
      return json(
        {
          ok: false,
          code: verdict.reason,
          message: 'We could not confirm you are a person. Please try again.',
        },
        403,
      )
    }

    const parsed = parseSubmission(form)
    if (!parsed.ok) return json(parsed.body, parsed.status)

    const payload = await getPayload({ config })
    const outcome = await createPlaceSubmission({
      payload,
      input: parsed.input,
      files: parsed.files,
    })

    if (!outcome.ok) {
      return json(
        { ok: false, code: outcome.code, message: outcome.message },
        statusForOutcome(outcome.code),
      )
    }

    // Everything below is best effort: the draft exists, whatever happens.
    const { input } = parsed
    let issueTitle = `#${input.issue}`
    try {
      const issue = await payload.findByID({
        collection: 'issues',
        id: input.issue,
        depth: 0,
        overrideAccess: true,
      })
      if (issue?.title) issueTitle = String(issue.title)
    } catch {
      // The number is enough for the team to go on.
    }

    const emails = placeSubmissionEmails({
      businessId: outcome.listingId,
      businessName: input.name,
      governorate: input.governorate,
      listingNumber: input.listingNumber,
      issueTitle,
      ownerName: input.ownerName,
      ownerEmail: input.ownerEmail,
      ownerPhone: input.ownerPhone,
      locale: input.locale,
      origin: siteOrigin(),
    })

    const extra = { listingId: outcome.listingId }
    const team = teamAddress()
    if (team) {
      try {
        await payload.sendEmail({ to: team, subject: emails.team.subject, html: emails.team.html })
      } catch (error) {
        await reportError(error, { source: 'place-submission.email.team', extra })
      }
    }
    try {
      await payload.sendEmail({
        to: input.ownerEmail,
        subject: emails.owner.subject,
        html: emails.owner.html,
      })
    } catch (error) {
      await reportError(error, { source: 'place-submission.email.owner', extra })
    }

    return json({ ok: true }, 201)
  },
  SUBMISSIONS_PER_WINDOW,
  { shared: true },
)
