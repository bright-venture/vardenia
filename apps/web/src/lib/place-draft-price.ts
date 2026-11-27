import type { Payload } from 'payload'
import { hashSessionToken } from './place-submission'

/**
 * The price a started form agreed to, read from its draft (PRD v7 section 5:
 * "the terms screen route returns price and downpayment from the draft's
 * snapshot"). The start route copies the layout's price and downpayment onto
 * the draft (`submission.payment.price`, `.downpaymentAmount`); an admin who
 * edits the issue's price afterwards changes nothing for this form.
 *
 * Null when the token matches no upload session, or its draft has no snapshot
 * (a form started before layouts existed): the caller falls back to Settings.
 * The token comes from the browser, so nothing about the session or the
 * business is returned, only the two amounts.
 */
export async function draftPrice(
  payload: Payload,
  token: string | null | undefined,
): Promise<{ price: number; downpaymentAmount: number } | null> {
  if (typeof token !== 'string' || !token || token.length > 200) return null

  const found = await payload.find({
    collection: 'place-upload-sessions',
    where: { tokenHash: { equals: hashSessionToken(token) } },
    limit: 1,
    depth: 0,
    overrideAccess: true,
  })
  const session = found.docs[0] as { business?: unknown } | undefined
  const business = session?.business
  const id =
    typeof business === 'number'
      ? business
      : business && typeof business === 'object' && 'id' in business
        ? (business as { id: unknown }).id
        : null
  if (typeof id !== 'number') return null

  const doc = (await payload.findByID({
    collection: 'businesses',
    id,
    depth: 0,
    overrideAccess: true,
    trash: true,
  })) as { submission?: { payment?: { price?: unknown; downpaymentAmount?: unknown } } } | null
  const price = doc?.submission?.payment?.price
  const downpaymentAmount = doc?.submission?.payment?.downpaymentAmount
  const valid = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n) && n > 0
  return valid(price) && valid(downpaymentAmount) ? { price, downpaymentAmount } : null
}
