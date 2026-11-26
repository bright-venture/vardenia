import { APIError } from 'payload'
import type { CollectionBeforeChangeHook, PayloadRequest } from 'payload'
import { PAGE_LAYOUT_LABELS, isPageLayout } from '@vardenia/core'
import { toSlots } from '../collections/Issues'

const idOf = (value: unknown): number | string | null => {
  if (typeof value === 'number' || typeof value === 'string') return value
  const id = (value as { id?: unknown } | null)?.id
  return typeof id === 'number' || typeof id === 'string' ? id : null
}

const layoutOf = (value: unknown): string | null =>
  typeof value === 'string' && value ? value : null

/** The stored slots of an issue (json), or null when it has none. */
export type LoadIssueSlots = (issueId: number | string, req: PayloadRequest) => Promise<unknown>

const loadIssueSlots: LoadIssueSlots = async (issueId, req) => {
  // overrideAccess: `slots` is staff-read, and the hook may run for a
  // request without a staff user (the form's own services).
  const issue = await req.payload.findByID({
    collection: 'issues',
    id: issueId,
    depth: 0,
    overrideAccess: true,
    disableErrors: true,
    req,
  })
  return (issue as { slots?: unknown } | null)?.slots ?? null
}

/**
 * The page layout a business bought is written once, when the form starts it,
 * and never changes (PRD v6). Field access already drops a change sent through
 * the admin or the API (`update: () => false`); this hook also refuses one made
 * with overrideAccess, by a script or a service, because the price snapshot,
 * the money and the printed page all hang off that layout (PRD v7 keeps this).
 *
 * Changing it from nothing to a layout counts as a change too: a layout is only
 * ever set on create.
 *
 * A listing number in an issue that has slots (the slots the issue copied from
 * its template) must be a slot of the business's own layout, on create and on
 * every update that gives a number or moves the business to another issue. So
 * staff moving a business cannot take a full-page buyer onto a quarter-page
 * slot, and a business with no layout cannot take a slot at all: its layout
 * could never be set afterwards, so the slot would be sold with no layout and
 * no price. The start route creates with a layout and a free slot of it, so it
 * passes. The governorate's block is checked by the existing listing number
 * rule of the businesses collection. A number being given back (rejected,
 * lapsed, trashed: hooks/releaseListingNumber, which runs first) is always
 * fine, and so is a business with no number (samples). Issues with no slots
 * (made before templates) keep their manual numbers and are not checked.
 */
export function makeGuardPageLayout(load: LoadIssueSlots): CollectionBeforeChangeHook {
  return async ({ data, originalDoc, operation, req }) => {
    if ((operation !== 'update' && operation !== 'create') || !data) return data
    const isUpdate = operation === 'update'

    const stored = isUpdate ? layoutOf(originalDoc?.pageLayout) : null
    if (
      isUpdate &&
      'pageLayout' in data &&
      data.pageLayout !== undefined &&
      layoutOf(data.pageLayout) !== stored
    ) {
      throw new APIError(
        'The page layout is set once, when the form is started, and cannot be changed.',
        400,
        null,
        true,
      )
    }
    const layout = isUpdate ? stored : layoutOf(data.pageLayout)

    const numberSent = 'listingNumber' in data && data.listingNumber !== undefined
    const issueSent = 'issue' in data && data.issue !== undefined
    const number = numberSent ? data.listingNumber : originalDoc?.listingNumber
    const issueId = idOf(issueSent ? data.issue : originalDoc?.issue)
    if (number === null || number === undefined || number === '' || issueId === null) return data

    if (isUpdate) {
      const numberChanged = numberSent && Number(number) !== Number(originalDoc?.listingNumber)
      const issueChanged = issueSent && String(issueId) !== String(idOf(originalDoc?.issue))
      if (!numberChanged && !issueChanged) return data
    }

    const slots = toSlots(await load(issueId, req))
    const n = Number(number)
    if (!layout || !isPageLayout(layout)) {
      if (slots.length === 0) return data
      throw new APIError(
        'This issue sells listings by page layout, and this business has no page layout, so it cannot hold a number in it. Listings with a layout come from the Magazine Places form; leave the number empty, or choose an issue without a template.',
        400,
        null,
        true,
      )
    }

    const name = PAGE_LAYOUT_LABELS[layout]
    if (!slots.some((s) => s.layout === layout)) {
      throw new APIError(
        `This issue has no ${name} slots, the layout this business bought. Choose an issue that has them.`,
        400,
        null,
        true,
      )
    }
    if (!slots.some((s) => s.number === n && s.layout === layout)) {
      throw new APIError(
        `Number ${n} is not a ${name} slot in this issue. This business bought ${name}; choose one of its ${name} numbers.`,
        400,
        null,
        true,
      )
    }
    return data
  }
}

export const guardPageLayout = makeGuardPageLayout(loadIssueSlots)
