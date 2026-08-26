import type { NextRequest } from 'next/server'
import { getPayload } from 'payload'
import { DEFAULT_PRINT_MM, isPrintSafeBaseUrl, qrSvg, scanUrl } from '../../../lib/qr-image'
import { populated, type QrDoc } from '../../../lib/qr-doc'

/**
 * A contact sheet of every code, ready to print or hand to the layout team.
 *
 * `/qr/sheet` covers everything active; `/qr/sheet?issue=1` narrows to the codes
 * assigned to one print issue. Optional `?size=30` sets the printed millimetre
 * size of each code.
 *
 * HTML rather than a generated PDF. The browser's own print dialogue produces a
 * PDF perfectly well, and this way the page stays viewable, searchable, and
 * copy-pasteable while it is being checked - which is the part that catches a
 * code attached to the wrong business before it goes to press.
 *
 * Staff only. The images themselves are public by nature, but this page pairs
 * each one with a business name, and the full list of who is in the next issue
 * is commercially sensitive before publication.
 */

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const payload = await getPayload({ config: (await import('../../../payload.config')).default })

  const { user } = await payload.auth({ headers: request.headers })
  const roles = ((user as { roles?: string[] } | null)?.roles ?? []) as string[]
  if (!roles.some((role) => role === 'admin' || role === 'staff')) {
    return new Response('Staff only. Sign in to the admin panel first.', { status: 403 })
  }

  const url = new URL(request.url)
  const issueParam = url.searchParams.get('issue')
  const sizeMm = Number(url.searchParams.get('size')) || DEFAULT_PRINT_MM

  /**
   * The issue id went straight from the query string into two database calls,
   * and every wrong value produced a 500: `?issue=abc` failed casting to an
   * integer, `?issue=1.5` failed the query, and a number that simply does not
   * exist threw NotFound out of findByID.
   *
   * This is the page somebody opens to check codes against the layout just
   * before artwork goes to a printer. An unexplained crash from a mistyped
   * issue number, at deadline, is the worst possible moment for it.
   */
  const issueId = parseIssueId(issueParam)
  if (issueParam !== null && issueId === null) {
    return new Response(
      `"${issueParam}" is not an issue id. Use the number from the URL of the issue in the admin, for example /qr/sheet?issue=1.`,
      { status: 400 },
    )
  }

  const result = await payload.find({
    collection: 'qr-codes',
    where: {
      active: { equals: true },
      ...(issueId !== null ? { issue: { equals: issueId } } : {}),
    },
    // A print run is a few hundred codes at most, and a sheet split across pages
    // is a sheet somebody prints half of.
    limit: 1000,
    depth: 1,
    sort: 'code',
    overrideAccess: false,
    user,
  })

  let issueLabel = 'All active codes'
  if (issueId !== null) {
    // findByID throws rather than returning null for a missing document, and a
    // number that does not exist is an ordinary typo, not a server fault.
    const issue = await payload
      .findByID({ collection: 'issues', id: issueId, depth: 0, overrideAccess: false, user })
      .catch(() => null)

    if (!issue) {
      return new Response(`No issue with id ${issueId}. Check the issue list in the admin.`, {
        status: 404,
      })
    }

    issueLabel = `Issue ${issue.issueNumber} - ${issue.title}`
  }

  const cards = await Promise.all(
    result.docs.map(async (doc) => {
      const qr = doc as unknown as QrDoc
      return renderCard({
        code: qr.code,
        label: labelFor(qr),
        placement: qr.placement ?? '',
        svg: await qrSvg(qr.code, { sizeMm }),
      })
    }),
  )

  return new Response(page(issueLabel, result.docs.length, result.totalDocs, cards.join('\n')), {
    headers: {
      'content-type': 'text/html; charset=utf-8',
      // Never cached: it lists who is in an unpublished issue.
      'cache-control': 'no-store',
    },
  })
}

/**
 * A positive whole number, or null.
 *
 * Deliberately strict. `Number('1.5')` and `Number(' 1 ')` both produce
 * something a careless check would accept and Postgres would then reject, so
 * the string has to look like an id rather than merely coerce to one.
 */
export function parseIssueId(raw: string | null): number | null {
  if (raw === null || !/^\d+$/.test(raw)) return null
  const value = Number(raw)
  return Number.isSafeInteger(value) && value > 0 ? value : null
}

/** Whatever a person would recognise. Falls back to the code so a card is never blank. */
function labelFor(qr: QrDoc): string {
  // Checked before the relationships, because a home code may still be tied to
  // an issue - and "Summer 2026" on the card that goes on the cover is exactly
  // the mislabelling this sheet exists to catch.
  if (qr.targetType === 'home') return 'Vardenia home page'

  const named = populated(qr.business) ?? populated(qr.article) ?? populated(qr.issue)
  if (typeof named?.title === 'string') return named.title
  if (typeof named?.name === 'string') return named.name
  if (qr.targetType === 'external' && typeof qr.externalUrl === 'string') return qr.externalUrl
  return qr.code
}

function escape(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function renderCard({
  code,
  label,
  placement,
  svg,
}: {
  code: string
  label: string
  placement: string
  svg: string
}): string {
  return `<figure class="card">
  <div class="code">${svg}</div>
  <figcaption>
    <strong>${escape(label)}</strong>
    <span class="mono">${escape(code)}</span>
    <span class="meta">${escape(placement)}</span>
    <span class="meta url">${escape(scanUrl(code))}</span>
  </figcaption>
</figure>`
}

/**
 * Shown when the sheet is not the whole list.
 *
 * The query is capped at 1000, and the header used to print the number of cards
 * as though it were the total - so past that point the sheet showed 1000 codes,
 * said "1000 codes", and gave no hint anything was missing. On the document
 * somebody checks before sending artwork to a printer, a silently short list is
 * the worst possible failure: every code on it is correct, and the ones that
 * would have caught the mistake are simply absent.
 */
function truncationBanner(shown: number, total: number): string {
  if (total <= shown) return ''
  return `<p class="warn"><strong>This sheet is incomplete.</strong> Showing ${shown} of
    ${total} codes. Narrow it with <code>?issue=</code> and check each issue separately,
    or this proof will miss ${total - shown} of them.</p>`
}

/**
 * Shown when the codes encode a host the public cannot reach. Deliberately loud
 * and deliberately printed rather than hidden by the print stylesheet: a proof
 * that carries the warning cannot be mistaken for final artwork.
 */
function unsafeBaseBanner(): string {
  if (isPrintSafeBaseUrl()) return ''
  return `<p class="warn"><strong>Not for print.</strong> These codes encode
    <code>${escape(scanUrl('CODE'))}</code>. Anything printed from this sheet will fail for every
    reader, permanently. Set NEXT_PUBLIC_SITE_URL to the live https domain and generate again.</p>`
}

function page(title: string, count: number, total: number, cards: string): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>QR sheet - ${escape(title)}</title>
<style>
  :root { color-scheme: light; }
  body {
    font-family: ui-sans-serif, system-ui, sans-serif;
    margin: 0; padding: 24px 32px; background: #fff; color: #111;
  }
  header { margin-bottom: 24px; }
  h1 { font-size: 20px; margin: 0 0 4px; }
  .count { color: #666; font-size: 13px; margin: 0; }
  .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(190px, 1fr)); gap: 20px; }
  .card {
    margin: 0; padding: 12px; border: 1px solid #ddd; border-radius: 6px;
    /* Keeps a code and its caption from being split across two printed pages. */
    break-inside: avoid; page-break-inside: avoid;
    display: flex; flex-direction: column; align-items: center; gap: 8px;
  }
  .code svg { display: block; }
  figcaption { display: flex; flex-direction: column; align-items: center; gap: 2px; text-align: center; }
  figcaption strong { font-size: 13px; line-height: 1.3; }
  .mono { font-family: ui-monospace, monospace; font-size: 13px; letter-spacing: 0.08em; }
  .meta { font-size: 11px; color: #666; }
  .url { word-break: break-all; }
  .empty { color: #666; }
  .warn {
    border: 2px solid #b00; background: #fff4f4; color: #900;
    padding: 10px 14px; border-radius: 6px; font-size: 13px; line-height: 1.5;
  }
  .warn code { word-break: break-all; }
  @media print {
    body { padding: 0; }
    header { margin-bottom: 12px; }
    .card { border-color: #999; }
    /* The URL is a proofing aid, not part of the artwork. */
    .url { display: none; }
  }
</style>
</head>
<body>
<header>
  <h1>${escape(title)}</h1>
  <p class="count">${count} code${count === 1 ? '' : 's'} at print size. Check every name against the layout before this goes to press.</p>
  ${unsafeBaseBanner()}
  ${truncationBanner(count, total)}
</header>
${count === 0 ? '<p class="empty">No active codes match.</p>' : `<div class="grid">${cards}</div>`}
</body>
</html>`
}
