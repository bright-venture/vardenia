import type { NextRequest } from 'next/server'
import { getPayload } from 'payload'
import { DEFAULT_PRINT_MM, isPrintSafeBaseUrl, qrSvg, scanUrl } from '../../../lib/qr-image'

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

  const result = await payload.find({
    collection: 'qr-codes',
    where: {
      active: { equals: true },
      ...(issueParam ? { issue: { equals: issueParam } } : {}),
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
  if (issueParam) {
    const issue = await payload.findByID({
      collection: 'issues',
      id: issueParam,
      depth: 0,
      overrideAccess: false,
      user,
    })
    issueLabel = `Issue ${issue.issueNumber} - ${issue.title}`
  }

  const cards = await Promise.all(
    result.docs.map(async (doc) => {
      const qr = doc as Record<string, any>
      return renderCard({
        code: qr.code,
        label: labelFor(qr),
        placement: qr.placement,
        svg: await qrSvg(qr.code, { sizeMm }),
      })
    }),
  )

  return new Response(page(issueLabel, result.docs.length, cards.join('\n')), {
    headers: {
      'content-type': 'text/html; charset=utf-8',
      // Never cached: it lists who is in an unpublished issue.
      'cache-control': 'no-store',
    },
  })
}

/** Whatever a person would recognise. Falls back to the code so a card is never blank. */
function labelFor(qr: Record<string, any>): string {
  const named = qr.business ?? qr.article ?? qr.offer ?? qr.issue
  if (named && typeof named === 'object' && typeof named.title === 'string') return named.title
  if (named && typeof named === 'object' && typeof named.name === 'string') return named.name
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

function page(title: string, count: number, cards: string): string {
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
</header>
${count === 0 ? '<p class="empty">No active codes match.</p>' : `<div class="grid">${cards}</div>`}
</body>
</html>`
}
