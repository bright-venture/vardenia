/**
 * Every hour, deletes what the privacy policy only keeps for a while: bookings
 * and receipts 12 months after the visit (a real visit is cut down to what its
 * passport stamp needs), printed-code scans after 12 months, error records
 * after 90 days. The work is done by the site itself, at POST /booking/retention
 * (apps/web/src/lib/retention.ts); this only knocks.
 *
 * A Netlify scheduled function: it runs on the published production deploy
 * only, never on previews or locally. Needs NEXT_PUBLIC_SITE_URL and
 * CRON_SECRET, the same two as expire-bookings.
 *
 * Its output is under Netlify > Logs > Functions > apply-retention.
 */
export default async (): Promise<Response> => {
  const site = (process.env.NEXT_PUBLIC_SITE_URL || process.env.URL || '').replace(/\/$/, '')
  const secret = process.env.CRON_SECRET?.trim()

  if (!site || !secret) {
    console.error('apply-retention: NEXT_PUBLIC_SITE_URL or CRON_SECRET is not set; nothing done.')
    return new Response('not configured', { status: 500 })
  }

  try {
    const response = await fetch(`${site}/booking/retention`, {
      method: 'POST',
      headers: { authorization: `Bearer ${secret}`, 'user-agent': 'vardenia-scheduler' },
    })
    const body = await response.text()
    console.log(`apply-retention: ${response.status} ${body.slice(0, 300)}`)
    return new Response(null, { status: response.ok ? 200 : 502 })
  } catch (error) {
    console.error('apply-retention: request failed', error)
    return new Response(null, { status: 502 })
  }
}

// Minute 41, away from the other two jobs (7 and every 15).
export const config = { schedule: '41 * * * *' }
