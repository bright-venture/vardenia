import type { NextRequest } from 'next/server'
import { getPayload } from 'payload'
import { CATEGORIES, GOVERNORATES, LISTING_TIERS, QR_TARGET_TYPES } from '@vardenia/core'
import { staffUser } from '../../../lib/billing-auth'
import {
  DEFAULT_PRINT_MM,
  isPrintSafeBaseUrl,
  qrSvg,
  scanUrl,
  SHIRT_PRINT_MM,
} from '../../../lib/qr-image'
import { populated, shirtLabel, type QrDoc, type RelatedDoc } from '../../../lib/qr-doc'
import {
  filterQuery,
  isFiltered,
  parseSheetFilters,
  PER_PAGE_OPTIONS,
  PRINTED_TIERS,
  sheetWhere,
  SORT_FIELD,
  type FilterKey,
  type SheetFilters,
} from '../../../lib/qr-sheet-filters'

/**
 * A contact sheet of the codes, to check against a layout and to print.
 *
 * Filtered by anything a code can be reached through: what it opens, the issue
 * it is printed in, an article (its own code and the codes of the listings it
 * features), the listing's governorate, district, category, tier and import
 * batch, where it is printed (magazine or shirt), whether it is active and
 * whether it has been scanned, plus a free-text search. The filters live in
 * lib/qr-sheet-filters, shared with /qr/export so "download all" gives exactly
 * the codes on screen.
 *
 * # Pages, not a ceiling
 *
 * The sheet used to load the first 1000 codes and warn about the rest, which
 * with 1625 active codes meant every visit opened on a red "this sheet is
 * incomplete". It is paged now, so nothing is silently missing: the count says
 * how many match, the pages hold all of them, and a page of up to 500 is there
 * for printing a whole issue at once.
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

/** Kept here as well as in the filters module, where the sheet's tests import it. */
export { parseIssueId } from '../../../lib/qr-sheet-filters'

const TARGET_LABELS: Record<string, string> = {
  business: 'Listing',
  article: 'Article',
  issue: 'Issue',
  category: 'Category page',
  external: 'Other website',
  home: 'Home page',
}

const GOVERNORATE_NAMES = new Map<string, string>(GOVERNORATES.map((g) => [g.slug, g.en]))
const DISTRICT_NAMES = new Map<string, string>(
  GOVERNORATES.flatMap((g) => g.districts.map((d) => [d.slug, d.en] as [string, string])),
)
const CATEGORY_NAMES = new Map<string, string>(
  CATEGORIES.flatMap((c) => [
    [c.slug, c.en] as [string, string],
    ...c.children.map((child) => [child.slug, child.en] as [string, string]),
  ]),
)

interface Choice {
  value: string
  label: string
}

type Doc = Omit<QrDoc, 'business' | 'article' | 'issue'> & {
  business?:
    (RelatedDoc & { governorate?: string | null; district?: string | null }) | number | null
  article?: (RelatedDoc & { governorate?: string | null }) | number | null
  issue?: (RelatedDoc & { issueNumber?: number | null }) | number | null
}

export async function GET(request: NextRequest) {
  const payload = await getPayload({ config: (await import('../../../payload.config')).default })

  const user = await staffUser(payload, request.headers)
  if (!user) {
    return new Response('Staff only. Sign in to the admin panel first.', { status: 403 })
  }

  const url = new URL(request.url)
  const { filters, problems } = parseSheetFilters(url.searchParams)
  const sizeMm =
    filters.size ?? (filters.placement === 't-shirt' ? SHIRT_PRINT_MM : DEFAULT_PRINT_MM)

  /**
   * The lists behind the pickers. overrideAccess because the route is already
   * staff-gated, and a draft article or an unpublished listing's batch is still
   * something whose codes need checking before print.
   */
  const [issues, articles, batched] = await Promise.all([
    payload.find({
      collection: 'issues',
      limit: 200,
      depth: 0,
      sort: '-issueNumber',
      overrideAccess: true,
      select: { issueNumber: true, title: true },
    }),
    payload.find({
      collection: 'articles',
      limit: 500,
      depth: 0,
      sort: '-publishedAt',
      overrideAccess: true,
      select: { title: true, featuredBusinesses: true },
    }),
    payload.find({
      collection: 'businesses',
      where: { importBatch: { exists: true } },
      limit: 5000,
      depth: 0,
      overrideAccess: true,
      select: { importBatch: true },
    }),
  ])

  const issueChoices: Choice[] = issues.docs.map((doc) => ({
    value: String(doc.id),
    label: `Issue ${doc.issueNumber} - ${doc.title}`,
  }))
  const articleChoices: Choice[] = articles.docs.map((doc) => ({
    value: String(doc.id),
    label: String(doc.title ?? `Article ${doc.id}`),
  }))
  // Newest first, because the batch someone wants is almost always the one they just ran.
  const batchChoices: Choice[] = [
    ...new Set(
      batched.docs
        .map((doc) => (doc as { importBatch?: string | null }).importBatch)
        .filter((value): value is string => Boolean(value)),
    ),
  ]
    .sort()
    .reverse()
    .map((value) => ({ value, label: value }))

  if (
    typeof filters.issue === 'number' &&
    !issueChoices.some((c) => c.value === String(filters.issue))
  ) {
    problems.push(`No issue with id ${filters.issue}. Pick one from the list.`)
  }

  // "Codes in this article": its own code, and the codes of the listings it features.
  let featuredIds: number[] = []
  if (filters.article !== null) {
    const article = articles.docs.find((doc) => doc.id === filters.article)
    if (!article) problems.push(`No article with id ${filters.article}. Pick one from the list.`)
    featuredIds = ((article?.featuredBusinesses ?? []) as (number | { id: number })[]).map((b) =>
      typeof b === 'object' ? b.id : b,
    )
  }

  const result = await payload.find({
    collection: 'qr-codes',
    where: sheetWhere(filters, featuredIds),
    limit: filters.perPage,
    page: filters.page,
    depth: 1,
    sort: SORT_FIELD[filters.sort],
    overrideAccess: false,
    user,
  })

  const cards = await Promise.all(
    result.docs.map(async (doc) =>
      renderCard(doc as unknown as Doc, await qrSvg((doc as unknown as Doc).code, { sizeMm })),
    ),
  )

  const html = page({
    filters,
    problems,
    sizeMm,
    total: result.totalDocs,
    first: result.totalDocs === 0 ? 0 : (result.page! - 1) * filters.perPage + 1,
    last: (result.page! - 1) * filters.perPage + result.docs.length,
    pageNumber: result.page ?? 1,
    totalPages: result.totalPages,
    cards: cards.join('\n'),
    issueChoices,
    articleChoices,
    batchChoices,
  })

  return new Response(html, {
    headers: {
      'content-type': 'text/html; charset=utf-8',
      // Never cached: it lists who is in an unpublished issue.
      'cache-control': 'no-store',
    },
  })
}

/** Whatever a person would recognise. Falls back to the code so a card is never blank. */
function labelFor(qr: QrDoc): string {
  const shirt = shirtLabel(qr)
  if (shirt) return shirt
  // Checked before the relationships, because a home code may still be tied to
  // an issue - and "Summer 2026" on the card that goes on the cover is exactly
  // the mislabelling this sheet exists to catch.
  if (qr.targetType === 'home') return 'Vardenia home page'

  const named = populated(qr.business) ?? populated(qr.article) ?? populated(qr.issue)
  if (typeof named?.title === 'string') return named.title
  if (typeof named?.name === 'string') return named.name
  if (qr.targetType === 'category' && qr.category) {
    return CATEGORY_NAMES.get(qr.category) ?? qr.category
  }
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

function renderCard(qr: Doc, svg: string): string {
  const business = typeof qr.business === 'object' ? qr.business : null
  const article = typeof qr.article === 'object' ? qr.article : null
  const issue = typeof qr.issue === 'object' ? qr.issue : null
  const governorate = business?.governorate ?? article?.governorate ?? null
  const place = [
    business?.district && business.district !== governorate
      ? DISTRICT_NAMES.get(business.district)
      : null,
    governorate ? GOVERNORATE_NAMES.get(governorate) : null,
  ]
    .filter(Boolean)
    .join(', ')
  const scans = qr.scanCount ?? 0
  const notPrinted = business?.tier != null && !PRINTED_TIERS.includes(business.tier)

  const tags = [
    `<span class="tag">${escape(TARGET_LABELS[qr.targetType ?? ''] ?? 'Code')}</span>`,
    qr.placement === 't-shirt' ? '<span class="tag strong">T-shirt</span>' : '',
    issue?.issueNumber != null ? `<span class="tag">Issue ${issue.issueNumber}</span>` : '',
    place ? `<span class="tag">${escape(place)}</span>` : '',
    `<span class="tag">${scans} scan${scans === 1 ? '' : 's'}</span>`,
    qr.active === false ? '<span class="tag warn">Inactive</span>' : '',
    notPrinted ? '<span class="tag warn">Website only, not printed</span>' : '',
  ].join('')

  return `<figure class="card${qr.active === false ? ' off' : ''}">
  <div class="code">${svg}</div>
  <figcaption>
    <strong>${escape(labelFor(qr))}</strong>
    <span class="mono">${escape(qr.code)}</span>
    <span class="tags">${tags}</span>
    <span class="url">${escape(scanUrl(qr.code))}</span>
  </figcaption>
</figure>`
}

function options(choices: Choice[], selected: string | null, all = 'All'): string {
  const first = `<option value=""${selected === null ? ' selected' : ''}>${escape(all)}</option>`
  return (
    first +
    choices
      .map(
        (c) =>
          `<option value="${escape(c.value)}"${c.value === selected ? ' selected' : ''}>${escape(c.label)}</option>`,
      )
      .join('')
  )
}

function field(label: string, control: string, wide = false): string {
  return `<label class="field${wide ? ' wide' : ''}"><span>${escape(label)}</span>${control}</label>`
}

function select(name: string, inner: string): string {
  return `<select name="${name}">${inner}</select>`
}

function filterForm(
  f: SheetFilters,
  sizeMm: number,
  issueChoices: Choice[],
  articleChoices: Choice[],
  batchChoices: Choice[],
): string {
  const districtOptions =
    `<option value=""${f.district === null ? ' selected' : ''}>All</option>` +
    GOVERNORATES.map(
      (g) =>
        `<optgroup label="${escape(g.en)}">${g.districts
          .map(
            (d) =>
              `<option value="${d.slug}"${d.slug === f.district ? ' selected' : ''}>${escape(d.en)}</option>`,
          )
          .join('')}</optgroup>`,
    ).join('')

  const categoryOptions =
    `<option value=""${f.category === null ? ' selected' : ''}>All</option>` +
    CATEGORIES.filter((c) => !c.retired)
      .map(
        (c) =>
          `<optgroup label="${escape(c.en)}"><option value="${c.slug}"${c.slug === f.category ? ' selected' : ''}>All ${escape(c.en.toLowerCase())}</option>${c.children
            .filter((child) => !child.retired)
            .map(
              (child) =>
                `<option value="${child.slug}"${child.slug === f.category ? ' selected' : ''}>${escape(child.en)}</option>`,
            )
            .join('')}</optgroup>`,
      )
      .join('')

  const issueOptions = options(issueChoices, f.issue === null ? null : String(f.issue)).replace(
    '</option>',
    `</option><option value="none"${f.issue === 'none' ? ' selected' : ''}>Not in any issue</option>`,
  )

  return `<form class="filters" method="get" action="/qr/sheet">
  ${field('Search', `<input type="search" name="q" value="${escape(f.q ?? '')}" placeholder="Code, listing, article or shirt location">`, true)}
  ${field(
    'Opens',
    select(
      'target',
      options(
        QR_TARGET_TYPES.map((t) => ({ value: t, label: TARGET_LABELS[t] ?? t })),
        f.target,
      ),
    ),
  )}
  ${field(
    'Printed on',
    select(
      'placement',
      options(
        [
          { value: 'magazine-page', label: 'Magazine page' },
          { value: 't-shirt', label: 'T-shirt' },
        ],
        f.placement,
        'Everything',
      ),
    ),
  )}
  ${field('Issue', select('issue', issueOptions))}
  ${field('Article', select('article', options(articleChoices, f.article === null ? null : String(f.article))))}
  ${field(
    'Governorate',
    select(
      'governorate',
      options(
        GOVERNORATES.map((g) => ({ value: g.slug, label: g.en })),
        f.governorate,
      ),
    ),
  )}
  ${field('District', select('district', districtOptions))}
  ${field('Category', select('category', categoryOptions))}
  ${field(
    'Tier',
    select(
      'tier',
      options(
        LISTING_TIERS.map((t) => ({ value: t, label: t[0]!.toUpperCase() + t.slice(1) })),
        f.tier,
      ),
    ),
  )}
  ${field('Import batch', select('batch', options(batchChoices, f.batch)))}
  ${field(
    'Status',
    select(
      'status',
      options(
        [
          { value: 'inactive', label: 'Inactive only' },
          { value: 'all', label: 'Active and inactive' },
        ],
        f.status === 'active' ? null : f.status,
        'Active',
      ),
    ),
  )}
  ${field(
    'Scans',
    select(
      'scans',
      options(
        [
          { value: 'scanned', label: 'Scanned at least once' },
          { value: 'never', label: 'Never scanned' },
        ],
        f.scans === 'any' ? null : f.scans,
        'Any',
      ),
    ),
  )}
  ${field(
    'Website-only listings',
    select(
      'print',
      options(
        [{ value: 'all', label: 'Include them' }],
        f.printOnly ? null : 'all',
        'Hide (not printed)',
      ),
    ),
  )}
  ${field(
    'Sort by',
    select(
      'sort',
      options(
        [
          { value: 'scans', label: 'Most scanned' },
          { value: 'newest', label: 'Newest first' },
          { value: 'oldest', label: 'Oldest first' },
        ],
        f.sort === 'code' ? null : f.sort,
        'Code',
      ),
    ),
  )}
  ${field(
    'Per page',
    select(
      'per',
      PER_PAGE_OPTIONS.map(
        (n) => `<option value="${n}"${n === f.perPage ? ' selected' : ''}>${n}</option>`,
      ).join(''),
    ),
  )}
  ${field('Print size (mm)', `<input type="number" name="size" min="15" max="1000" value="${f.size ?? ''}" placeholder="${sizeMm}">`)}
  <div class="actions">
    <button type="submit">Apply filters</button>
    <a href="/qr/sheet">Clear all</a>
  </div>
</form>`
}

/** One removable chip per active filter, so what is narrowing the list is never a guess. */
function chips(f: SheetFilters, issueChoices: Choice[], articleChoices: Choice[]): string {
  const found = (choices: Choice[], value: string) =>
    choices.find((c) => c.value === value)?.label ?? value
  const list: [string, string][] = []
  const add = (label: string, key: FilterKey) =>
    list.push([label, `/qr/sheet${filterQuery(f, { [key]: null })}`])

  if (f.q) add(`Search: ${f.q}`, 'q')
  if (f.target) add(`Opens: ${TARGET_LABELS[f.target] ?? f.target}`, 'target')
  if (f.placement)
    add(`Printed on: ${f.placement === 't-shirt' ? 'T-shirt' : 'Magazine page'}`, 'placement')
  if (f.issue === 'none') add('Not in any issue', 'issue')
  else if (f.issue !== null) add(found(issueChoices, String(f.issue)), 'issue')
  if (f.article !== null) add(`Article: ${found(articleChoices, String(f.article))}`, 'article')
  if (f.governorate) add(GOVERNORATE_NAMES.get(f.governorate) ?? f.governorate, 'governorate')
  if (f.district) add(DISTRICT_NAMES.get(f.district) ?? f.district, 'district')
  if (f.category) add(CATEGORY_NAMES.get(f.category) ?? f.category, 'category')
  if (f.tier) add(`Tier: ${f.tier}`, 'tier')
  if (f.batch) add(`Batch: ${f.batch}`, 'batch')
  if (f.status !== 'active')
    add(f.status === 'inactive' ? 'Inactive only' : 'Active and inactive', 'status')
  if (f.scans !== 'any') add(f.scans === 'scanned' ? 'Scanned' : 'Never scanned', 'scans')
  if (!f.printOnly) add('Including website-only listings', 'print')

  if (list.length === 0) return ''
  return `<p class="chips">${list
    .map(
      ([label, href]) =>
        `<a class="chip" href="${escape(href)}" title="Remove this filter">${escape(label)} <b aria-hidden="true">&times;</b></a>`,
    )
    .join('')}</p>`
}

/**
 * Links to every matching code as individual files - all pages, not just this
 * one, and with every filter carried across. Somebody who has narrowed the
 * sheet and then downloads everything would otherwise be given the wrong files,
 * and would not find out until the layout.
 */
function downloads(f: SheetFilters, total: number): string {
  const base = filterQuery(f, { page: null, per: null, sort: null })
  const href = (format: string, transparent = false) =>
    `/qr/export${base}${base ? '&' : '?'}format=${format}${transparent ? '&transparent=1' : ''}`
  return `<div class="downloads">
  <span>Download all ${total} as files:</span>
  <a href="${escape(href('svg'))}">SVG</a>
  <a href="${escape(href('png'))}">PNG</a>
  <a href="${escape(href('svg', true))}">SVG, transparent</a>
  <a href="${escape(href('png', true))}">PNG, transparent</a>
  <small>SVG for print. Transparent is for a coloured layout, not for print.</small>
</div>`
}

function pager(f: SheetFilters, pageNumber: number, totalPages: number): string {
  if (totalPages <= 1) return ''
  const link = (n: number, text: string, current = false) =>
    current
      ? `<span class="on" aria-current="page">${text}</span>`
      : `<a href="${escape(`/qr/sheet${filterQuery(f, { page: n === 1 ? null : String(n) })}`)}">${text}</a>`

  const numbers = new Set<number>([1, totalPages])
  for (let n = pageNumber - 2; n <= pageNumber + 2; n += 1)
    if (n >= 1 && n <= totalPages) numbers.add(n)
  const sorted = [...numbers].sort((a, b) => a - b)

  const parts: string[] = []
  if (pageNumber > 1) parts.push(link(pageNumber - 1, '&larr; Previous'))
  sorted.forEach((n, i) => {
    if (i > 0 && n - sorted[i - 1]! > 1) parts.push('<span class="gap">&hellip;</span>')
    parts.push(link(n, String(n), n === pageNumber))
  })
  if (pageNumber < totalPages) parts.push(link(pageNumber + 1, 'Next &rarr;'))
  return `<nav class="pager" aria-label="Pages">${parts.join('')}</nav>`
}

/**
 * Shown when the codes encode a host the public cannot reach. Deliberately loud
 * and deliberately printed rather than hidden by the print stylesheet: a proof
 * that carries the warning cannot be mistaken for final artwork.
 */
function unsafeBaseBanner(): string {
  if (isPrintSafeBaseUrl()) return ''
  return `<p class="banner danger"><strong>Not for print.</strong> These codes encode
    <code>${escape(scanUrl('CODE'))}</code>. Anything printed from this sheet will fail for every
    reader, permanently. Set NEXT_PUBLIC_SITE_URL to the live https domain and generate again.</p>`
}

/**
 * Columns wide enough for the code at its printed size.
 *
 * The 200px minimum fits the default 25mm. A shirt code at 70mm is about 265px,
 * and in a narrower column it ran over the card's edge and into the next one.
 */
function gridColumns(sizeMm: number): string {
  const mm = Number.isFinite(sizeMm) && sizeMm > 0 ? Math.min(sizeMm, 1000) : 25
  return `grid-template-columns: repeat(auto-fill, minmax(max(200px, calc(${mm}mm + 32px)), 1fr))`
}

function page(input: {
  filters: SheetFilters
  problems: string[]
  sizeMm: number
  total: number
  first: number
  last: number
  pageNumber: number
  totalPages: number
  cards: string
  issueChoices: Choice[]
  articleChoices: Choice[]
  batchChoices: Choice[]
}): string {
  const f = input.filters
  const title = isFiltered(f) ? 'QR codes, filtered' : 'QR codes'
  const summary =
    input.total === 0
      ? 'No codes match these filters.'
      : `Showing ${input.first}&ndash;${input.last} of ${input.total} code${input.total === 1 ? '' : 's'}, at ${input.sizeMm} mm.`

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escape(title)} - Vardenia</title>
<style>
  :root {
    color-scheme: light;
    --ink: #16130f; --muted: #6b645b; --line: #e3ddd3; --soft: #f7f4ef; --accent: #16130f;
    --warn: #8a5a00; --warn-bg: #fff6e3; --danger: #9b1c1c; --danger-bg: #fdf1f1;
  }
  * { box-sizing: border-box; }
  body {
    font-family: ui-sans-serif, system-ui, -apple-system, 'Segoe UI', sans-serif;
    margin: 0; background: #fff; color: var(--ink); font-size: 14px; line-height: 1.45;
  }
  .wrap { max-width: 1440px; margin: 0 auto; padding: 28px 32px 48px; }
  header.top { display: flex; flex-wrap: wrap; align-items: baseline; justify-content: space-between; gap: 8px 24px; }
  h1 { font-size: 24px; margin: 0; letter-spacing: -0.01em; }
  .summary { color: var(--muted); margin: 4px 0 0; }
  .help { color: var(--muted); font-size: 13px; margin: 0; }

  .filters {
    margin: 20px 0 0; padding: 16px; background: var(--soft); border: 1px solid var(--line); border-radius: 10px;
    display: grid; grid-template-columns: repeat(auto-fill, minmax(190px, 1fr)); gap: 12px 14px; align-items: end;
  }
  .field { display: flex; flex-direction: column; gap: 4px; min-width: 0; }
  .field.wide { grid-column: span 2; }
  .field > span { font-size: 11px; font-weight: 600; letter-spacing: 0.06em; text-transform: uppercase; color: var(--muted); }
  .field select, .field input {
    width: 100%; font: inherit; color: var(--ink); background: #fff;
    border: 1px solid #cfc7bb; border-radius: 6px; padding: 7px 9px; min-height: 36px;
  }
  .field select:focus, .field input:focus { outline: 2px solid var(--ink); outline-offset: 1px; }
  .actions { display: flex; gap: 12px; align-items: center; }
  .actions button {
    font: inherit; font-weight: 600; color: #fff; background: var(--accent); border: 0; border-radius: 6px;
    padding: 9px 16px; cursor: pointer; min-height: 36px;
  }
  .actions a { color: var(--ink); }

  .chips { display: flex; flex-wrap: wrap; gap: 6px; margin: 14px 0 0; }
  .chip {
    display: inline-flex; gap: 6px; align-items: center; padding: 4px 10px; border-radius: 999px;
    background: var(--ink); color: #fff; text-decoration: none; font-size: 13px;
  }
  .chip b { font-weight: 400; opacity: 0.7; }
  .chip:hover b { opacity: 1; }

  .downloads { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; margin: 16px 0 0; font-size: 13px; }
  .downloads > span { font-weight: 600; }
  .downloads a {
    padding: 5px 10px; border: 1px solid #cfc7bb; border-radius: 6px; color: var(--ink); text-decoration: none; background: #fff;
  }
  .downloads a:hover { border-color: var(--ink); }
  .downloads small { color: var(--muted); }

  .banner { border-radius: 8px; padding: 10px 14px; margin: 16px 0 0; font-size: 13px; }
  .banner.notice { background: var(--warn-bg); color: var(--warn); border: 1px solid #f0d9a8; }
  .banner.danger { background: var(--danger-bg); color: var(--danger); border: 2px solid var(--danger); }
  .banner code { word-break: break-all; }

  .grid { display: grid; gap: 16px; margin: 20px 0 0; }
  .card {
    margin: 0; padding: 16px 12px 12px; border: 1px solid var(--line); border-radius: 10px; background: #fff;
    break-inside: avoid; page-break-inside: avoid;
    display: flex; flex-direction: column; align-items: center; gap: 10px;
  }
  .card.off { opacity: 0.55; }
  .code svg { display: block; }
  figcaption { display: flex; flex-direction: column; align-items: center; gap: 4px; text-align: center; width: 100%; }
  figcaption strong { font-size: 14px; line-height: 1.3; }
  .mono { font-family: ui-monospace, 'SF Mono', Consolas, monospace; font-size: 14px; letter-spacing: 0.1em; }
  .tags { display: flex; flex-wrap: wrap; justify-content: center; gap: 4px; margin-top: 2px; }
  .tag { font-size: 11px; padding: 1px 7px; border-radius: 999px; background: var(--soft); color: var(--muted); border: 1px solid var(--line); }
  .tag.strong { background: var(--ink); color: #fff; border-color: var(--ink); }
  .tag.warn { background: var(--warn-bg); color: var(--warn); border-color: #f0d9a8; }
  .url { font-size: 11px; color: var(--muted); word-break: break-all; }
  .empty { color: var(--muted); padding: 40px 0; text-align: center; }

  .pager { display: flex; flex-wrap: wrap; gap: 6px; justify-content: center; margin: 28px 0 0; }
  .pager a, .pager span {
    min-width: 36px; padding: 6px 10px; border-radius: 6px; text-align: center; text-decoration: none; color: var(--ink);
    border: 1px solid var(--line);
  }
  .pager a:hover { border-color: var(--ink); }
  .pager .on { background: var(--ink); color: #fff; border-color: var(--ink); }
  .pager .gap { border: 0; color: var(--muted); }

  @media (max-width: 640px) {
    .wrap { padding: 16px; }
    .filters { grid-template-columns: repeat(2, minmax(0, 1fr)); padding: 12px; }
    .field.wide, .actions { grid-column: 1 / -1; }
  }
  /* On paper: the codes and their names, nothing to click. */
  @media print {
    .wrap { padding: 0; max-width: none; }
    .filters, .chips, .downloads, .pager, .help, .tags, .url, .banner.notice { display: none; }
    .card { border-color: #999; border-radius: 4px; }
    .card.off { opacity: 1; }
  }
</style>
</head>
<body>
<div class="wrap">
<header class="top">
  <div>
    <h1>${escape(title)}</h1>
    <p class="summary">${summary}</p>
  </div>
  <p class="help">Check every name against the layout before it goes to press. Print with Ctrl+P: filters and buttons are left off the paper.</p>
</header>
${filterForm(f, input.sizeMm, input.issueChoices, input.articleChoices, input.batchChoices)}
${chips(f, input.issueChoices, input.articleChoices)}
${input.problems.length > 0 ? `<p class="banner notice">${input.problems.map(escape).join(' ')}</p>` : ''}
${unsafeBaseBanner()}
${input.total > 0 ? downloads(f, input.total) : ''}
${input.cards ? `<div class="grid" style="${gridColumns(input.sizeMm)}">${input.cards}</div>` : `<p class="empty">${input.total > 0 ? 'Nothing on this page. Go back to page 1.' : 'No codes match. Remove a filter above, or clear them all.'}</p>`}
${pager(f, input.pageNumber, input.totalPages)}
</div>
</body>
</html>`
}
