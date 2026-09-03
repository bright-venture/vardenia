import type { NextRequest } from 'next/server'
import { getPayload } from 'payload'
import config from '../../../payload.config'
import { toCsv, UTF8_BOM, type CsvValue } from '../../../lib/csv'
import { listingGaps } from '../../../lib/listing-gaps'

/**
 * What every listing is still missing, as a spreadsheet.
 *
 *   /reports/listings
 *
 * A file rather than a screen, for the same reason the scan report is one: what
 * this is *for* is dividing several hundred listings between people, and that
 * happens in a spreadsheet with a filter on it, not in a dashboard nobody has
 * open. Sort by `Missing` and the emptiest listings come to the top.
 *
 * Staff only, and not because the data is commercially sensitive - it is a list
 * of our own unfinished work. It is staff-only because it is unflattering, and
 * a partner reading "no description, no hours, no Arabic name" about the listing
 * they are paying for is a conversation nobody planned to have.
 */

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const payload = await getPayload({ config })

  const { user } = await payload.auth({ headers: request.headers })
  const roles = ((user as { roles?: string[] } | null)?.roles ?? []) as string[]
  if (!roles.some((role) => role === 'admin' || role === 'staff')) {
    return new Response('Staff only. Sign in to the admin panel first.', { status: 403 })
  }

  const gaps = await listingGaps(payload)

  const headers = [
    'Business',
    'Slug',
    'Status',
    'Missing',
    'Category',
    'Governorate',
    'Tier',
    'No photograph',
    'No gallery',
    'No opening hours',
    'No description',
    'No tagline',
    'No Arabic name',
    'No map location',
    'Bookings off',
  ]

  const rows: CsvValue[][] = gaps.map((g) => [
    g.name,
    g.slug,
    g.status,
    g.missing,
    g.category,
    g.governorate,
    g.tier,
    g.noPhotograph,
    g.noGallery,
    g.noHours,
    g.noDescription,
    g.noTagline,
    g.noArabicName,
    g.noLocation,
    g.bookingsOff,
  ])

  const stamp = new Date().toISOString().slice(0, 10)

  return new Response(UTF8_BOM + toCsv(headers, rows), {
    headers: {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': `attachment; filename="vardenia-listing-gaps-${stamp}.csv"`,
      // The whole point is what is missing right now. A cached copy would be a
      // worklist for a day that has already been worked.
      'cache-control': 'no-store',
    },
  })
}
