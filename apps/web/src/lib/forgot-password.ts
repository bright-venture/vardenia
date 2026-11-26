import { reportError } from './report'

/**
 * "Forgot password" gives the same answer whether or not an account exists
 * (20 November 2026).
 *
 * Payload already answers "Success" for an address it does not know, so the
 * page cannot be used to test who has an account. But when the address IS
 * known and the email then fails to send (a mailbox the provider refuses, or
 * the provider down), Payload's answer became an error carrying the provider's
 * own message. That difference told anyone that the account exists, and showed
 * a stranger how our email is sent.
 *
 * So any failure after a well-formed request is answered with Payload's own
 * success reply, and reported to us instead. Left alone: a request without a
 * usable address (the person needs to know they typed it wrong), and the rate
 * limit's 429 (which says nothing about any account).
 *
 * Covers all three account types, because they share the API route:
 * /api/customers, /api/business-users and /api/users forgot-password.
 */

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/** Payload's reply when it has done its part, byte for byte. */
const SUCCESS = { message: 'Success' }

export const isForgotPasswordRequest = (request: Request): boolean => {
  if (request.method !== 'POST') return false
  try {
    return new URL(request.url).pathname.endsWith('/forgot-password')
  } catch {
    return false
  }
}

type Handler = (request: Request, context: unknown) => Promise<Response>

export function sameAnswerForForgotPassword<H extends Handler>(handler: H): H {
  return (async (request: Request, context: unknown) => {
    if (!isForgotPasswordRequest(request)) return handler(request, context)

    // Read from a copy: the handler still needs the original body.
    const email = await request
      .clone()
      .json()
      .then((body: unknown) => {
        const value = (body as { email?: unknown } | null)?.email
        return typeof value === 'string' ? value.trim() : ''
      })
      .catch(() => '')

    const response = await handler(request, context)
    if (response.ok || response.status === 429 || !EMAIL.test(email)) return response

    // The address itself is left out of the report on purpose.
    await reportError(new Error(`Forgot password failed with status ${response.status}`), {
      source: 'auth.forgot-password',
      path: new URL(request.url).pathname,
      extra: {
        status: response.status,
        detail: (await response.clone().text()).slice(0, 300),
      },
    })
    return Response.json(SUCCESS, { status: 200 })
  }) as H
}
