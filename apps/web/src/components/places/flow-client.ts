/**
 * The three other calls of the big-screen form flow: the price (GET terms),
 * the photo status poll (POST status) and finishing (POST finish). Pure apart
 * from the `fetch` they are handed, so every answer is tested with a fake one.
 *
 * The session token goes in a JSON body only, never the URL, and is never
 * logged or stored here. Server text is never shown (it is English); each
 * outcome is a kind the form turns into a sentence in the page's language.
 */

export const TERMS_URL = '/place-submissions/terms'
export const STATUS_URL = '/place-submissions/status'
export const FINISH_URL = '/place-submissions/finish'

async function readJson(response: Response): Promise<Record<string, unknown> | null> {
  try {
    const body: unknown = JSON.parse(await response.text())
    return body && typeof body === 'object' && !Array.isArray(body)
      ? (body as Record<string, unknown>)
      : null
  } catch {
    return null
  }
}

export interface Terms {
  price: number
  currency: string
  termMonths: number
  termsVersion: string
  /** Two-stage payment (spec v4): the part paid first, to keep the page number. */
  downpaymentPercent: number
  downpaymentAmount: number
  /** Days to pay the downpayment after sending the form. */
  downpaymentDeadlineDays: number
  /** Days to pay the rest after the business is accepted. */
  balanceDeadlineDays: number
}

const isNumber = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)

export async function fetchTerms(fetchImpl: typeof fetch = fetch): Promise<Terms | null> {
  try {
    const response = await fetchImpl(TERMS_URL, { cache: 'no-store', credentials: 'same-origin' })
    if (!response.ok) return null
    const body = await readJson(response)
    if (
      isNumber(body?.price) &&
      typeof body.currency === 'string' &&
      isNumber(body.termMonths) &&
      typeof body.termsVersion === 'string' &&
      isNumber(body.downpaymentPercent) &&
      isNumber(body.downpaymentAmount) &&
      isNumber(body.downpaymentDeadlineDays) &&
      isNumber(body.balanceDeadlineDays)
    ) {
      // Without the payment terms the step cannot say what is paid when: it
      // reads as "could not load the price" and offers Try again.
      return {
        price: body.price,
        currency: body.currency,
        termMonths: body.termMonths,
        termsVersion: body.termsVersion,
        downpaymentPercent: body.downpaymentPercent,
        downpaymentAmount: body.downpaymentAmount,
        downpaymentDeadlineDays: body.downpaymentDeadlineDays,
        balanceDeadlineDays: body.balanceDeadlineDays,
      }
    }
    return null
  } catch {
    return null
  }
}

export type StatusResult =
  | { kind: 'ok'; logoReceived: boolean; heroReceived: boolean; live: boolean }
  /** 404: the session is unknown, closed or gone. */
  | { kind: 'gone' }
  /** Anything else (network, 429, 5xx): try again later, slower. */
  | { kind: 'error' }

export async function postStatus(
  token: string,
  fetchImpl: typeof fetch = fetch,
): Promise<StatusResult> {
  let response: Response
  try {
    response = await fetchImpl(STATUS_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ sessionToken: token }),
      cache: 'no-store',
      credentials: 'same-origin',
    })
  } catch {
    return { kind: 'error' }
  }
  if (response.status === 404) return { kind: 'gone' }
  if (!response.ok) return { kind: 'error' }
  const body = await readJson(response)
  if (!body) return { kind: 'error' }
  return {
    kind: 'ok',
    logoReceived: body.logoReceived === true,
    heroReceived: body.heroReceived === true,
    live: body.live !== false,
  }
}

export type FinishResult =
  | { kind: 'ok'; reference: string }
  | { kind: 'gone' }
  | { kind: 'terms-not-accepted' }
  | { kind: 'photos-missing' }
  | { kind: 'turnstile' }
  | { kind: 'rate-limited' }
  | { kind: 'network' }
  | { kind: 'failed' }

export async function postFinish(
  parts: { token: string; turnstileToken: string | null; locale: string },
  fetchImpl: typeof fetch = fetch,
): Promise<FinishResult> {
  let response: Response
  try {
    response = await fetchImpl(FINISH_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        sessionToken: parts.token,
        acceptedTerms: true,
        turnstileToken: parts.turnstileToken,
        locale: parts.locale,
      }),
      credentials: 'same-origin',
    })
  } catch {
    return { kind: 'network' }
  }
  if (response.ok) {
    const body = await readJson(response)
    return typeof body?.reference === 'string'
      ? { kind: 'ok', reference: body.reference }
      : { kind: 'failed' }
  }
  switch (response.status) {
    case 404:
      return { kind: 'gone' }
    case 403:
      return { kind: 'turnstile' }
    case 429:
      return { kind: 'rate-limited' }
    case 422: {
      const body = await readJson(response)
      return { kind: body?.code === 'photos-missing' ? 'photos-missing' : 'terms-not-accepted' }
    }
    default:
      return { kind: 'failed' }
  }
}
