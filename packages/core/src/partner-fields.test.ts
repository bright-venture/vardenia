import { describe, expect, it } from 'vitest'
import { PARTNER_EDITABLE_FIELDS, STAFF_ONLY_LISTING_FIELDS } from './partner-fields'

/**
 * The allow-list a partner edits their listing through.
 *
 * Later tasks append to it, which is exactly when a staff-only name can slip in
 * by accident. The second test is the tripwire for that: it fails the moment a
 * field the team owns appears on the partner's side of the line.
 */
describe('PARTNER_EDITABLE_FIELDS', () => {
  it('holds the initial allow-list', () => {
    for (const name of [
      'name',
      'tagline',
      'description',
      'heroImage',
      'gallery',
      'logo',
      'menu',
      'amenities',
      'payments',
      'openingHours',
      'seasonality',
      'address',
      'mapUrl',
      'location',
      'contact',
      'tags',
      'facilities',
      'popularFacilities',
      'propertyHighlights',
      'stay',
      'features',
    ]) {
      expect(PARTNER_EDITABLE_FIELDS).toContain(name)
    }
  })

  it('never contains a staff-only field', () => {
    const overlap = PARTNER_EDITABLE_FIELDS.filter((name) =>
      (STAFF_ONLY_LISTING_FIELDS as readonly string[]).includes(name),
    )
    expect(overlap).toEqual([])
  })

  it('names every field the brief keeps with the team', () => {
    for (const name of [
      '_status',
      'tier',
      'verified',
      'slug',
      'qrCode',
      'contractStartsAt',
      'contractEndsAt',
      'commission',
      'salesOwner',
      'internalNotes',
      'booking',
      'issue',
      'listingNumber',
      'submission',
      'importBatch',
      'category',
      'subcategories',
      'governorate',
      'city',
      'brand',
      'id',
      'createdAt',
      'updatedAt',
      'deletedAt',
    ]) {
      expect(STAFF_ONLY_LISTING_FIELDS).toContain(name)
    }
  })

  it('has no duplicates and cannot be changed at run time', () => {
    expect(new Set(PARTNER_EDITABLE_FIELDS).size).toBe(PARTNER_EDITABLE_FIELDS.length)
    expect(Object.isFrozen(PARTNER_EDITABLE_FIELDS)).toBe(true)
    expect(Object.isFrozen(STAFF_ONLY_LISTING_FIELDS)).toBe(true)
  })
})
