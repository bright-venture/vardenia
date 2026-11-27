import { APIError } from 'payload'
import type {
  CollectionBeforeChangeHook,
  CollectionBeforeDeleteHook,
  CollectionBeforeValidateHook,
  CollectionConfig,
  PayloadRequest,
} from 'payload'
import {
  NO_LISTINGS,
  PAGE_LAYOUT_LABELS,
  TEMPLATE_PAGE_KINDS,
  TEMPLATE_PAGE_LABELS,
  buildSlots,
  isTemplatePageKind,
  slotLabel,
  templateProblem,
  templateTotals,
  type TemplatePage,
} from '@vardenia/core'
import { isAdmin, isStaff } from '../access/index'

export const LOCKED_TEMPLATE_MESSAGE =
  'This template is used by an issue and cannot be edited. Duplicate it to make a changed copy.'

/**
 * The stored pages, in the shape the core rules read. An unknown layout is
 * kept, so templateProblem can name it rather than it being dropped silently.
 */
export const toTemplatePages = (value: unknown): TemplatePage[] =>
  Array.isArray(value)
    ? value.map((raw) => {
        const row = (raw ?? {}) as { layout?: unknown; note?: unknown }
        return {
          layout: row.layout as TemplatePage['layout'],
          note: typeof row.note === 'string' ? row.note : null,
        }
      })
    : []

/**
 * The layouts in order, to tell a real change from the admin resending the
 * same pages. Notes are left out on purpose: they move no slot, so a locked
 * template's notes may still be corrected (like its name).
 */
const layoutSequence = (value: unknown): string =>
  toTemplatePages(value)
    .map((p) => String(p.layout))
    .join(',')

/**
 * "N pages, M listings." (with "(K without listings)" when there are some)
 * then one line per slot. Shown read-only on the template. Pages without
 * listings stay in, so the slots after them keep their real page numbers.
 */
export function templateSummary(value: unknown): string {
  const pages = toTemplatePages(value).filter((p) => isTemplatePageKind(p.layout))
  if (pages.length === 0) return ''
  const totals = templateTotals(pages)
  const blanks = pages.filter((p) => p.layout === NO_LISTINGS).length
  const pageText =
    blanks > 0 ? `${totals.pages} pages (${blanks} without listings)` : `${totals.pages} pages`
  const lines = buildSlots(pages).map(
    (slot) => `${slot.number}: ${slotLabel(slot)} (${PAGE_LAYOUT_LABELS[slot.layout]})`,
  )
  return [`${pageText}, ${totals.listings} listings.`, ...lines].join('\n')
}

/**
 * At least one page, every page a known layout (or no listings), and at least
 * one page with listings. Checked on create and whenever pages change.
 */
export const checkTemplate: CollectionBeforeValidateHook = async ({ data, originalDoc }) => {
  const pagesSent = data && 'pages' in data && data.pages !== undefined
  if (!pagesSent && originalDoc) return data
  const problem = templateProblem(toTemplatePages(pagesSent ? data?.pages : originalDoc?.pages))
  if (problem) throw new APIError(problem, 400, null, true)
  return data
}

/**
 * Once an issue links a template, its slots are copied into the issue and
 * businesses buy them by number: changing the pages afterwards would make the
 * template disagree with what was sold. Refused for everyone, overrideAccess
 * included (this is a hook, not only field access). Renaming is fine.
 *
 * A new template (Payload's duplicate included, which creates) always starts
 * unlocked; a locked one stays locked.
 */
export const guardLockedTemplate: CollectionBeforeChangeHook = async ({
  data,
  originalDoc,
  operation,
}) => {
  if (!data) return data
  if (operation === 'create') {
    data.locked = false
    return data
  }
  if (originalDoc?.locked !== true) return data
  data.locked = true
  if ('pages' in data && data.pages !== undefined) {
    if (layoutSequence(data.pages) !== layoutSequence(originalDoc.pages)) {
      throw new APIError(LOCKED_TEMPLATE_MESSAGE, 400, null, true)
    }
  }
  return data
}

/** Reads a template for the delete check. Injectable for tests. */
export type LoadTemplate = (
  id: number | string,
  req: PayloadRequest,
) => Promise<{ locked?: boolean | null } | null>

const loadTemplate: LoadTemplate = async (id, req) =>
  (await req.payload.findByID({
    collection: 'templates',
    id,
    depth: 0,
    overrideAccess: true,
    disableErrors: true,
    req,
  })) as { locked?: boolean | null } | null

/** An issue still points at a locked template; deleting it would leave the issue without one. */
export function makeRefuseLockedDelete(load: LoadTemplate): CollectionBeforeDeleteHook {
  return async ({ id, req }) => {
    const doc = await load(id, req)
    if (doc?.locked === true) throw new APIError(LOCKED_TEMPLATE_MESSAGE, 400, null, true)
  }
}

/**
 * A magazine template: the ordered pages of an issue, one layout each. The
 * totals and the slots are worked out from the pages, never typed. An issue
 * copies the slots when it links the template, and the template is locked from
 * then on (collections/Issues).
 */
export const Templates: CollectionConfig = {
  slug: 'templates',
  labels: { singular: 'Template', plural: 'Templates' },
  admin: {
    useAsTitle: 'name',
    defaultColumns: ['name', 'locked', 'updatedAt'],
    group: 'Magazine',
    description:
      'The pages of an issue, one layout each. Once an issue uses a template it is locked: duplicate it to make a changed copy.',
  },
  // Deleting cannot be undone, so admin only (like Issues); a locked one never.
  access: { read: isStaff, create: isStaff, update: isStaff, delete: isAdmin },
  hooks: {
    beforeValidate: [checkTemplate],
    beforeChange: [guardLockedTemplate],
    beforeDelete: [makeRefuseLockedDelete(loadTemplate)],
  },
  fields: [
    { name: 'name', type: 'text', required: true },
    {
      name: 'pages',
      label: 'Pages',
      type: 'array',
      required: true,
      minRows: 1,
      labels: { singular: 'Page', plural: 'Pages' },
      admin: {
        description:
          'In print order. A full spread is one entry that takes two pages. "No listings" is a page that sells nothing (cover, contents, a separator): it counts as a page but makes no slot. Cannot change once an issue uses the template (notes can).',
        components: {
          // Titles each row by its pages ("Page 1→2 · Full spread",
          // "Page 1 · No listings (Cover)") and adds
          // "from page 1 to 10, all half pages". Admin screen only: the stored
          // data and the checks are unchanged.
          RowLabel: '/components/admin/TemplatePageLabel#TemplatePageLabel',
          afterInput: ['/components/admin/TemplateBulkAdd#TemplateBulkAdd'],
        },
      },
      fields: [
        {
          name: 'layout',
          type: 'select',
          required: true,
          // The five layouts, then "No listings" last. Only the template has
          // it: an issue's price table and a business's layout keep the five.
          options: TEMPLATE_PAGE_KINDS.map((value) => ({
            label: TEMPLATE_PAGE_LABELS[value],
            value,
          })),
        },
        {
          // What the page is, for the admin's eyes only ("Cover", "Contents").
          name: 'note',
          type: 'text',
          maxLength: 80,
          admin: { placeholder: 'Cover, Contents, Keserwan separator...' },
        },
      ],
    },
    {
      // Set by the issue hook (overrideAccess) when an issue links the template.
      name: 'locked',
      label: 'Used by an issue',
      type: 'checkbox',
      defaultValue: false,
      access: { create: () => false, update: () => false },
      admin: { readOnly: true, position: 'sidebar' },
      // A duplicate is a new, editable template.
      hooks: { beforeDuplicate: [() => false] },
    },
    {
      // Worked out on read from the pages; nothing stored.
      name: 'summary',
      label: 'Totals and slots',
      type: 'textarea',
      virtual: true,
      access: { create: () => false, update: () => false },
      admin: {
        readOnly: true,
        description: 'Calculated from the pages when the template is saved.',
      },
      hooks: { afterRead: [({ data }) => templateSummary(data?.pages)] },
    },
  ],
}
