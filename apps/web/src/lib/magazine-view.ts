import type { Payload } from 'payload'
import {
  TEMPLATE_PAGE_SHAPE,
  buildMagazinePages,
  isTemplatePageKind,
  type MagazinePage,
  type MagazineRegion,
} from '@vardenia/core'
import { issuePageCount, toSlots } from '../collections/Issues'
import { resolvePhotograph } from './media'
import { richTextToPlain } from './plain-text'

/**
 * What the magazine viewer reads: one issue's pages, its governorate blocks,
 * and the businesses that hold a number, reduced to what a printed page shows.
 *
 * The issue's slots and template are staff-only, so everything is read with
 * overrideAccess here and only the fields below leave the server. A business
 * is mapped field by field, never spread: no owner contact, no `submission`,
 * no ids, no status.
 */

/** Statuses of a business whose owner has submitted and reserved the number. */
export const VISIBLE_STATUSES = [
  'awaiting_downpayment',
  'pending',
  'accepted',
  'paid',
  'approved',
] as const

export interface MagazineBusiness {
  number: number
  name: string
  tagline: string
  category: string
  governorate: string
  address: string
  hours: string
  phone: string
  description: string
  /** Media size `card`; null when the business has no photograph. */
  photoUrl: string | null
}

export interface MagazineData {
  issue: { id: number; title: string }
  pages: MagazinePage[]
  regions: MagazineRegion[]
  businesses: MagazineBusiness[]
}

const text = (value: unknown): string => (typeof value === 'string' ? value : '')

const DAY_ORDER = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const
const DAY_SHORT: Record<string, string> = {
  mon: 'Mon',
  tue: 'Tue',
  wed: 'Wed',
  thu: 'Thu',
  fri: 'Fri',
  sat: 'Sat',
  sun: 'Sun',
}

/**
 * Opening hours as one short line: days in a row with the same hours are
 * joined ("Mon-Fri 09:00-23:00, Sat closed"). Empty when hours are not set.
 */
export function hoursLine(value: unknown): string {
  if (!Array.isArray(value)) return ''
  const byDay = new Map<string, string>()
  for (const raw of value) {
    const row = (raw ?? {}) as Record<string, unknown>
    const day = text(row.day)
    if (!(DAY_ORDER as readonly string[]).includes(day) || byDay.has(day)) continue
    if (row.closed === true) byDay.set(day, 'closed')
    else if (text(row.opens) && text(row.closes))
      byDay.set(day, `${text(row.opens)}-${text(row.closes)}`)
  }
  const parts: string[] = []
  let start = 0
  while (start < DAY_ORDER.length) {
    const first = DAY_ORDER[start] as string
    const hours = byDay.get(first)
    if (!hours) {
      start++
      continue
    }
    let end = start
    while (end + 1 < DAY_ORDER.length && byDay.get(DAY_ORDER[end + 1] as string) === hours) end++
    const last = DAY_ORDER[end] as string
    const days =
      end > start ? `${DAY_SHORT[first]}-${DAY_SHORT[last]}` : (DAY_SHORT[first] as string)
    parts.push(`${days} ${hours}`)
    start = end + 1
  }
  return parts.join(', ')
}

/** The template's note for each page number, walking its pages as the slots are numbered. */
function templateNotes(templatePages: unknown): Record<number, string | null> {
  const notes: Record<number, string | null> = {}
  if (!Array.isArray(templatePages)) return notes
  let page = 1
  for (const raw of templatePages) {
    const row = (raw ?? {}) as { layout?: unknown; note?: unknown }
    if (!isTemplatePageKind(row.layout)) continue
    const note = typeof row.note === 'string' && row.note.trim() ? row.note.trim() : null
    notes[page] = note
    page += TEMPLATE_PAGE_SHAPE[row.layout].pages
  }
  return notes
}

const idOf = (value: unknown): number | null => {
  if (typeof value === 'number') return value
  if (value && typeof value === 'object' && typeof (value as { id?: unknown }).id === 'number') {
    return (value as { id: number }).id
  }
  return null
}

function toBusiness(raw: Record<string, unknown>): MagazineBusiness | null {
  const number = raw.listingNumber
  if (typeof number !== 'number') return null
  const contact = (raw.contact ?? {}) as { phone?: unknown }
  const photo = resolvePhotograph(raw.heroImage as never, 'card')
  return {
    number,
    name: text(raw.name),
    tagline: text(raw.tagline),
    category: text(raw.category),
    governorate: text(raw.governorate),
    address: text(raw.address),
    hours: hoursLine(raw.openingHours),
    phone: text(contact.phone),
    description: richTextToPlain(raw.description),
    photoUrl: photo?.src ?? null,
  }
}

/**
 * One issue for the viewer. `not-found` for an unknown issue; `no-slots` for
 * an issue made before templates (nothing to draw).
 */
export async function loadMagazine(
  payload: Payload,
  issueId: number,
  locale: string | undefined,
): Promise<MagazineData | { problem: 'not-found' | 'no-slots' }> {
  const localeArg = locale ? { locale: locale as never } : {}
  const issue = (await payload.findByID({
    collection: 'issues',
    id: issueId,
    depth: 0,
    select: { title: true, slots: true, pageCount: true, template: true } as never,
    overrideAccess: true,
    disableErrors: true,
    ...localeArg,
  } as never)) as {
    title?: unknown
    slots?: unknown
    pageCount?: unknown
    template?: unknown
  } | null
  if (!issue) return { problem: 'not-found' }
  const slots = toSlots(issue.slots)
  if (slots.length === 0) return { problem: 'no-slots' }
  const pageCount = issuePageCount(issue.pageCount, slots)

  const templateId = idOf(issue.template)
  const template =
    templateId === null
      ? null
      : ((await payload.findByID({
          collection: 'templates',
          id: templateId,
          depth: 0,
          select: { pages: true } as never,
          overrideAccess: true,
          disableErrors: true,
        } as never)) as { pages?: unknown } | null)

  const ranges = await payload.find({
    collection: 'listing-ranges',
    where: { issue: { equals: issueId } },
    select: { governorate: true, firstPage: true, lastPage: true } as never,
    limit: 0,
    pagination: false,
    depth: 0,
    overrideAccess: true,
  })
  const regions = (ranges.docs as unknown as Record<string, unknown>[]).flatMap(
    (row): MagazineRegion[] =>
      typeof row.governorate === 'string' &&
      typeof row.firstPage === 'number' &&
      typeof row.lastPage === 'number'
        ? [{ governorate: row.governorate, firstPage: row.firstPage, lastPage: row.lastPage }]
        : [],
  )

  const found = await payload.find({
    collection: 'businesses',
    where: {
      and: [
        { issue: { equals: issueId } },
        { listingNumber: { exists: true } },
        { isSample: { not_equals: true } },
        { 'submission.status': { in: [...VISIBLE_STATUSES] } },
      ],
    } as never,
    select: {
      name: true,
      tagline: true,
      category: true,
      governorate: true,
      address: true,
      openingHours: true,
      contact: { phone: true },
      description: true,
      heroImage: true,
      listingNumber: true,
      isSample: true,
      submission: { status: true },
    } as never,
    depth: 1,
    pagination: false,
    limit: 0,
    overrideAccess: true,
    ...localeArg,
  })
  const visible = new Set<string>(VISIBLE_STATUSES)
  const seen = new Set<number>()
  const businesses = (found.docs as unknown as Record<string, unknown>[])
    .filter((doc) => {
      const status = (doc.submission as { status?: unknown } | null | undefined)?.status
      return doc.isSample !== true && typeof status === 'string' && visible.has(status)
    })
    .flatMap((doc) => {
      const business = toBusiness(doc)
      if (!business || seen.has(business.number)) return []
      seen.add(business.number)
      return [business]
    })
    .sort((a, b) => a.number - b.number)

  return {
    issue: { id: issueId, title: text(issue.title) },
    pages: buildMagazinePages(slots, pageCount, templateNotes(template?.pages)),
    regions,
    businesses,
  }
}
