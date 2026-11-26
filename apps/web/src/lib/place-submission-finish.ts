import type { Payload, PayloadRequest } from 'payload'
import { PAGE_LAYOUT_LABELS, isPageLayout, slotLabel } from '@vardenia/core'
import type { Locale } from '@vardenia/i18n'

import { toSlots } from '../collections/Issues'
import { siteOrigin } from './auth-email'
import { runInTransaction } from './branches'
import { advisoryLock, placeSubmissionLockKey } from './partner-lock'
import { placeSessionLife, type SessionClock } from './place-session'
import { placeSubmissionEmails, teamAlertAddress } from './place-submission-email'
import { notifyAfterChange } from './place-payment-notify'
import { addDays, downpaymentFor } from './place-payment-rules'
import { getPlaceSettings } from './place-settings'
import { hashSessionToken } from './place-submission'
import { reportError } from './report'

/**
 * Step 3 of the Magazine Places form: the owner accepts the terms and sends it.
 *
 * Who may call it is whoever holds the session token (the secret from step 1).
 * The token is looked up by its SHA-256. An unknown token, a session that is
 * idle or past its hard cap (lib/place-session), and a business that is no
 * longer `incomplete`, all give the same `not-found`, so the answer says
 * nothing about which one it was. The one exception is a replay: a closed
 * session whose business is awaiting the downpayment or later answers ok with
 * the same reference and sends nothing.
 *
 * One write moves the business incomplete -> awaiting_downpayment (spec v4:
 * the owner pays the downpayment before staff review it; the page number
 * stays reserved), stamps submittedAt, the terms snapshot (version, price,
 * currency, term, acceptedAt) and the payment snapshot (price, downpayment,
 * currency, the downpayment deadline and the number of days for the rest)
 * from the Settings as they are NOW, and closes the session, in one
 * transaction. The
 * update is claimed with `submission.status = incomplete` in its where, so two
 * finishes at once cannot both win: the loser changes nothing and sends nothing.
 * Nothing from the request but the token and the boolean reaches the record.
 *
 * Emails go out afterwards, best effort: the submission stands whatever happens
 * to them. They go out once: the replay path never sends.
 */

export type FinishOutcome =
  | { ok: true; reference: string }
  | { ok: false; code: 'not-found' | 'terms-not-accepted' | 'photos-missing' | 'error' }

interface BusinessDoc {
  name?: unknown
  governorate?: unknown
  listingNumber?: unknown
  issue?: unknown
  heroImage?: unknown
  logo?: unknown
  pageLayout?: unknown
  submission: {
    status?: string
    reference?: string
    ownerName?: string
    ownerEmail?: string
    ownerPhone?: string
    payment?: { price?: unknown; downpaymentAmount?: unknown } | null
  }
}

type Session = { id: number; business: number | { id: number }; closedAt?: string | null }

const idOf = (value: unknown): number | null => {
  if (typeof value === 'number') return value
  const id = (value as { id?: unknown } | null)?.id
  return typeof id === 'number' ? id : null
}

const REPLAYABLE = new Set([
  'awaiting_downpayment',
  'pending',
  'accepted',
  'paid',
  'approved',
  'expired',
])

async function replayOf(
  payload: Payload,
  businessId: number,
  req?: PayloadRequest,
): Promise<{ ok: true; reference: string } | null> {
  const business = (await payload
    .findByID({
      collection: 'businesses',
      id: businessId,
      depth: 0,
      ...(req ? { req } : {}),
      overrideAccess: true,
    })
    .catch(() => null)) as BusinessDoc | null
  const status = business?.submission?.status
  if (!business || !status || !REPLAYABLE.has(status)) return null
  return { ok: true, reference: String(business.submission.reference ?? '') }
}

const hasMedia = (value: unknown) => idOf(value) !== null

export async function finishPlaceSubmission(args: {
  payload: Payload
  token: string
  acceptedTerms: boolean
  /** Language of the owner's email only; never stored. */
  locale?: Locale
  now?: Date
}): Promise<FinishOutcome> {
  const { payload, token, acceptedTerms, locale = 'en' } = args
  const now = args.now ?? new Date()
  const notFound: FinishOutcome = { ok: false, code: 'not-found' }

  try {
    if (typeof token !== 'string' || !token || token.length > 200) return notFound

    const found = await payload.find({
      collection: 'place-upload-sessions',
      where: { tokenHash: { equals: hashSessionToken(token) } },
      limit: 1,
      depth: 0,
      overrideAccess: true,
    })
    const session = found.docs[0] as unknown as
      (Session & { expiresAt: string; updatedAt?: string; createdAt?: string }) | undefined
    if (!session) return notFound

    const settings = await getPlaceSettings(payload)
    const businessId = idOf(session.business)
    if (businessId === null) return notFound

    // A closed session is not found, except for the replay of a finish that
    // already worked (a double click, a retry after a lost answer): the token
    // holder gets the same reference back and nothing is sent again. Only the
    // states a successful finish leads to count; a rejected or abandoned
    // submission stays not-found.
    const life = placeSessionLife(session, settings.holdMinutes, now)
    if (life === 'closed') return (await replayOf(payload, businessId)) ?? notFound
    if (life !== 'live') return notFound

    if (acceptedTerms !== true) {
      // Cheap refusal before any lock; the same business checks run again below.
      const peek = (await payload
        .findByID({ collection: 'businesses', id: businessId, depth: 0, overrideAccess: true })
        .catch(() => null)) as BusinessDoc | null
      if (!peek || peek.submission?.status !== 'incomplete') return notFound
      return { ok: false, code: 'terms-not-accepted' }
    }

    const stamp = now.toISOString()

    // Everything that decides the outcome is read again under the submission's
    // lock, which the abandon job takes too: whoever gets it second sees the
    // first one's result (a closed session, a status that moved on) and stops.
    const done = await runInTransaction(payload, async (req) => {
      await advisoryLock(req, placeSubmissionLockKey(businessId))

      const fresh = (await payload
        .findByID({
          collection: 'place-upload-sessions',
          id: session.id,
          depth: 0,
          req,
          overrideAccess: true,
        })
        .catch(() => null)) as unknown as SessionClock | null
      if (!fresh) return { code: 'not-found' as const }
      const freshLife = placeSessionLife(fresh, settings.holdMinutes, now)
      if (freshLife === 'closed') {
        const again = await replayOf(payload, businessId, req)
        return again
          ? { code: 'replay' as const, reference: again.reference }
          : { code: 'not-found' as const }
      }
      if (freshLife !== 'live') return { code: 'not-found' as const }

      const business = (await payload
        .findByID({ collection: 'businesses', id: businessId, depth: 0, req, overrideAccess: true })
        .catch(() => null)) as BusinessDoc | null
      if (!business || business.submission?.status !== 'incomplete') {
        return { code: 'not-found' as const }
      }
      // The photos come from the phone (lib/place-upload): the listing must
      // hold both AND the session must say both arrived.
      const received = fresh as { logoReceived?: boolean | null; heroReceived?: boolean | null }
      if (
        !hasMedia(business.heroImage) ||
        !hasMedia(business.logo) ||
        received.logoReceived !== true ||
        received.heroReceived !== true
      ) {
        return { code: 'photos-missing' as const }
      }

      // The price snapshot rule: the layout's price stored on the draft when
      // the form was started (lib/place-submission) is what the owner saw, so
      // it is what is charged. Only a draft made before layouts has none, and
      // takes the Settings price as it is now.
      const snap = business.submission.payment
      const snapPrice =
        typeof snap?.price === 'number' && Number.isFinite(snap.price) && snap.price > 0
          ? snap.price
          : null
      const price = snapPrice ?? settings.pricePerYear
      const downpaymentAmount =
        snapPrice !== null && typeof snap?.downpaymentAmount === 'number'
          ? snap.downpaymentAmount
          : downpaymentFor(price, settings.downpaymentPercent)
      const layoutLabel = isPageLayout(business.pageLayout)
        ? PAGE_LAYOUT_LABELS[business.pageLayout]
        : undefined
      const issueId = idOf(business.issue)
      let issueTitle: string | undefined
      let pageText: string | undefined
      if (issueId !== null) {
        const issue = (await payload
          .findByID({ collection: 'issues', id: issueId, depth: 0, req, overrideAccess: true })
          .catch(() => null)) as { title?: unknown; slots?: unknown } | null
        if (issue?.title) issueTitle = String(issue.title)
        // Where the listing prints ("Page 62, position 3"), from the issue's
        // slots, which cannot change once a business holds a number. Only for
        // a business with a layout: a legacy issue has no slots.
        if (layoutLabel) {
          const slot = toSlots(issue?.slots).find(
            (s) => s.number === Number(business.listingNumber) && s.layout === business.pageLayout,
          )
          if (slot) pageText = slotLabel(slot)
        }
      }

      const result = await payload.update({
        collection: 'businesses',
        where: {
          and: [{ id: { equals: businessId } }, { 'submission.status': { equals: 'incomplete' } }],
        },
        data: {
          submission: {
            ...business.submission,
            status: 'awaiting_downpayment',
            submittedAt: stamp,
            terms: {
              version: settings.termsVersion,
              ...(layoutLabel ? { layout: layoutLabel } : {}),
              ...(issueTitle ? { issue: issueTitle } : {}),
              ...(pageText ? { page: pageText } : {}),
              priceAtAcceptance: price,
              currency: settings.currency,
              termMonths: settings.termMonths,
              acceptedAt: stamp,
            },
            payments: [],
            payment: {
              stage: 'none',
              price,
              downpaymentAmount,
              currency: settings.currency,
              received: 0,
              refunded: 0,
              stillToPay: price,
              downpaymentDueAt: addDays(now, settings.downpaymentDeadlineDays).toISOString(),
              balanceDeadlineDays: settings.balanceDeadlineDays,
            },
          },
        } as never,
        depth: 0,
        req,
        overrideAccess: true,
        context: { skipAutoTranslate: true, skipQrGeneration: true },
      })
      // A failed write is an error, never a quiet not-found.
      if (result.errors?.length) {
        throw new Error(`The submission could not be saved: ${JSON.stringify(result.errors)}`)
      }
      if (result.docs.length === 0) return { code: 'not-found' as const }
      await payload.update({
        collection: 'place-upload-sessions',
        id: session.id,
        data: { closedAt: stamp },
        depth: 0,
        req,
        overrideAccess: true,
      })
      return { code: 'ok' as const, business }
    })
    if (done.code === 'not-found') return notFound
    if (done.code === 'replay') return { ok: true, reference: done.reference }
    if (done.code === 'photos-missing') return { ok: false, code: 'photos-missing' }
    const business = done.business

    const reference = String(business.submission.reference ?? '')
    // The team alert (E1b), then the owner's only email: E1, "pay the
    // downpayment" (lib/place-payment-notify), which replaced the first
    // version's confirmation. Never on a replay.
    await sendTeamAlert({ payload, business, businessId, reference })
    await notifyAfterChange('E1', { payload, businessId, locale, now })
    return { ok: true, reference }
  } catch (error) {
    await reportError(error, { source: 'place-submission.finish' })
    return { ok: false, code: 'error' }
  }
}

async function sendTeamAlert(args: {
  payload: Payload
  business: BusinessDoc
  businessId: number
  reference: string
}) {
  const { payload, business, businessId, reference } = args
  const extra = { listingId: businessId }
  try {
    const issueId = idOf(business.issue)
    let issueTitle = issueId === null ? '' : `#${issueId}`
    if (issueId !== null) {
      try {
        const issue = await payload.findByID({
          collection: 'issues',
          id: issueId,
          depth: 0,
          overrideAccess: true,
        })
        if (issue?.title) issueTitle = String(issue.title)
      } catch {
        // The number is enough for the team to go on.
      }
    }
    const emails = placeSubmissionEmails({
      businessId,
      businessName: String(business.name ?? ''),
      governorate: String(business.governorate ?? ''),
      listingNumber: Number(business.listingNumber),
      issueTitle,
      ownerName: String(business.submission.ownerName ?? ''),
      ownerEmail: String(business.submission.ownerEmail ?? ''),
      ownerPhone: String(business.submission.ownerPhone ?? ''),
      reference,
      origin: siteOrigin(),
    })

    const team = teamAlertAddress()
    if (team) {
      try {
        await payload.sendEmail({
          to: team,
          subject: emails.team.subject,
          html: emails.team.html,
          text: emails.team.text,
        })
      } catch (error) {
        await reportError(error, { source: 'place-submission.email.team', extra })
      }
    }
  } catch (error) {
    await reportError(error, { source: 'place-submission.email', extra })
  }
}
