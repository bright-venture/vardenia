import {
  APIError,
  type CollectionBeforeChangeHook,
  type CollectionBeforeValidateHook,
  type CollectionConfig,
  type PayloadRequest,
} from 'payload'
import { anyone, isAdmin, isStaff, isStaffFieldLevel } from '../access/index'
import {
  DEFAULT_LISTING_TOTAL,
  PAGE_LAYOUTS,
  PAGE_LAYOUT_LABELS,
  buildSlots,
  isPageLayout,
  priceRowsDropped,
  priceRowsProblem,
  slotLabel,
  slotLastPage,
  templateTotals,
  totalProblem,
  type PriceRow,
  type Slot,
  type TemplatePage,
  type TemplatePageKind,
} from '@vardenia/core'
import { slugField } from '../fields/slug'
import { markMediaAttached } from '../hooks/markMediaAttached'

/** Why the listing total cannot drop to this value, given the issue's ranges. */
export function checkListingTotal(total: number, ranges: readonly { to: number }[]): string | null {
  return totalProblem(
    total,
    ranges.reduce((high, r) => Math.max(high, r.to), 0),
  )
}

/** A number cell as the admin or the API hands it in; blank is null. */
const numberOrNull = (value: unknown): number | null =>
  value === null || value === undefined || value === '' ? null : Number(value)

const idOf = (value: unknown): number | string | null => {
  if (typeof value === 'number' || typeof value === 'string') return value
  const id = (value as { id?: unknown } | null)?.id
  return typeof id === 'number' || typeof id === 'string' ? id : null
}

const sameId = (a: unknown, b: unknown): boolean => String(idOf(a)) === String(idOf(b))

/**
 * The stored price rows, in the shape the core rules read. A row whose layout
 * is not one of the five is left out here; the select field refuses it.
 */
export function toPriceRows(value: unknown): PriceRow[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((raw) => {
    const r = (raw ?? {}) as Record<string, unknown>
    if (!isPageLayout(r.layout)) return []
    return [{ layout: r.layout, offered: r.offered === true, price: numberOrNull(r.price) }]
  })
}

const wholeNumber = (v: unknown, min: number): v is number =>
  typeof v === 'number' && Number.isInteger(v) && v >= min

/**
 * The issue's stored slots (json), as core Slots. Anything malformed is left
 * out: the hook alone writes them, so that only happens if the column was
 * edited by hand, and a missing slot is refused later rather than sold.
 */
/** "1: Pages 1-2 (Full spread)", one line per slot, for the admin. Empty without slots. */
export function issueSlotList(value: unknown): string {
  const slots = toSlots(value)
  if (slots.length === 0) return ''
  return slots
    .map((slot) => `${slot.number}: ${slotLabel(slot)} (${PAGE_LAYOUT_LABELS[slot.layout]})`)
    .join('\n')
}

export function toSlots(value: unknown): Slot[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((raw) => {
    const s = (raw ?? {}) as Record<string, unknown>
    if (!wholeNumber(s.number, 1) || !wholeNumber(s.page, 1) || !isPageLayout(s.layout)) return []
    if (s.position !== null && !wholeNumber(s.position, 1)) return []
    return [
      { number: s.number, page: s.page, position: s.position as number | null, layout: s.layout },
    ]
  })
}

/** The pages a set of slots spans: the last page of the last slot. */
export const slotsPageCount = (slots: readonly Slot[]): number =>
  slots.reduce((high, s) => Math.max(high, slotLastPage(s)), 0)

/**
 * The pages of an issue built from a template. The slots alone cannot tell:
 * pages without listings at the end (back cover) hold no slot. So the
 * template's total, stored as `pageCount` when it was assigned, is kept, as
 * long as it covers every slot; otherwise the slots' last page.
 */
export const issuePageCount = (stored: unknown, slots: readonly Slot[]): number => {
  const spanned = slotsPageCount(slots)
  return wholeNumber(stored, Math.max(spanned, 1)) ? stored : spanned
}

/**
 * What the issue checks read from and write to the database. Injectable, so
 * the rules are tested without one (Issues.layouts.test).
 */
export interface IssueLookups {
  /** The issue's governorate ranges (only `to` is read). */
  ranges: (issueId: number | string, req: PayloadRequest) => Promise<{ to: number }[]>
  /** How many numbers businesses hold under each page layout in this issue. */
  heldByLayout: (issueId: number | string, req: PayloadRequest) => Promise<Record<string, number>>
  /** How many businesses hold a number in this issue, whatever their layout. */
  heldCount: (issueId: number | string, req: PayloadRequest) => Promise<number>
  /** A template's pages, or null when there is no such template. */
  templatePages: (
    templateId: number | string,
    req: PayloadRequest,
  ) => Promise<TemplatePage[] | null>
  /** Marks a template as used by an issue; false when there is no such template. */
  lockTemplate: (templateId: number | string, req: PayloadRequest) => Promise<boolean>
}

const defaultLookups: IssueLookups = {
  ranges: async (issueId, req) => {
    const found = await req.payload.find({
      collection: 'listing-ranges',
      where: { issue: { equals: issueId } },
      limit: 0,
      pagination: false,
      depth: 0,
      overrideAccess: true,
      req,
    })
    return found.docs as unknown as { to: number }[]
  },
  heldByLayout: async (issueId, req) => {
    // Trashed listings are not found, and they have given their number back.
    const found = await req.payload.find({
      collection: 'businesses',
      where: {
        and: [
          { issue: { equals: issueId } },
          { pageLayout: { in: [...PAGE_LAYOUTS] } },
          { listingNumber: { exists: true } },
        ],
      },
      select: { pageLayout: true },
      limit: 0,
      pagination: false,
      depth: 0,
      overrideAccess: true,
      req,
    })
    const held: Record<string, number> = {}
    for (const doc of found.docs as unknown as { pageLayout?: unknown }[]) {
      if (isPageLayout(doc.pageLayout)) held[doc.pageLayout] = (held[doc.pageLayout] ?? 0) + 1
    }
    return held
  },
  heldCount: async (issueId, req) => {
    const { totalDocs } = await req.payload.count({
      collection: 'businesses',
      where: { and: [{ issue: { equals: issueId } }, { listingNumber: { exists: true } }] },
      overrideAccess: true,
      req,
    })
    return totalDocs
  },
  templatePages: async (templateId, req) => {
    const template = await req.payload.findByID({
      collection: 'templates',
      id: templateId,
      depth: 0,
      overrideAccess: true,
      disableErrors: true,
      req,
    })
    if (!template) return null
    // The layouts only: a page's note changes no slot.
    return ((template.pages ?? []) as { layout: TemplatePageKind }[]).map((p) => ({
      layout: p.layout,
    }))
  },
  lockTemplate: async (templateId, req) => {
    try {
      await req.payload.update({
        collection: 'templates',
        id: templateId,
        data: { locked: true },
        depth: 0,
        overrideAccess: true,
        req,
      })
      return true
    } catch (error) {
      if ((error as { status?: number }).status === 404) return false
      throw error
    }
  },
}

/**
 * The issue's own checks, before Payload validates the fields.
 *
 * - The listing total cannot drop under a governorate's range (as before).
 * - The price table: each layout once, prices of at least 1. Checked on create too.
 * - A layout cannot be switched off or removed while a business holds a slot
 *   under it: that business would lose what it bought.
 */
export function makeCheckIssue(lookups: IssueLookups): CollectionBeforeValidateHook {
  return async ({ data, originalDoc, req }) => {
    const issueId = originalDoc?.id as number | string | undefined
    const total = data?.listingTotal
    const layoutsSent = Array.isArray(data?.layouts)
    if (typeof total !== 'number' && !layoutsSent) return data

    if (typeof total === 'number' && issueId !== undefined && req?.payload) {
      const problem = checkListingTotal(total, await lookups.ranges(issueId, req))
      // Public 400, so the admin shows the reason rather than a hidden 500.
      if (problem) throw new APIError(problem, 400, null, true)
    }
    if (!layoutsSent) return data

    const after = toPriceRows(data?.layouts)
    const rowsProblem = priceRowsProblem(after)
    if (rowsProblem) throw new APIError(rowsProblem, 400, null, true)

    if (issueId !== undefined && req?.payload) {
      const before = toPriceRows(originalDoc?.layouts)
      // Nothing was on sale before, so nothing can be held under it.
      if (before.some((r) => r.offered)) {
        const dropped = priceRowsDropped(before, after, await lookups.heldByLayout(issueId, req))
        if (dropped) throw new APIError(dropped, 400, null, true)
      }
    }
    return data
  }
}

export const RANGES_FIRST_MESSAGE =
  "Delete this issue's listing number ranges first, then choose the template, then enter the page blocks."

/**
 * The slots an issue sells are a snapshot of its template, taken when the
 * template is assigned: the template is locked from then on, and a sold slot
 * must never move. So:
 *
 * - assigning or changing the template locks it, copies its slots and sets
 *   the listing total (one number per slot) and the page count;
 * - it is refused while the issue has any listing number range: those blocks
 *   belong to the old slots (or were typed), and are entered again as pages;
 * - once a business holds a number in the issue, the template cannot change
 *   or be removed;
 * - `slots` is written by this hook only. Field access drops it from API
 *   writes; a script with overrideAccess that sends it gets the stored value back;
 * - while the issue has slots, the total and page count follow them.
 *
 * Issues without a template (made before templates) are left as they were:
 * typed total, manual number ranges.
 */
export function makeSnapshotTemplate(lookups: IssueLookups): CollectionBeforeChangeHook {
  return async ({ data, originalDoc, req }) => {
    if (!data) return data
    const issueId = originalDoc?.id as number | string | undefined
    const templateSent = 'template' in data && data.template !== undefined
    const changed = templateSent && !sameId(data.template, originalDoc?.template ?? null)

    if (!changed) {
      if ('slots' in data) data.slots = originalDoc?.slots ?? null
      const stored = toSlots(originalDoc?.slots)
      if (stored.length > 0) {
        data.listingTotal = stored.length
        data.pageCount = issuePageCount(originalDoc?.pageCount, stored)
      }
      return data
    }

    // From no template to one counts too: a legacy issue's held numbers were
    // not bought as slots, and would land on whatever the template puts there.
    if (issueId !== undefined) {
      const held = await lookups.heldCount(issueId, req)
      if (held > 0) {
        throw new APIError(
          `The template cannot change: a business already holds a number in this issue (${held} in all). Its slots are fixed.`,
          400,
          null,
          true,
        )
      }
    }

    const templateId = idOf(data.template)
    if (templateId === null) {
      // Back to no template: the issue keeps its typed total, and sells no layout.
      data.slots = null
      return data
    }
    // Governorate blocks are worked out from the slots of the template they
    // were entered against (or typed, on a legacy issue). With a new template
    // they would no longer match its pages, so they go first.
    if (issueId !== undefined && (await lookups.ranges(issueId, req)).length > 0) {
      throw new APIError(RANGES_FIRST_MESSAGE, 400, null, true)
    }
    /*
     * Lock first, read second. Once every refusal above has passed, the
     * template is locked inside this request's transaction (`req`); its pages
     * are read only after that, so no edit of the template can slip in between
     * the read and the lock and leave the snapshot different from the locked
     * template. If anything later in this save fails, the transaction rolls the
     * lock back with it.
     */
    const found = await lookups.lockTemplate(templateId, req)
    const pages = found ? await lookups.templatePages(templateId, req) : null
    if (!pages) throw new APIError('That template was not found.', 400, null, true)
    const slots = buildSlots(pages)
    data.slots = slots
    data.listingTotal = slots.length
    // The template's pages, those without listings included (a back cover holds no slot).
    data.pageCount = templateTotals(pages).pages
    return data
  }
}

const checkIssue = makeCheckIssue(defaultLookups)
const snapshotTemplate = makeSnapshotTemplate(defaultLookups)

/** A print edition. The digital archive and the QR attribution both hang off this. */
export const Issues: CollectionConfig = {
  slug: 'issues',
  admin: {
    useAsTitle: 'title',
    defaultColumns: ['title', 'issueNumber', 'publishedAt'],
    group: 'Magazine',
  },
  access: { read: anyone, create: isStaff, update: isStaff, delete: isAdmin },
  hooks: {
    beforeValidate: [checkIssue],
    beforeChange: [snapshotTemplate],
    // Staff may use a partner's photo as a cover; it becomes public with it.
    afterChange: [markMediaAttached],
  },
  fields: [
    { name: 'title', type: 'text', required: true, localized: true },
    slugField('title'),
    { name: 'issueNumber', label: 'Issue no.', type: 'number', required: true, unique: true },
    { name: 'season', type: 'text', localized: true, admin: { placeholder: 'Summer 2026' } },
    { name: 'cover', type: 'upload', relationTo: 'media', required: true },
    {
      name: 'publishedAt',
      label: 'Published on',
      type: 'date',
      required: true,
      admin: { date: { displayFormat: 'd MMM yyyy' } },
    },
    {
      name: 'pageCount',
      label: 'Pages',
      type: 'number',
      defaultValue: 100,
      min: 1,
      admin: { description: 'Set from the template when the issue has one.' },
    },
    {
      name: 'printRun',
      label: 'Copies printed',
      type: 'number',
      min: 0,
      // Staff-only. Actual circulation is commercial intelligence: it is the
      // denominator in every scan-rate figure, and not a number an advertiser
      // or a competitor should be able to scrape while rates are being agreed.
      access: { read: isStaffFieldLevel },
      admin: { description: 'Copies printed. Used to compute scan rate per thousand copies.' },
    },
    {
      name: 'listingTotal',
      label: 'Listing numbers in this issue',
      type: 'number',
      // Not required: issues made before this field existed hold null, read as the default.
      defaultValue: DEFAULT_LISTING_TOTAL,
      min: 1,
      admin: {
        step: 1,
        description:
          'How many numbers the printed issue has. Set from the template (one per slot) when the issue has one. Each governorate takes a block of them under Listing number ranges.',
      },
    },
    {
      /**
       * The pages this issue is built from. Its slots are copied into `slots`
       * when it is assigned (hooks above), and the template is locked. Empty
       * for issues made before templates: they keep a typed total and manual
       * number ranges, and sell no layout.
       */
      name: 'template',
      label: 'Template',
      type: 'relationship',
      relationTo: 'templates',
      access: { read: isStaffFieldLevel },
      admin: {
        description:
          'Sets the slots, the listing total and the pages. Cannot change once a business holds a number in this issue.',
      },
    },
    {
      /**
       * The template's slots, copied when it was assigned: number, page,
       * position, layout. Written only by the hook; staff-only to read (the
       * public numbers route reads it with overrideAccess).
       */
      name: 'slots',
      label: 'Slots',
      type: 'json',
      access: { read: isStaffFieldLevel, create: () => false, update: () => false },
      admin: {
        readOnly: true,
        // Hidden in the editor: Payload's JSON editor (Monaco) does not load in
        // this admin, so staff read the slots in the plain list below instead.
        hidden: true,
      },
    },
    {
      // The slots above as plain text, worked out on read; nothing stored.
      name: 'slotList',
      label: 'Slots',
      type: 'textarea',
      virtual: true,
      access: { read: isStaffFieldLevel, create: () => false, update: () => false },
      admin: {
        readOnly: true,
        description: 'Copied from the template when it is assigned. Never edited by hand.',
        condition: (data) => toSlots(data?.slots).length > 0,
      },
      hooks: { afterRead: [({ data }) => issueSlotList(data?.slots)] },
    },
    {
      /**
       * The price of each layout in this issue. The form offers a layout only
       * when it is switched on, priced, and the issue has a slot of it.
       *
       * Staff-only to read: prices are not served through the REST API. The
       * public numbers route reads them with overrideAccess and returns only
       * what the form needs.
       */
      name: 'layouts',
      label: 'Layout prices',
      type: 'array',
      access: { read: isStaffFieldLevel },
      labels: { singular: 'Layout', plural: 'Layouts' },
      admin: {
        description:
          'Each layout once, with a price of at least 1. A layout with slots held under it cannot be switched off or removed.',
      },
      fields: [
        {
          type: 'row',
          fields: [
            {
              name: 'layout',
              type: 'select',
              required: true,
              options: PAGE_LAYOUTS.map((value) => ({ label: PAGE_LAYOUT_LABELS[value], value })),
              admin: { width: '40%' },
            },
            {
              name: 'offered',
              label: 'On sale',
              type: 'checkbox',
              defaultValue: false,
              admin: { width: '20%' },
            },
            {
              name: 'price',
              type: 'number',
              // No free places. Cents allowed.
              min: 1,
              admin: { step: 0.01, width: '40%' },
            },
          ],
        },
      ],
    },
    {
      // Shows how much of the total the governorates' blocks cover; nothing
      // stored. See components/admin/ListingAllocation.
      name: 'listingAllocation',
      type: 'ui',
      admin: {
        components: { Field: '/components/admin/ListingAllocation#ListingAllocation' },
      },
    },
    {
      name: 'digitalEdition',
      label: 'Digital edition (PDF)',
      type: 'upload',
      // Its own library, where PDFs may be up to 200 MB (collections/Editions).
      relationTo: 'editions',
      admin: {
        description:
          'The full issue as a PDF, read on the issue page like a book. Upload it here or pick one from Magazine PDFs (up to 200 MB).',
      },
    },
  ],
}
