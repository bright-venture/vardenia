import { APIError } from 'payload'
import type {
  CollectionBeforeDeleteHook,
  CollectionBeforeValidateHook,
  CollectionConfig,
  Payload,
  PayloadRequest,
} from 'payload'
import {
  DEFAULT_LISTING_TOTAL,
  GOVERNORATES,
  LISTING_GOVERNORATES,
  blockNumbers,
  blockProblem,
  blocksOverlap,
  coverageOf,
  nextFreeNumber,
  PAGE_LAYOUT_LABELS,
  orphanedNumbers,
  rangePlaceProblem,
  rangeProblem,
  type NumberRange,
  type PageBlock,
} from '@vardenia/core'
import { isStaff } from '../access/index'
import { GOVERNORATE_NAMES, issuePageCount, toSlots } from './Issues'
import { cityOptions } from './options'

/** Which governorate each city belongs to. */
const CITY_PARENT: Record<string, string> = Object.fromEntries(
  GOVERNORATES.flatMap((g) => g.cities.map((city) => [city.slug, g.slug])),
)

/** A city as the admin or the API hands it in; blank is none. */
const cityOrNull = (value: unknown): string | null =>
  typeof value === 'string' && value !== '' ? value : null

const idOf = (value: unknown): number | string | null => {
  if (typeof value === 'number' || typeof value === 'string') return value
  const id = (value as { id?: unknown } | null)?.id
  return typeof id === 'number' || typeof id === 'string' ? id : null
}

/**
 * Why a governorate's range cannot be saved, or null when it can.
 *
 * `others` is the issue's other ranges without the row being edited, and `held`
 * is every number a listing of this governorate and issue already holds. Pure,
 * so the rules are tested without a database.
 */
export function validateRangeAgainstIssue(args: {
  candidate: NumberRange
  others: readonly NumberRange[]
  total: number
  held: readonly number[]
}): string | null {
  const problem = rangeProblem(args.candidate, args.others, args.total)
  if (problem) return problem
  const orphaned = orphanedNumbers(args.held, args.candidate)
  return orphaned.length > 0
    ? `Listings already hold ${orphaned.join(', ')}, which this range would no longer cover.`
    : null
}

/**
 * The numbers listings hold in one block of this issue: the listings of its
 * governorate, and of its city when the block has one (an issue for one
 * governorate). A governorate-wide block (All Lebanon) looks at every listing
 * of the governorate, as before.
 *
 * Injectable: the businesses fields that carry them (`issue`, `listingNumber`)
 * arrive after this collection, so the generated types do not know them yet.
 */
export async function heldNumbers(
  payload: Payload,
  issueId: number | string,
  place: { governorate: string; city?: string | null },
  req?: PayloadRequest,
): Promise<number[]> {
  const city = cityOrNull(place.city)
  const found = await payload.find({
    collection: 'businesses',
    // Cast: `issue` and `listingNumber` are not in the generated types until
    // the businesses fields are added and the types regenerated.
    where: {
      and: [
        { issue: { equals: issueId } },
        { governorate: { equals: place.governorate } },
        ...(city ? [{ city: { equals: city } }] : []),
        { listingNumber: { exists: true } },
      ],
    } as never,
    select: { listingNumber: true } as never,
    limit: 0,
    pagination: false,
    depth: 0,
    overrideAccess: true,
    ...(req ? { req } : {}),
  })
  return (found.docs as unknown as { listingNumber?: number | null }[])
    .map((d) => d.listingNumber)
    .filter((n): n is number => typeof n === 'number')
}

/** The next free number in the latest issue's ranges; undefined without an issue. */
export async function nextFromDefault(payload: Payload | undefined): Promise<number | undefined> {
  if (!payload) return undefined
  const latest = await payload.find({
    collection: 'issues',
    sort: '-id',
    limit: 1,
    depth: 0,
    overrideAccess: true,
  })
  const issue = latest.docs[0]
  if (!issue) return undefined
  const existing = await payload.find({
    collection: 'listing-ranges',
    where: { issue: { equals: issue.id } },
    limit: 0,
    pagination: false,
    depth: 0,
    overrideAccess: true,
  })
  return nextFreeNumber(existing.docs as unknown as NumberRange[])
}

/** A page as the admin or the API hands it in; blank is null. */
const pageOrNull = (value: unknown): number | null =>
  value === null || value === undefined || value === '' ? null : Number(value)

/** The other governorates' page blocks; a range with no pages (typed numbers) has none. */
const siblingBlocks = (docs: readonly unknown[]): PageBlock[] =>
  docs.flatMap((raw) => {
    const d = raw as { firstPage?: unknown; lastPage?: unknown }
    const firstPage = pageOrNull(d.firstPage)
    const lastPage = pageOrNull(d.lastPage)
    return firstPage === null || lastPage === null ? [] : [{ firstPage, lastPage }]
  })

/**
 * `from` and `to` stay required in the database; on an issue with a template
 * the hook fills them from the pages, so the admin may leave them blank when
 * both pages are given.
 */
const numberOrPages = (
  value: unknown,
  { siblingData }: { siblingData?: Record<string, unknown> },
) => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value >= 1 ? true : 'The number must be at least 1.'
  }
  const pagesGiven =
    pageOrNull(siblingData?.firstPage) !== null && pageOrNull(siblingData?.lastPage) !== null
  return pagesGiven
    ? true
    : 'Enter a number, or the first and last page on an issue with a template.'
}

const checkRange: CollectionBeforeValidateHook = async ({ data, originalDoc, operation, req }) => {
  const merged = { ...(originalDoc ?? {}), ...(data ?? {}) } as {
    issue?: unknown
    governorate?: string
    city?: unknown
    from?: number
    to?: number
    firstPage?: unknown
    lastPage?: unknown
  }
  const issueId = idOf(merged.issue)
  if (issueId === null || !req?.payload) return data
  const { payload } = req

  const issue = await payload.findByID({
    collection: 'issues',
    id: issueId,
    depth: 0,
    overrideAccess: true,
  })
  // An issue for one governorate fixes the range's governorate: it is taken
  // from the issue, whatever was sent, so a range can never name another.
  const issueGovernorate = (issue as { governorate?: unknown }).governorate
  if (
    coverageOf((issue as { coverage?: unknown }).coverage) === 'governorate' &&
    typeof issueGovernorate === 'string' &&
    issueGovernorate
  ) {
    merged.governorate = issueGovernorate
    if (data) data.governorate = issueGovernorate
  }
  if (!merged.governorate) return data
  const city = cityOrNull(merged.city)
  // A blank select is no city (stored NULL, which the unique indexes rely on).
  if (data && 'city' in data && city === null) data.city = null

  const total = (issue as { listingTotal?: number | null }).listingTotal ?? DEFAULT_LISTING_TOTAL

  const siblings = await payload.find({
    collection: 'listing-ranges',
    where: {
      and: [
        { issue: { equals: issueId } },
        ...(operation === 'update' && originalDoc?.id !== undefined
          ? [{ id: { not_equals: originalDoc.id } }]
          : []),
      ],
    },
    limit: 0,
    pagination: false,
    depth: 0,
    overrideAccess: true,
  })

  // The issue's coverage decides whether this block names a city (core rangePlaceProblem).
  const placeProblem = rangePlaceProblem({
    issue: issue as { coverage?: unknown; governorate?: unknown },
    governorate: merged.governorate,
    city,
    others: siblings.docs as unknown as { governorate: string; city?: string | null }[],
  })
  if (placeProblem) throw new APIError(placeProblem, 400, null, true)

  /*
   * An issue built from a template: the admin enters the governorate's pages,
   * and its numbers are the slots on those pages (contiguous, because slots are
   * numbered in page order). Blocks stay inside the template, do not overlap,
   * and never cut a spread in two. Issues without slots keep typed numbers.
   */
  const slots = toSlots((issue as { slots?: unknown }).slots)
  let derived: { from: number; to: number } | null = null
  if (slots.length > 0) {
    const firstPage = pageOrNull(merged.firstPage)
    const lastPage = pageOrNull(merged.lastPage)
    if (firstPage === null || lastPage === null) {
      throw new APIError(
        "This issue is built from a template: enter the first and last page of the governorate's block.",
        400,
        null,
        true,
      )
    }
    const block: PageBlock = { firstPage, lastPage }
    const problem =
      // The template's pages, so a block may end on pages without listings (back cover).
      blockProblem(
        slots,
        block,
        issuePageCount((issue as { pageCount?: unknown }).pageCount, slots),
      ) ?? blocksOverlap([block, ...siblingBlocks(siblings.docs)])
    if (problem) throw new APIError(problem, 400, null, true)
    derived = blockNumbers(slots, block)
    if (!derived) {
      // Only pages without listings (cover, separator): nothing to number.
      throw new APIError(
        `Pages ${firstPage}-${lastPage} hold no listing (only pages without listings). Choose pages that include listings.`,
        400,
        null,
        true,
      )
    }
    if (data) {
      data.from = derived.from
      data.to = derived.to
    }
  }

  // REST and local API writes may leave `from` out; start after the last block.
  const from = derived
    ? derived.from
    : typeof merged.from === 'number'
      ? merged.from
      : nextFreeNumber(siblings.docs as unknown as NumberRange[])
  if (data && typeof data.from !== 'number') data.from = from
  const to = derived ? derived.to : merged.to
  if (typeof to !== 'number') {
    throw new APIError(
      'This issue has no template: enter the from and to numbers.',
      400,
      null,
      true,
    )
  }

  /*
   * Moving a range to another governorate or issue (21 November 2026, auth
   * audit step 8). The checks below look at the range's new place, so the
   * numbers listings hold in its old place were left outside any range. A
   * range whose old place still has numbers in use stays where it is.
   */
  if (operation === 'update' && originalDoc) {
    const oldIssue = idOf(originalDoc.issue)
    const oldGovernorate = originalDoc.governorate as string | undefined
    const oldCity = cityOrNull(originalDoc.city)
    const moved =
      oldIssue !== null &&
      oldGovernorate !== undefined &&
      (String(oldIssue) !== String(issueId) ||
        oldGovernorate !== merged.governorate ||
        oldCity !== city)
    if (moved) {
      const stranded = await heldNumbers(
        payload,
        oldIssue,
        { governorate: oldGovernorate, city: oldCity },
        req,
      )
      if (stranded.length > 0) {
        throw new APIError(
          `Listings in ${oldCity ? `${oldGovernorate} / ${oldCity}` : oldGovernorate} already hold ${[...stranded].sort((a, b) => a - b).join(', ')} in this range. Give them other numbers before moving it.`,
          400,
          null,
          true,
        )
      }
    }
  }

  const held =
    operation === 'update'
      ? await heldNumbers(payload, issueId, { governorate: merged.governorate, city }, req)
      : []

  const problem = validateRangeAgainstIssue({
    candidate: {
      governorate: merged.governorate,
      city,
      from,
      to,
    },
    others: siblings.docs as unknown as NumberRange[],
    total,
    held,
  })
  // Public 400: a plain Error is a hidden 500 and staff would read only
  // "Something went wrong." instead of the rule they broke.
  if (problem) throw new APIError(problem, 400, null, true)
  return data
}

/**
 * Deleting a range is the extreme case of shrinking it: each number a listing
 * holds in it would belong to no range, and every later save of that listing
 * would fail with "This issue has no number range". Refused while any is held.
 */
const refuseDeletingHeldRange: CollectionBeforeDeleteHook = async ({ id, req }) => {
  const range = (await req.payload.findByID({
    collection: 'listing-ranges',
    id,
    depth: 0,
    overrideAccess: true,
    req,
  })) as unknown as { issue?: unknown; governorate?: string; city?: unknown }
  const issueId = idOf(range.issue)
  if (issueId === null || !range.governorate) return
  const held = await heldNumbers(
    req.payload,
    issueId,
    { governorate: range.governorate, city: cityOrNull(range.city) },
    req,
  )
  if (held.length === 0) return
  throw new APIError(
    `Listings already hold ${[...held].sort((a, b) => a - b).join(', ')} in this range. Give them other numbers before deleting it.`,
    400,
    null,
    true,
  )
}

/**
 * "Slots 33-60: 28 slots (Half page 28)": what a block's numbers hold, read off
 * the issue's slots. Shown read-only on the range, so staff see how many
 * listings the page range took without counting.
 */
export function blockSlotSummary(slotsValue: unknown, from: unknown, to: unknown): string {
  if (typeof from !== 'number' || typeof to !== 'number') return ''
  const inside = toSlots(slotsValue).filter((slot) => slot.number >= from && slot.number <= to)
  if (inside.length === 0) return 'No slots in this block.'
  const byLayout = new Map<string, number>()
  for (const slot of inside) {
    byLayout.set(slot.layout, (byLayout.get(slot.layout) ?? 0) + 1)
  }
  const parts = [...byLayout].map(
    ([layout, count]) =>
      `${PAGE_LAYOUT_LABELS[layout as keyof typeof PAGE_LAYOUT_LABELS]} ${count}`,
  )
  return `Slots ${from}-${to}: ${inside.length} ${inside.length === 1 ? 'slot' : 'slots'} (${parts.join(', ')}).`
}

/**
 * A governorate's block of the magazine's numbers, for one issue.
 *
 * Staff only on every operation: the public numbers route reads with
 * overrideAccess, so the ranges are not exposed through the REST API.
 */
export const ListingRanges: CollectionConfig = {
  slug: 'listing-ranges',
  labels: { singular: 'Listing number range', plural: 'Listing number ranges' },
  admin: {
    useAsTitle: 'governorate',
    defaultColumns: ['issue', 'governorate', 'city', 'firstPage', 'lastPage', 'from', 'to'],
    group: 'Magazine',
    description:
      "Each governorate owns one block of the issue's listing numbers; on an issue for one governorate, each of its cities does. Blocks cannot overlap or run past the issue total.",
  },
  access: { read: isStaff, create: isStaff, update: isStaff, delete: isStaff },
  /*
   * One row per governorate and city per issue; also stops a double-click
   * making two. Postgres treats NULL cities as distinct, so this alone would
   * let an All Lebanon issue have two governorate-wide rows for one
   * governorate: migration 20261127_110000 adds a partial unique index on
   * (issue, governorate) WHERE city IS NULL for that, and the hook (core
   * rangePlaceProblem) refuses it first with a readable message.
   */
  indexes: [{ fields: ['issue', 'governorate', 'city'], unique: true }],
  hooks: { beforeValidate: [checkRange], beforeDelete: [refuseDeletingHeldRange] },
  fields: [
    { name: 'issue', type: 'relationship', relationTo: 'issues', required: true, index: true },
    {
      name: 'governorate',
      type: 'select',
      required: true,
      options: LISTING_GOVERNORATES.map((value) => ({ label: GOVERNORATE_NAMES[value], value })),
      // Fixed by the issue when it covers one governorate (the hook enforces it).
      admin: {
        components: { Field: '/components/admin/RangeGovernorateField#RangeGovernorateField' },
      },
    },
    {
      // Only on an issue for one governorate (Issues `coverage`); the hook
      // enforces it either way.
      name: 'city',
      label: 'City',
      type: 'select',
      options: cityOptions,
      // The same values as a business's city, so the same database type.
      enumName: 'enum_businesses_city',
      filterOptions: ({ options, data }) => {
        const governorate = (data as { governorate?: unknown } | undefined)?.governorate
        return typeof governorate === 'string' && governorate
          ? options.filter(
              (option) =>
                CITY_PARENT[typeof option === 'string' ? option : option.value] === governorate,
            )
          : options
      },
      admin: {
        description:
          "For an issue that covers one governorate: the city this block is for, one of that governorate's cities (each city once). Businesses of that city are offered only this block. Leave empty on an All Lebanon issue.",
      },
    },
    {
      name: 'firstPage',
      label: 'First page',
      type: 'number',
      min: 1,
      admin: {
        step: 1,
        description:
          "For an issue built from a template: the governorate's first and last page. The numbers are then filled from the slots on those pages.",
      },
    },
    { name: 'lastPage', label: 'Last page', type: 'number', min: 1, admin: { step: 1 } },
    {
      name: 'from',
      label: 'From number',
      type: 'number',
      required: true,
      min: 1,
      validate: numberOrPages,
      // Not shown: with a template the hook fills it from the pages (see the
      // slot count below). Still stored, and still the number the rest of the
      // code reads.
      admin: { hidden: true },
      // Starts after the highest number any range reaches, so a new
      // governorate's block begins where the last one ended. A best guess: the
      // default cannot see which issue the form has chosen, so it uses the
      // most recently created one. The beforeValidate hook still validates,
      // and fills `from`, for the issue actually chosen.
      defaultValue: ({ req }: { req?: { payload?: Payload } }) => nextFromDefault(req?.payload),
    },
    {
      name: 'to',
      label: 'To number',
      type: 'number',
      required: true,
      min: 1,
      validate: numberOrPages,
      admin: { hidden: true },
    },
    {
      // Worked out on read from the issue's slots and this block's numbers.
      name: 'slotSummary',
      label: 'Slots in this block',
      type: 'textarea',
      virtual: true,
      access: { create: () => false, update: () => false },
      admin: {
        readOnly: true,
        description: 'Filled from the pages when you save.',
        condition: (_data, _sibling, { operation }) => operation === 'update',
      },
      hooks: {
        afterRead: [
          async ({ data, req }) => {
            const issueId = idOf(data?.issue)
            if (issueId === null) return ''
            const issue = (await req.payload
              .findByID({
                collection: 'issues',
                id: issueId,
                depth: 0,
                overrideAccess: true,
                req,
                select: { slots: true },
              })
              .catch(() => null)) as { slots?: unknown } | null
            return blockSlotSummary(issue?.slots, data?.from, data?.to)
          },
        ],
      },
    },
  ],
}
