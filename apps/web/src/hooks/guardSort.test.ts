import { describe, expect, it } from 'vitest'
import { isStaffFieldLevel } from '../access/index'
import { Businesses } from '../collections/Businesses'
import { PROTECTED_SORT_FIELDS, protectedSortField, sortFields } from './guardSort'

/**
 * The parsing behind the sort guard.
 *
 * The guard itself is one comparison; everything that could go wrong is in
 * reading the `sort` argument, which Payload accepts in four shapes - a field, a
 * field with a leading `-` for descending, a comma-joined list, and an array of
 * any of those. Miss one and the block silently stops applying, which looks
 * exactly like it working.
 *
 * The leak this closes was real and measured: with two listings carrying
 * different contract end dates, `?sort=contractEndsAt` and
 * `?sort=-contractEndsAt` returned them in opposite orders to an anonymous
 * caller. The values were correctly hidden. The ranking was not.
 */

describe('sortFields', () => {
  it.each([
    ['name', ['name']],
    ['-createdAt', ['createdAt']],
    ['-tier,name', ['tier', 'name']],
    [' -tier , name ', ['tier', 'name']],
  ])('reads %j', (input, expected) => {
    expect(sortFields(input)).toEqual(expected)
  })

  it('reads an array, which is how our own queries pass it', () => {
    expect(sortFields(['-tier', 'name'])).toEqual(['tier', 'name'])
  })

  it('reads an array of comma-joined strings', () => {
    expect(sortFields(['-tier,name', 'createdAt'])).toEqual(['tier', 'name', 'createdAt'])
  })

  it.each([[undefined], [null], [''], [{}], [42]])('returns nothing for %j', (input) => {
    expect(sortFields(input)).toEqual([])
  })
})

describe('protectedSortField', () => {
  it.each([...PROTECTED_SORT_FIELDS])('catches %s', (field) => {
    expect(protectedSortField(field)).toBe(field)
  })

  it('catches the descending form, which is the half a prefix check would miss', () => {
    expect(protectedSortField('-contractEndsAt')).toBe('contractEndsAt')
  })

  /**
   * The shape somebody would actually reach for once a bare sort is refused:
   * hide the protected field behind a legitimate one in a compound sort. The
   * database still orders by it, so it still leaks.
   */
  it('catches a protected field hidden in a compound sort', () => {
    expect(protectedSortField('name,-contractEndsAt')).toBe('contractEndsAt')
    expect(protectedSortField(['-tier', 'internalNotes'])).toBe('internalNotes')
  })

  it.each([['name'], ['-createdAt'], ['-tier,name'], ['priceRange'], ['tier']])(
    'allows %s',
    (sort) => {
      expect(protectedSortField(sort)).toBeNull()
    },
  )

  it('allows a field that merely starts the same way', () => {
    expect(protectedSortField('contract')).toBeNull()
    expect(protectedSortField('internalNotesPublicSummary')).toBeNull()
  })

  it('allows an absent sort', () => {
    expect(protectedSortField(undefined)).toBeNull()
  })
})

/**
 * The list is kept by hand, so a staff-only field added to listings later would
 * be sortable by anyone until somebody remembered it. This walks the collection
 * and fails on any field hidden by `read: isStaffFieldLevel` (on the field or on
 * a group above it) that the guard does not know, in the dotted path form a
 * caller would write in `?sort=`.
 */
describe('every staff-only listing field', () => {
  type Loose = {
    name?: string
    type?: string
    fields?: Loose[]
    tabs?: { name?: string; fields: Loose[] }[]
    access?: { read?: unknown }
  }

  const staffOnlyPaths = (fields: Loose[], prefix = '', hidden = false): string[] =>
    fields.flatMap((f) => {
      const here = hidden || f.access?.read === isStaffFieldLevel
      if (f.tabs) {
        return f.tabs.flatMap((tab) =>
          staffOnlyPaths(tab.fields, tab.name ? `${prefix}${tab.name}.` : prefix, here),
        )
      }
      if (f.fields) return staffOnlyPaths(f.fields, f.name ? `${prefix}${f.name}.` : prefix, here)
      return f.name && here ? [`${prefix}${f.name}`] : []
    })

  /**
   * Staff-only fields deliberately left sortable, each with the reason. Empty
   * today: every one of them is as sensitive in order as in value.
   */
  const SORTABLE_ON_PURPOSE: Record<string, string> = {}

  it('is protected from sorting', () => {
    const paths = staffOnlyPaths(Businesses.fields as unknown as Loose[])
    expect(paths).toContain('submission.ownerEmail')
    const missing = paths.filter(
      (path) =>
        !(PROTECTED_SORT_FIELDS as readonly string[]).includes(path) &&
        !(path in SORTABLE_ON_PURPOSE),
    )
    expect(missing).toEqual([])
  })

  it('is refused for the owner details, ascending and descending', () => {
    expect(protectedSortField('submission.ownerEmail')).toBe('submission.ownerEmail')
    expect(protectedSortField('-submission.ownerPhone')).toBe('submission.ownerPhone')
    expect(protectedSortField('name,-submission.submittedAt')).toBe('submission.submittedAt')
  })
})
