/**
 * Every 15 minutes, the timed side of the Magazine Places payment (spec v4):
 * a submission whose downpayment deadline passed lapses (its page number is
 * released), the downpayment reminder and the reminder of the rest go out
 * once each, and an accepted submission whose deadline for the rest passed is
 * rejected. The work is done by the site itself, at POST
 * /booking/place-payment-jobs (apps/web/src/lib/place-payment-jobs.ts); this
 * only knocks. Running it twice does nothing twice.
 *
 * A Netlify scheduled function: it runs on the published production deploy
 * only, never on previews or locally. Needs NEXT_PUBLIC_SITE_URL and
 * CRON_SECRET, the same two as expire-bookings.
 *
 * Its output is under Netlify > Logs > Functions > place-payment-jobs.
 */
export default async (): Promise<Response> => {
  const site = (process.env.NEXT_PUBLIC_SITE_URL || process.env.URL || '').replace(/\/$/, '')
  const secret = process.env.CRON_SECRET?.trim()

  if (!site || !secret) {
    console.error(
      'place-payment-jobs: NEXT_PUBLIC_SITE_URL or CRON_SECRET is not set; nothing done.',
    )
    return new Response('not configured', { status: 500 })
  }

  try {
    const response = await fetch(`${site}/booking/place-payment-jobs`, {
      method: 'POST',
      headers: { authorization: `Bearer ${secret}`, 'user-agent': 'vardenia-scheduler' },
    })
    const body = await response.text()
    // A 403 with an HTML body is Cloudflare challenging the call, not the site
    // refusing it: allow /booking/place-payment-jobs through in Cloudflare's WAF.
    console.log(`place-payment-jobs: ${response.status} ${body.slice(0, 200)}`)
    return new Response(null, { status: response.ok ? 200 : 502 })
  } catch (error) {
    console.error('place-payment-jobs: request failed', error)
    return new Response(null, { status: 502 })
  }
}

// Every 15 minutes: deadlines are counted in days, so a quarter of an hour
// late is fine, and a run with nothing due is one cheap query.
export const config = { schedule: '*/15 * * * *' }
