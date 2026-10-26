/**
 * Every hour, asks guests whose visit ended a couple of hours ago whether they
 * went. The work is in the site's /booking/attendance route (lib/attendance);
 * this only calls it, with the same CRON_SECRET as expire-bookings.
 *
 * A 403 with an HTML body is Cloudflare challenging the call, not the site
 * refusing it: allow /booking/attendance through in Cloudflare's WAF, as for
 * /booking/expire.
 */
export default async (): Promise<Response> => {
  const site = (process.env.NEXT_PUBLIC_SITE_URL || process.env.URL || '').replace(/\/$/, '')
  const secret = process.env.CRON_SECRET?.trim()

  if (!site || !secret) {
    console.error('ask-attendance: NEXT_PUBLIC_SITE_URL or CRON_SECRET is not set; nothing done.')
    return new Response('not configured', { status: 500 })
  }

  try {
    const response = await fetch(`${site}/booking/attendance`, {
      method: 'POST',
      headers: { authorization: `Bearer ${secret}`, 'user-agent': 'vardenia-scheduler' },
    })
    const body = await response.text()
    console.log(`ask-attendance: ${response.status} ${body.slice(0, 200)}`)
    return new Response(null, { status: response.ok ? 200 : 502 })
  } catch (error) {
    console.error('ask-attendance: request failed', error)
    return new Response(null, { status: 502 })
  }
}

export const config = { schedule: '7 * * * *' }
