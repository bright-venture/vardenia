/**
 * Every 15 minutes, declines the booking requests nobody answered before their
 * time, and tells each guest. The work is done by the site itself, at
 * POST /booking/expire (apps/web/src/lib/booking-expiry.ts); this only knocks.
 *
 * A Netlify scheduled function: it runs on the published production deploy
 * only, never on previews or locally. Needs two environment variables, both
 * available to Functions: NEXT_PUBLIC_SITE_URL (already set) and CRON_SECRET.
 *
 * Its output is under Netlify > Logs > Functions > expire-bookings.
 */
export default async (): Promise<Response> => {
  const site = (process.env.NEXT_PUBLIC_SITE_URL || process.env.URL || '').replace(/\/$/, '')
  const secret = process.env.CRON_SECRET?.trim()

  if (!site || !secret) {
    console.error('expire-bookings: NEXT_PUBLIC_SITE_URL or CRON_SECRET is not set; nothing done.')
    return new Response('not configured', { status: 500 })
  }

  try {
    const response = await fetch(`${site}/booking/expire`, {
      method: 'POST',
      headers: { authorization: `Bearer ${secret}`, 'user-agent': 'vardenia-scheduler' },
    })
    const body = await response.text()
    // A 403 with an HTML body is Cloudflare challenging the call, not the site
    // refusing it: allow /booking/expire through in Cloudflare's WAF.
    console.log(`expire-bookings: ${response.status} ${body.slice(0, 200)}`)
    return new Response(null, { status: response.ok ? 200 : 502 })
  } catch (error) {
    console.error('expire-bookings: request failed', error)
    return new Response(null, { status: 502 })
  }
}

export const config = { schedule: '*/15 * * * *' }
