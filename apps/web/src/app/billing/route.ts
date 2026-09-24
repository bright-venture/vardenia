import type { NextRequest } from 'next/server'

/**
 * The booking-fee page moved into the admin panel, at /admin/billing, so it sits
 * behind the admin sign-in with the admin menu around it. This address stays as
 * a redirect for anyone who kept it, carrying the month along.
 *
 * The routes below it - /billing/generate, /billing/send and /billing/dispute -
 * are the form and JSON actions, and stay where they are.
 */

export const dynamic = 'force-dynamic'

export function GET(request: NextRequest) {
  const url = new URL(request.url)
  const target = new URL('/admin/billing', request.url)
  const period = url.searchParams.get('period')
  if (period) target.searchParams.set('period', period)
  return Response.redirect(target, 308)
}
