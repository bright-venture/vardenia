/**
 * Every 5 minutes, gives up "add your place" forms nobody finished: a business
 * still `incomplete` whose phone upload session expired or went quiet for the
 * hold time (Settings, 30 minutes). Its listing number is freed and its photos
 * deleted. The work is done by the site itself, at POST
 * /booking/abandon-incomplete (apps/web/src/lib/place-abandon.ts); this only
 * knocks.
 *
 * A Netlify scheduled function: it runs on the published production deploy
 * only, never on previews or locally. Needs NEXT_PUBLIC_SITE_URL and
 * CRON_SECRET, the same two as expire-bookings.
 *
 * Its output is under Netlify > Logs > Functions > abandon-incomplete.
 */
export default async (): Promise<Response> => {
  const site = (process.env.NEXT_PUBLIC_SITE_URL || process.env.URL || '').replace(/\/$/, '')
  const secret = process.env.CRON_SECRET?.trim()

  if (!site || !secret) {
    console.error(
      'abandon-incomplete: NEXT_PUBLIC_SITE_URL or CRON_SECRET is not set; nothing done.',
    )
    return new Response('not configured', { status: 500 })
  }

  try {
    const response = await fetch(`${site}/booking/abandon-incomplete`, {
      method: 'POST',
      headers: { authorization: `Bearer ${secret}`, 'user-agent': 'vardenia-scheduler' },
    })
    const body = await response.text()
    // A 403 with an HTML body is Cloudflare challenging the call, not the site
    // refusing it: allow /booking/abandon-incomplete through in Cloudflare's WAF.
    console.log(`abandon-incomplete: ${response.status} ${body.slice(0, 200)}`)
    return new Response(null, { status: response.ok ? 200 : 502 })
  } catch (error) {
    console.error('abandon-incomplete: request failed', error)
    return new Response(null, { status: 502 })
  }
}

// Every 5 minutes: a held number should come back soon after the 30-minute
// hold ends, and a run with nothing to do is one cheap query. Minutes that are
// multiples of 5 overlap the hourly (15) job only on its own minute, which is
// harmless: they touch different tables.
export const config = { schedule: '*/5 * * * *' }
