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
  LISTING_GOVERNORATES,
  nextFreeNumber,
  orphanedNumbers,
  rangeProblem,
  type NumberRange,
} from '@vardenia/core'
import { isStaff } from '../access/index'

const GOVERNORATE_LABELS: Record<(typeof LISTING_GOVERNORATES)[number], string> = {
  keserwan: 'Keserwan',
  'north-lebanon': 'North Lebanon',
  beirut: 'Beirut',
  beqaa: 'Beqaa',
  'south-lebanon': 'South Lebanon',
  chouf: 'Chouf',
  matn: 'Matn',
}

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
 * The numbers listings of this governorate hold in this issue.
 *
 * Injectable: the businesses fields that carry them (`issue`, `listingNumber`)
 * arrive after this collection, so the generated types do not know them yet.
 */
export async function heldNumbers(
  payload: Payload,
  issueId: number | string,
  governorate: string,
  req?: PayloadRequest,
): Promise<number[]> {
  const found = await payload.find({
    collection: 'businesses',
    // Cast: `issue` and `listingNumber` are not in the generated types until
    // the businesses fields are added and the types regenerated.
    where: {
      and: [
        { issue: { equals: issueId } },
        { governorate: { equals: governorate } },
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

const checkRange: CollectionBeforeValidateHook = async ({ data, originalDoc, operation, req }) => {
  const merged = { ...(originalDoc ?? {}), ...(data ?? {}) } as {
    issue?: unknown
    governorate?: string
    from?: number
    to?: number
  }
  const issueId = idOf(merged.issue)
  if (issueId === null || !merged.governorate || !req?.payload) return data
  const { payload } = req

  const issue = await payload.findByID({
    collection: 'issues',
    id: issueId,
    depth: 0,
    overrideAccess: true,
  })
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

  // REST and local API writes may leave `from` out; start after the last block.
  const from =
    typeof merged.from === 'number'
      ? merged.from
      : nextFreeNumber(siblings.docs as unknown as NumberRange[])
  if (data && typeof data.from !== 'number') data.from = from

  /*
   * Moving a range to another governorate or issue (21 November 2026, auth
   * audit step 8). The checks below look at the range's new place, so the
   * numbers listings hold in its old place were left outside any range. A
   * range whose old place still has numbers in use stays where it is.
   */
  if (operation === 'update' && originalDoc) {
    const oldIssue = idOf(originalDoc.issue)
    const oldGovernorate = originalDoc.governorate as string | undefined
    const moved =
      oldIssue !== null &&
      oldGovernorate !== undefined &&
      (String(oldIssue) !== String(issueId) || oldGovernorate !== merged.governorate)
    if (moved) {
      const stranded = await heldNumbers(payload, oldIssue, oldGovernorate, req)
      if (stranded.length > 0) {
        throw new APIError(
          `Listings in ${oldGovernorate} already hold ${[...stranded].sort((a, b) => a - b).join(', ')} in this range. Give them other numbers before moving it.`,
          400,
          null,
          true,
        )
      }
    }
  }

  const held =
    operation === 'update' ? await heldNumbers(payload, issueId, merged.governorate, req) : []

  const problem = validateRangeAgainstIssue({
    candidate: {
      governorate: merged.governorate,
      from,
      to: merged.to as number,
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
  })) as unknown as { issue?: unknown; governorate?: string }
  const issueId = idOf(range.issue)
  if (issueId === null || !range.governorate) return
  const held = await heldNumbers(req.payload, issueId, range.governorate, req)
  if (held.length === 0) return
  throw new APIError(
    `Listings already hold ${[...held].sort((a, b) => a - b).join(', ')} in this range. Give them other numbers before deleting it.`,
    400,
    null,
    true,
  )
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
    defaultColumns: ['issue', 'governorate', 'from', 'to'],
    group: 'Magazine',
    description:
      "Each governorate owns one block of the issue's listing numbers. Blocks cannot overlap or run past the issue total.",
  },
  access: { read: isStaff, create: isStaff, update: isStaff, delete: isStaff },
  // One row per governorate per issue; also stops a double-click making two.
  indexes: [{ fields: ['issue', 'governorate'], unique: true }],
  hooks: { beforeValidate: [checkRange], beforeDelete: [refuseDeletingHeldRange] },
  fields: [
    { name: 'issue', type: 'relationship', relationTo: 'issues', required: true, index: true },
    {
      name: 'governorate',
      type: 'select',
      required: true,
      options: LISTING_GOVERNORATES.map((value) => ({ label: GOVERNORATE_LABELS[value], value })),
    },
    {
      name: 'from',
      label: 'From number',
      type: 'number',
      required: true,
      min: 1,
      // Starts after the highest number any range reaches, so a new
      // governorate's block begins where the last one ended. A best guess: the
      // default cannot see which issue the form has chosen, so it uses the
      // most recently created one. The beforeValidate hook still validates,
      // and fills `from`, for the issue actually chosen.
      defaultValue: ({ req }: { req?: { payload?: Payload } }) => nextFromDefault(req?.payload),
    },
    { name: 'to', label: 'To number', type: 'number', required: true, min: 1 },
  ],
}
