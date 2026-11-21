import { randomBytes } from 'node:crypto'
import { APIError } from 'payload'
import type {
  CollectionAfterChangeHook,
  CollectionBeforeChangeHook,
  CollectionBeforeValidateHook,
} from 'payload'
import { reportError } from '../lib/report'
import { advisoryLock, partnerLockKey } from '../lib/partner-lock'

type Submission = {
  status?: string
  ownerName?: string
  ownerEmail?: string
  ownerPhone?: string
}

const idOf = (value: unknown): number | string | null => {
  if (typeof value === 'number' || typeof value === 'string') return value
  const id = (value as { id?: unknown } | null)?.id
  return typeof id === 'number' || typeof id === 'string' ? id : null
}

/**
 * A rejected submission is a closed case: it stays in the admin as a draft
 * record, so publishing it would put a business the team turned down on the
 * website, and create an account for its owner.
 *
 * The other direction is refused too: rejecting a listing that stays published.
 * Rejecting releases its number (hooks/releaseListingNumber), and the printed
 * number of a live page must not become free for the next owner. Checked on
 * every update, against the merged state after the save.
 *
 * Rejected is final (20 November 2026, as decided for magazine places on 19
 * November): it cannot be set back to pending, approved or expired. Reopening
 * used to be allowed, and a reopened submission went live with no listing
 * number, since rejecting had released it. The business sends a new request.
 */
export const refusePublishingRejected: CollectionBeforeValidateHook = ({ data, originalDoc }) => {
  const before = (originalDoc?.submission as Submission | undefined)?.status
  const asked = (data?.submission as Submission | undefined)?.status
  if (before === 'rejected' && asked !== undefined && asked !== 'rejected') {
    throw new APIError(
      'This submission was rejected, and a rejection is final. The business can send a new request from the Magazine Places page.',
      400,
      null,
      true,
    )
  }

  const published = (data?._status ?? originalDoc?._status) === 'published'
  const status = asked ?? before
  if (!published || status !== 'rejected') return data
  if (originalDoc?._status !== 'published') {
    throw new APIError(
      'This submission was rejected, so it cannot be published. A rejection is final: the business can send a new request.',
      400,
      null,
      true,
    )
  }
  throw new APIError(
    'A published listing cannot be rejected, because rejecting gives its listing number away while the page is still live. Set the listing to Draft first, then reject it.',
    400,
    null,
    true,
  )
}

/**
 * A listing that came through the form needs a contract end date to be
 * published (20 November 2026, auth audit step 7).
 *
 * Without one it never expires: lib/contract-lapse hides a listing only once
 * its contract has ended. An end date already more than a day past is refused
 * too, because the daily job would hide the listing again the next morning.
 * Only on the move to Published, so a renewal (new date, publish again) works,
 * and only for submitted listings, so older listings without a contract can
 * still be saved.
 */
export const requireContractToPublish: CollectionBeforeValidateHook = ({ data, originalDoc }) => {
  const publishing = data?._status === 'published' && originalDoc?._status !== 'published'
  if (!publishing) return data
  const submission = {
    ...((originalDoc?.submission as Submission | undefined) ?? {}),
    ...((data?.submission as Submission | undefined) ?? {}),
  }
  if (!submission.ownerEmail) return data

  const ends = data?.contractEndsAt ?? originalDoc?.contractEndsAt
  if (!ends) {
    throw new APIError(
      'Set the contract end date (Commercial tab) before publishing this listing.',
      400,
      null,
      true,
    )
  }
  if (new Date(String(ends)).getTime() < Date.now() - 24 * 60 * 60 * 1000) {
    throw new APIError(
      'The contract end date has passed. Set the new end date before publishing.',
      400,
      null,
      true,
    )
  }
  return data
}

/**
 * Marks a submission approved in the same write that publishes it.
 *
 * A beforeChange step rather than a second update from afterChange, so it adds
 * no second save and nothing can loop. Only the first publish counts: a renewal
 * after a contract lapse finds the listing already approved.
 */
export const approveSubmissionOnPublish: CollectionBeforeChangeHook = ({ data, originalDoc }) => {
  if (data?._status !== 'published' || originalDoc?._status === 'published') return data
  const current = { ...(originalDoc?.submission ?? {}), ...(data.submission ?? {}) } as Submission
  if (!current.ownerEmail) return data
  return { ...data, submission: { ...current, status: 'approved' } }
}

/**
 * Gives a business owner their partner account when their listing is published.
 *
 * Fires once, on the draft-to-published change, for listings that came through
 * the submission form (they carry `submission.ownerEmail`). A renewal after a
 * contract lapse is a second publish and does nothing, so there is never a
 * second partner or a second invitation. An owner who already has an account
 * (several listings, same email) just gets this listing added to it.
 *
 * A new account is created through the Local API, so inviteBusinessUser fires
 * and emails the set-password link. The password given here is random and
 * thrown away: nobody, the owner included, ever knows it.
 *
 * Every call passes `req`, so it joins the transaction the publish is still
 * inside (see inviteBusinessUser for what goes wrong otherwise), and
 * `overrideAccess`, because the request is a staff member's, not the partner's.
 *
 * # Failure is reported and then thrown
 *
 * A nested write that fails kills the transaction it shares with the publish
 * (Payload's killTransaction does not care who opened it). Swallowing the error
 * would therefore answer 200 over a save that was rolled back: the listing
 * still a draft, no partner, and staff told it worked. Two staff publishing
 * submissions from the same new owner at once is enough to cause it (the second
 * create hits the unique email). So the failure is reported and then thrown as
 * an APIError, and the publish visibly fails together with its rollback.
 */
export const linkPartnerOnPublish: CollectionAfterChangeHook = async ({
  doc,
  previousDoc,
  req,
}) => {
  if (previousDoc?._status === 'published' || doc._status !== 'published') return doc
  const submission = doc.submission as Submission | undefined
  const email = submission?.ownerEmail?.trim().toLowerCase()
  if (!email) return doc

  const { payload } = req

  try {
    const found = await payload.find({
      collection: 'business-users',
      where: { email: { equals: email } },
      limit: 1,
      depth: 0,
      req,
      overrideAccess: true,
    })
    const partner = found.docs[0] as { id: number | string; businesses?: unknown[] } | undefined

    if (!partner) {
      await payload.create({
        collection: 'business-users',
        data: {
          name: submission?.ownerName || email,
          email,
          phone: submission?.ownerPhone,
          businesses: [doc.id],
          password: randomBytes(32).toString('base64url'),
        } as never,
        depth: 0,
        req,
        overrideAccess: true,
      })
      return doc
    }

    // Under the partner lock the branch endpoint takes (lib/partner-lock),
    // and read again once it is held, so a branch appended to this account
    // in the meantime is kept rather than overwritten by the list read above.
    await advisoryLock(req, partnerLockKey(partner.id))
    const fresh = await payload.find({
      collection: 'business-users',
      where: { id: { equals: partner.id } },
      limit: 1,
      depth: 0,
      req,
      overrideAccess: true,
    })
    const latest = (fresh.docs[0] ?? partner) as { businesses?: unknown[] }
    const current = (latest.businesses ?? []).map(idOf).filter((id) => id !== null)
    if (current.includes(doc.id)) return doc

    await payload.update({
      collection: 'business-users',
      id: partner.id,
      data: { businesses: [...current, doc.id] } as never,
      depth: 0,
      req,
      overrideAccess: true,
    })
  } catch (error) {
    await reportError(error, {
      source: 'partner.link',
      extra: { businessId: doc.id },
    })
    throw new APIError(
      'The listing could not be published because its partner account could not be created or linked. Check the listing and try publishing it again.',
      500,
      null,
      // Public so the admin shows this text; Payload hides the message of a 500
      // otherwise ("Something went wrong.").
      true,
    )
  }

  return doc
}
