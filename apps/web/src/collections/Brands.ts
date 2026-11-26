import { ValidationError } from 'payload'
import type { Access, CollectionBeforeOperationHook, CollectionConfig, Field } from 'payload'
import { isStaff, isStaffUser } from '../access/index'
import { slugField, slugify } from '../fields/slug'
import { markMediaAttached } from '../hooks/markMediaAttached'

/**
 * A restaurant brand: the name that groups a restaurant's branches (Task 9,
 * 21 November 2026). Each branch is an ordinary listing pointing here through
 * `businesses.brand`, with its own place, hours and reservations.
 *
 * # Who reads
 *
 * Staff read every brand. Everyone else reads a brand only while at least one
 * of its listings is published and not in the trash. That condition is kept
 * as the `published` mirror below, maintained by hooks/syncBrandPublished on
 * every listing save and delete, so the rule is a plain indexed query
 * constraint Payload filters in the database (like publishedOrStaff), rather
 * than a nested query across the reverse relation on every read.
 *
 * # Who writes
 *
 * Staff only. A partner never creates or edits a brand directly: the branch
 * endpoint (lib/branches) creates one with overrideAccess when a partner adds
 * the first branch of a restaurant, named after that restaurant. Nothing here
 * is staff-only to read, so a public brand shows all of its fields.
 */

export const brandsRead: Access = ({ req }) => {
  if (isStaffUser(req.user)) return true
  return { published: { equals: true } }
}

const base = slugField('name') as Field & { admin?: Record<string, unknown> }

const SLUG_FIXED = 'A brand web address cannot change once set.'

/**
 * Permanent once set: the brand page's address. Generated from the name like a
 * listing slug; a clash is resolved by lib/branches before saving.
 *
 * Two checks, because each sees something the other cannot:
 *  - `guardBrandSlug` (beforeOperation) sees the body as sent, before the
 *    field hook turns an empty or missing slug back into the stored one, so
 *    it is the one that refuses clearing it ('' or null) and a slug in an
 *    update by `where`.
 *  - this `validate` compares the value that reached validation with
 *    `previousValue` (what Payload 3.90 passes a field validator for the
 *    stored value; it passes no `originalDoc`), so nothing else can change it
 *    either. It also keeps the `required` check that a custom validator
 *    replaces.
 */
const brandSlug: Field = {
  ...base,
  admin: {
    ...(base.admin ?? {}),
    description: 'The brand page address, /brands/<slug>. Set once and never changed.',
  },
  validate: (value: unknown, options: { previousValue?: unknown } = {}) => {
    if (typeof value !== 'string' || value.trim() === '') return 'This field is required.'
    const stored = options.previousValue
    if (typeof stored === 'string' && stored.length > 0 && value !== stored) return SLUG_FIXED
    return true
  },
} as Field

/** See brandSlug. */
export const guardBrandSlug: CollectionBeforeOperationHook = async ({ args, operation, req }) => {
  if (operation !== 'update') return args
  const { id, data } = args as { id?: number | string; data?: Record<string, unknown> }
  if (!data || !Object.prototype.hasOwnProperty.call(data, 'slug')) return args
  const refuse = () => {
    throw new ValidationError({
      collection: 'brands',
      errors: [{ path: 'slug', message: SLUG_FIXED }],
    })
  }
  if (id === undefined || id === null || id === '') refuse()
  const found = await req.payload.find({
    collection: 'brands',
    where: { id: { equals: id } },
    select: { slug: true },
    limit: 1,
    depth: 0,
    overrideAccess: true,
    req,
  })
  const stored = (found.docs[0] as { slug?: unknown } | undefined)?.slug
  if (typeof stored !== 'string' || stored.length === 0) return args
  const sent = data.slug
  if (typeof sent !== 'string' || slugify(sent) !== stored) refuse()
  return args
}

export const Brands: CollectionConfig = {
  slug: 'brands',
  labels: { singular: 'Brand', plural: 'Brands' },
  admin: {
    useAsTitle: 'name',
    defaultColumns: ['name', 'slug', 'published'],
    group: 'Directory',
    description:
      'Restaurant brands. Each branch is a listing with its Brand set. A brand is public while one of its branches is published.',
  },
  access: {
    read: brandsRead,
    create: isStaff,
    update: isStaff,
    delete: isStaff,
  },
  // A listing that populates its brand gets these and nothing else.
  defaultPopulate: { name: true, slug: true, logo: true },
  hooks: {
    beforeOperation: [guardBrandSlug],
    // A partner's photo chosen as the logo becomes public with the brand.
    afterChange: [markMediaAttached],
  },
  fields: [
    { name: 'name', type: 'text', required: true, localized: true, maxLength: 160 },
    brandSlug,
    { name: 'logo', type: 'upload', relationTo: 'media' },
    { name: 'description', type: 'textarea', localized: true, maxLength: 2000 },
    {
      /**
       * True while at least one listing of this brand is published and not in
       * the trash. Written only by hooks/syncBrandPublished (overrideAccess);
       * nobody sets it through the API, staff included.
       */
      name: 'published',
      type: 'checkbox',
      defaultValue: false,
      index: true,
      access: { create: () => false, update: () => false },
      admin: {
        position: 'sidebar',
        readOnly: true,
        description: 'Set automatically: on while one of its branches is published.',
      },
    },
  ],
}
