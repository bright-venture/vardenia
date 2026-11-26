import { describe, expect, it } from 'vitest'
import { PARTNER_EDITABLE_FIELDS } from '@vardenia/core'
import { Businesses } from '../collections/Businesses'
import { checkAllowedBody } from './field-shape'
import {
  adoptRowIds,
  buildListingPatch,
  descriptionParagraphs,
  descriptionText,
  emptyDraft,
  humanisePath,
  readSaveErrors,
  splitFieldErrors,
  textToDescription,
  toggleFacility,
  type ListingDraft,
  type ListingKinds,
} from './partner-listing-edit'

const ALL: ListingKinds = { hotel: true, getaway: true, seating: true }
const NONE: ListingKinds = { hotel: false, getaway: false, seating: false }

const base = (): ListingDraft => ({
  ...emptyDraft(),
  tagline: 'By the sea',
  description: 'First line\nSecond line',
  address: 'Main street',
  mapUrl: 'https://www.google.com/maps/@33.89,35.50,17z',
  contact: { ...emptyDraft().contact, phone: '+961 1 234 567' },
  facilities: ['free-wifi', 'bar'],
  popularFacilities: ['bar'],
  propertyHighlights: ['pool'],
  stay: {
    nightlyPrice: '120',
    includedGuests: '4',
    maxGuests: '6',
    extraGuestFee: '15.5',
    childrenCountAsGuests: true,
    minNights: '2',
    packages: [
      {
        key: 'a',
        id: 'pkg-1',
        label: 'Weekend',
        description: '',
        price: '300',
        unit: 'per-stay',
        active: true,
      },
    ],
  },
  features: { ...emptyDraft().features, pool: true },
  seatingAreas: [
    { key: 'b', id: 'area-1', setting: 'indoor', smoking: false, tables: '10', label: '' },
  ],
})

/** Every key of a body, at any depth, joined by dots (array indexes included). */
function paths(value: unknown, prefix = ''): string[] {
  if (Array.isArray(value)) return value.flatMap((v, i) => paths(v, `${prefix}${i}.`))
  if (value && typeof value === 'object') {
    return Object.entries(value).flatMap(([k, v]) => [
      `${prefix}${k}`,
      ...paths(v, `${prefix}${k}.`),
    ])
  }
  return []
}

describe('buildListingPatch', () => {
  it('sends nothing when nothing changed', () => {
    expect(
      buildListingPatch(base(), base(), ALL, { descriptionEditable: true, dir: 'ltr' }),
    ).toEqual({
      body: {},
      problems: {},
    })
  })

  it('sends only the top-level fields that changed', () => {
    const draft = base()
    draft.tagline = 'On the sea'
    draft.contact.instagram = 'vardenia'
    const { body } = buildListingPatch(base(), draft, ALL, {
      descriptionEditable: true,
      dir: 'ltr',
    })
    // A getaway with packages also carries its stay group (C1, see below).
    expect(Object.keys(body).sort()).toEqual(['contact', 'stay', 'tagline'])
    expect(body.tagline).toBe('On the sea')
    expect(body.contact).toMatchObject({
      phone: '+961 1 234 567',
      instagram: 'vardenia',
      email: null,
    })
  })

  it('never sends a key outside PARTNER_EDITABLE_FIELDS, and the guard accepts every body', () => {
    const initial = emptyDraft()
    const draft = base()
    draft.stay.packages.push({
      key: 'new',
      id: null,
      label: 'Breakfast',
      description: 'With eggs',
      price: '20',
      unit: 'per-person-per-night',
      active: false,
    })
    draft.seatingAreas.push({
      key: 'c',
      id: null,
      setting: 'outdoor',
      smoking: true,
      tables: '4',
      label: 'Terrace',
    })
    const { body, problems } = buildListingPatch(initial, draft, ALL, {
      descriptionEditable: true,
      dir: 'rtl',
    })
    expect(problems).toEqual({})
    for (const key of Object.keys(body)) {
      expect(PARTNER_EDITABLE_FIELDS as readonly string[]).toContain(key)
    }
    // The real guard, on the real collection: unknown keys at any depth are refused.
    expect(() => checkAllowedBody(body, Businesses.fields, PARTNER_EDITABLE_FIELDS)).not.toThrow()
    // The React row keys never travel.
    expect(paths(body).some((p) => p.endsWith('.key'))).toBe(false)
    expect(Object.keys(body)).not.toContain('location')
  })

  it('leaves out fields the listing kind may not have', () => {
    const { body } = buildListingPatch(emptyDraft(), base(), NONE, {
      descriptionEditable: true,
      dir: 'ltr',
    })
    expect(Object.keys(body).sort()).toEqual([
      'address',
      'contact',
      'description',
      'mapUrl',
      'tagline',
    ])
  })

  it('never sends a description it may not edit', () => {
    const draft = base()
    draft.description = 'changed'
    const { body } = buildListingPatch(base(), draft, NONE, {
      descriptionEditable: false,
      dir: 'ltr',
    })
    expect(body).toEqual({})
  })

  it('turns blanks into null and numbers into numbers, and keeps row ids', () => {
    const draft = base()
    draft.stay.maxGuests = ''
    draft.stay.extraGuestFee = '0'
    draft.address = '   '
    const { body } = buildListingPatch(base(), draft, ALL, {
      descriptionEditable: true,
      dir: 'ltr',
    })
    expect(body.address).toBeNull()
    expect(body.stay).toEqual({
      nightlyPrice: 120,
      includedGuests: 4,
      maxGuests: null,
      extraGuestFee: 0,
      childrenCountAsGuests: true,
      minNights: 2,
      packages: [
        {
          id: 'pkg-1',
          label: 'Weekend',
          description: null,
          price: 300,
          unit: 'per-stay',
          active: true,
        },
      ],
    })
  })

  it('reports a number it cannot read instead of sending it', () => {
    const draft = base()
    draft.stay.nightlyPrice = 'abc'
    draft.seatingAreas[0]!.tables = '1e'
    const { body, problems } = buildListingPatch(base(), draft, ALL, {
      descriptionEditable: true,
      dir: 'ltr',
    })
    expect(problems).toEqual({ 'stay.nightlyPrice': 'number', 'seatingAreas.0.tables': 'number' })
    expect(body).toEqual({})
  })

  it('sends a changed description as a plain Lexical document in the page direction', () => {
    const draft = base()
    draft.description = 'Hello\n\nWorld'
    const { body } = buildListingPatch(base(), draft, NONE, {
      descriptionEditable: true,
      dir: 'rtl',
    })
    const doc = body.description as { root: { direction: string; children: unknown[] } }
    expect(doc.root.direction).toBe('rtl')
    expect(descriptionParagraphs(doc)).toEqual(['Hello', 'World'])
  })

  it('clears the description with null', () => {
    const draft = base()
    draft.description = '  '
    const { body } = buildListingPatch(base(), draft, NONE, {
      descriptionEditable: true,
      dir: 'ltr',
    })
    expect(body.description).toBeNull()
  })

  it('compares facilities as a set, so reordering is not a change', () => {
    const draft = base()
    draft.facilities = ['bar', 'free-wifi']
    expect(
      buildListingPatch(base(), draft, ALL, { descriptionEditable: true, dir: 'ltr' }).body,
    ).toEqual({})
  })
})

describe('toggleFacility', () => {
  it('drops a facility from the popular list when it is unticked', () => {
    expect(
      toggleFacility({ facilities: ['bar', 'spa-wellness'], popularFacilities: ['bar'] }, 'bar'),
    ).toEqual({ facilities: ['spa-wellness'], popularFacilities: [] })
  })
  it('adds a facility', () => {
    expect(toggleFacility({ facilities: [], popularFacilities: [] }, 'bar')).toEqual({
      facilities: ['bar'],
      popularFacilities: [],
    })
  })
})

describe('descriptions', () => {
  it('reads plain paragraphs back as lines', () => {
    expect(descriptionText(textToDescription('One\nTwo', 'ltr'))).toBe('One\nTwo')
    expect(descriptionText(null)).toBe('')
  })

  it('refuses to flatten a description with formatting, headings, lists or links', () => {
    const bold = textToDescription('Bold', 'ltr') as unknown as {
      root: { children: { children: { format: number }[] }[] }
    }
    bold.root.children[0]!.children[0]!.format = 1
    expect(descriptionParagraphs(bold)).toBeNull()
    expect(
      descriptionParagraphs({
        root: { type: 'root', children: [{ type: 'heading', children: [] }] },
      }),
    ).toBeNull()
    expect(
      descriptionParagraphs({
        root: {
          type: 'root',
          children: [{ type: 'paragraph', children: [{ type: 'link', children: [] }] }],
        },
      }),
    ).toBeNull()
  })

  it('treats an empty or missing description as editable and empty', () => {
    expect(descriptionParagraphs(undefined)).toEqual([])
    expect(descriptionParagraphs({ root: { type: 'root', children: [] } })).toEqual([])
  })
})

describe('readSaveErrors', () => {
  it('puts Payload field errors beside their fields', () => {
    expect(
      readSaveErrors({
        errors: [
          {
            name: 'ValidationError',
            message: 'The following fields are invalid: contact.phone, stay.maxGuests',
            data: {
              errors: [
                { path: 'contact.phone', message: 'Use 6 to 20 characters.' },
                { path: 'stay.maxGuests', message: 'Too low.' },
              ],
            },
          },
        ],
      }),
    ).toEqual({
      fields: { 'contact.phone': 'Use 6 to 20 characters.', 'stay.maxGuests': 'Too low.' },
      message: 'The following fields are invalid: contact.phone, stay.maxGuests',
    })
  })

  it('keeps a guard refusal as the general message', () => {
    expect(
      readSaveErrors({ errors: [{ message: '"tier" cannot be changed from a partner account.' }] }),
    ).toEqual({ fields: {}, message: '"tier" cannot be changed from a partner account.' })
  })

  it('copes with a body that is not JSON', () => {
    expect(readSaveErrors(null)).toEqual({ fields: {}, message: null })
    expect(readSaveErrors('nope')).toEqual({ fields: {}, message: null })
  })
})

describe('adoptRowIds', () => {
  it('takes the ids Payload gave new rows, by position', () => {
    const draft = base()
    draft.seatingAreas.push({
      key: 'n',
      id: null,
      setting: 'outdoor',
      smoking: false,
      tables: '2',
      label: '',
    })
    const next = adoptRowIds(draft, {
      stay: { packages: [{ id: 'pkg-1' }] },
      seatingAreas: [{ id: 'area-1' }, { id: 'area-2' }],
    })
    expect(next.seatingAreas.map((row) => row.id)).toEqual(['area-1', 'area-2'])
    expect(next.stay.packages[0]!.id).toBe('pkg-1')
    expect(adoptRowIds(draft, null).seatingAreas[1]!.id).toBeNull()
  })
})

describe('descriptions with layout', () => {
  it('locks a description with alignment, indentation or inline style', () => {
    const para = (extra: object, text: object = {}) => ({
      root: {
        type: 'root',
        children: [
          { type: 'paragraph', ...extra, children: [{ type: 'text', text: 'x', ...text }] },
        ],
      },
    })
    expect(descriptionParagraphs(para({ format: 'center' }))).toBeNull()
    expect(descriptionParagraphs(para({ indent: 1 }))).toBeNull()
    expect(descriptionParagraphs(para({}, { style: 'color: red' }))).toBeNull()
    expect(descriptionParagraphs(para({ format: '', indent: 0 }, { style: '' }))).toEqual(['x'])
  })
})

describe('review fixes: required localized values (C1)', () => {
  const opts = { descriptionEditable: true, dir: 'rtl' as const }

  it('scenario 1: off the default language, the name is always sent with a change', () => {
    const draft = base()
    draft.tagline = 'changed'
    const { body } = buildListingPatch(base(), draft, NONE, { ...opts, requiredName: 'Cafe Nour' })
    expect(body).toEqual({ tagline: 'changed', name: 'Cafe Nour' })
    // Nothing changed: nothing sent, not even the name.
    expect(
      buildListingPatch(base(), base(), NONE, { ...opts, requiredName: 'Cafe Nour' }).body,
    ).toEqual({})
    // In the default language no name is added.
    expect(Object.keys(buildListingPatch(base(), draft, NONE, opts).body)).toEqual(['tagline'])
  })

  it('scenario 2 and 3: a getaway with packages always sends its stay group with a change', () => {
    const draft = base()
    draft.contact.phone = '03 999 999'
    const getawayOnly: ListingKinds = { hotel: false, getaway: true, seating: false }
    const { body } = buildListingPatch(base(), draft, getawayOnly, opts)
    expect(Object.keys(body).sort()).toEqual(['contact', 'stay'])
    expect((body.stay as { packages: { label: string }[] }).packages[0]!.label).toBe('Weekend')
    // Without packages the stay group is only sent when it changed.
    const bare = base()
    bare.stay.packages = []
    const changed = { ...bare, contact: { ...bare.contact, phone: '03 999 999' } }
    expect(Object.keys(buildListingPatch(bare, changed, getawayOnly, opts).body)).toEqual([
      'contact',
    ])
  })

  it('every body with the forced fields still holds only allow-listed keys the guard accepts', () => {
    const draft = base()
    draft.amenities = ['pool']
    draft.payments = { ...draft.payments, cash: true }
    const { body } = buildListingPatch(emptyDraft(), draft, ALL, { ...opts, requiredName: 'X' })
    for (const key of Object.keys(body)) {
      expect(PARTNER_EDITABLE_FIELDS as readonly string[]).toContain(key)
    }
    expect(() => checkAllowedBody(body, Businesses.fields, PARTNER_EDITABLE_FIELDS)).not.toThrow()
  })
})

describe('review fixes: amenities and payments (I1)', () => {
  const opts = { descriptionEditable: true, dir: 'ltr' as const }
  it('sends amenities as a set and payments as the whole group, for every kind', () => {
    const draft = base()
    draft.amenities = ['wifi', 'pool']
    draft.payments = { cash: true, card: false, whish: true, omt: false }
    const { body } = buildListingPatch(base(), draft, NONE, opts)
    expect(body).toEqual({
      amenities: ['wifi', 'pool'],
      payments: { cash: true, card: false, whish: true, omt: false },
    })
    const reordered = { ...draft, amenities: ['pool', 'wifi'] }
    expect(buildListingPatch(draft, reordered, NONE, opts).body).toEqual({})
  })
})

describe('review fixes: errors with no field on the form (C1c)', () => {
  it('splits errors into those beside a field and those the notice must carry', () => {
    const { placed, unplaced } = splitFieldErrors(
      {
        name: 'This field is required.',
        'contact.phone': 'Bad phone.',
        'stay.packages.0.label': 'This field is required.',
        heroImage: 'This field is required.',
        'seatingAreas.1.tables': 'Too few.',
      },
      { hotel: false, getaway: true, seating: false },
      true,
    )
    expect(placed).toEqual({
      'contact.phone': 'Bad phone.',
      'stay.packages.0.label': 'This field is required.',
    })
    expect(unplaced).toEqual([
      { path: 'name', label: 'Name', message: 'This field is required.' },
      { path: 'heroImage', label: 'Hero image', message: 'This field is required.' },
      { path: 'seatingAreas.1.tables', label: 'Seating areas 2 > tables', message: 'Too few.' },
    ])
  })

  it('does not place a description error when the description is locked', () => {
    expect(splitFieldErrors({ description: 'x' }, NONE, false).unplaced).toHaveLength(1)
    expect(splitFieldErrors({ description: 'x' }, NONE, true).placed).toEqual({ description: 'x' })
  })

  it('humanises paths', () => {
    expect(humanisePath('stay.packages.0.label')).toBe('Stay > packages 1 > label')
    expect(humanisePath('subcategories')).toBe('Subcategories')
  })
})

describe('review fixes: numbers typed by hand (M1)', () => {
  it('reports a typo in an optional number instead of clearing it', () => {
    const draft = base()
    draft.stay.maxGuests = '6o'
    const { body, problems } = buildListingPatch(base(), draft, ALL, {
      descriptionEditable: true,
      dir: 'ltr',
    })
    expect(problems).toEqual({ 'stay.maxGuests': 'number' })
    expect(body).toEqual({})
  })
})
