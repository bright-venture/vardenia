import { describe, expect, it } from 'vitest'
import { AMENITIES } from '@vardenia/core/attributes'
import { placeSubmissionSchema } from '@vardenia/core/place-submission'
import { GOVERNORATES } from '@vardenia/core/regions'
import { CATEGORIES } from '@vardenia/core/taxonomy'
import {
  buildSubmission,
  checkSubmission,
  districtsFor,
  errorKind,
  formErrorKey,
  GOVERNORATE_ORDER,
  hoursSummary,
  initialFormState,
  normaliseErrors,
  previewDataFrom,
  subcategoriesFor,
  toggle,
  withCategory,
  withGovernorate,
  type FormState,
} from './form-model'

const filled = (): FormState => ({
  ...initialFormState(),
  name: 'Le Petit Jardin',
  category: 'food-and-beverage',
  subcategories: ['restaurants'],
  governorate: 'keserwan',
  district: 'jbeil',
  address: 'Old Port, Byblos',
  ownerName: 'Rita Haddad',
  ownerEmail: 'rita@example.com',
  ownerPhone: '+961 3 000 000',
})

const pick = { issue: 1, number: 47 }

describe('choices', () => {
  it('offers the seven governorates in the agreed order', () => {
    expect(GOVERNORATE_ORDER).toEqual([
      'keserwan',
      'north-lebanon',
      'beirut',
      'beqaa',
      'south-lebanon',
      'chouf',
      'matn',
    ])
  })

  it('offers only the subcategories of the chosen category', () => {
    expect(subcategoriesFor('hospitality').map((s) => s.slug)).toEqual(['hotels', 'getaways'])
    expect(subcategoriesFor('')).toEqual([])
  })

  it('offers only the districts of the chosen governorate', () => {
    expect(districtsFor('keserwan').map((d) => d.slug)).toEqual(['jbeil', 'keserwan'])
    expect(districtsFor('')).toEqual([])
  })

  it('clears subcategories when the category changes, and the district with the governorate', () => {
    const state = filled()
    expect(withCategory(state, 'hospitality').subcategories).toEqual([])
    expect(withCategory(state, 'food-and-beverage').subcategories).toEqual(['restaurants'])
    expect(withGovernorate(state, 'beirut').district).toBe('')
    expect(withGovernorate(state, 'keserwan').district).toBe('jbeil')
  })

  it('toggles a value in a list', () => {
    expect(toggle(['a'], 'b')).toEqual(['a', 'b'])
    expect(toggle(['a', 'b'], 'a')).toEqual(['b'])
  })
})

describe('buildSubmission', () => {
  it('builds an object the shared schema accepts', () => {
    const { data } = buildSubmission(filled(), pick, 'ar')
    const parsed = placeSubmissionSchema.safeParse(data)
    expect(parsed.success).toBe(true)
    expect(data).toMatchObject({
      issue: 1,
      listingNumber: 47,
      locale: 'ar',
      pageTemplate: 'a',
      payments: { cash: false, card: false, whish: false, omt: false },
    })
    expect(data).not.toHaveProperty('area')
  })

  it('drops blank hours rows and keeps closed days and times', () => {
    const state = filled()
    state.hours = state.hours.map((row) =>
      row.day === 'tue'
        ? { ...row, opens: '09:00', closes: '17:00' }
        : row.day === 'sun'
          ? { ...row, closed: true }
          : row,
    )
    const { data, hourDays } = buildSubmission(state, pick, 'en')
    expect((data as { openingHours: unknown[] }).openingHours).toEqual([
      { day: 'tue', opens: '09:00', closes: '17:00', closed: false },
      { day: 'sun', opens: '', closes: '', closed: true },
    ])
    expect(hourDays).toEqual(['tue', 'sun'])
  })

  it('leaves opening hours out when none are given', () => {
    const { data } = buildSubmission(filled(), pick, 'en')
    expect(data).not.toHaveProperty('openingHours')
  })

  it('sends no issue or number while none is picked', () => {
    const { data } = buildSubmission(filled(), null, 'en')
    expect(data).not.toHaveProperty('issue')
    expect(data).not.toHaveProperty('listingNumber')
  })
})

describe('checkSubmission', () => {
  it('passes a complete form', () => {
    expect(checkSubmission(filled(), pick, 'en').ok).toBe(true)
  })

  it('reports missing fields under the form keys', () => {
    const result = checkSubmission(initialFormState(), null, 'en')
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.errors.name).toBe('required')
    expect(result.errors.address).toBe('required')
    expect(result.errors.ownerEmail).toBeDefined()
    expect(result.errors.number).toBeDefined()
    expect(result.errors.category).toBe('required')
    expect(result.errors.governorate).toBe('required')
  })

  it('puts an hours error on its day', () => {
    const state = filled()
    state.hours = state.hours.map((row) => (row.day === 'wed' ? { ...row, opens: '9am' } : row))
    const result = checkSubmission(state, pick, 'en')
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.errors['hours.wed.opens']).toBeDefined()
  })

  it('catches a social link on the wrong site, and a bad phone', () => {
    const link = checkSubmission({ ...filled(), facebook: 'https://evil.com/x' }, pick, 'en')
    expect(link.ok).toBe(false)
    if (!link.ok) expect(errorKind(link.errors.facebook!)).toBe('link')
    const phone = checkSubmission({ ...filled(), publicPhone: 'call me' }, pick, 'en')
    expect(phone.ok).toBe(false)
    if (!phone.ok) expect(errorKind(phone.errors.publicPhone!)).toBe('phone')
  })

  it('sends the phone and the two social inputs, and no website', () => {
    const { data } = buildSubmission(
      { ...filled(), publicPhone: '+961 1 234 567', instagram: '@cafe', facebook: '' },
      pick,
      'en',
    )
    expect(data).toMatchObject({ publicPhone: '+961 1 234 567', instagram: '@cafe', facebook: '' })
    expect(data).not.toHaveProperty('website')
    expect(initialFormState()).not.toHaveProperty('website')
  })
})

describe('error keys and kinds', () => {
  it('maps schema paths to the inputs that show them', () => {
    const days = ['tue', 'sun'] as const
    expect(formErrorKey('openingHours.1.closes', [...days])).toBe('hours.sun.closes')
    expect(formErrorKey('openingHours', [...days])).toBe('hours')
    expect(formErrorKey('subcategories.2', [])).toBe('subcategories')
    expect(formErrorKey('payments.cash', [])).toBe('payments')
    expect(formErrorKey('issue', [])).toBe('number')
    expect(formErrorKey('listingNumber', [])).toBe('number')
    expect(formErrorKey('name', [])).toBe('name')
  })

  it('keeps the first message per key', () => {
    expect(normaliseErrors({ issue: 'a', listingNumber: 'b' }, [])).toEqual({ number: 'a' })
  })

  it('names the kind of a contact message by its code, never by searching the text', () => {
    // Text that merely mentions https or 6 to 20 is not a contact message.
    expect(errorKind('Use https:// links please')).toBe('invalid')
    expect(errorKind('between 6 to 20 people')).toBe('invalid')
  })

  it('refuses hotels and getaways together on the subcategories input', () => {
    const both = checkSubmission(
      { ...filled(), category: 'hospitality', subcategories: ['hotels', 'getaways'] },
      pick,
      'en',
    )
    expect(both.ok).toBe(false)
    if (!both.ok) expect(errorKind(both.errors.subcategories!)).toBe('hotelAndGetaway')
    // Through the server's field errors too (the same message crosses the network).
    const server = normaliseErrors({ subcategories: both.ok ? '' : both.errors.subcategories! }, [])
    expect(errorKind(server.subcategories!)).toBe('hotelAndGetaway')
  })

  it('names the kind of each schema message, and never passes raw text through', () => {
    expect(errorKind('required')).toBe('required')
    expect(errorKind('too long')).toBe('tooLong')
    expect(errorKind('must be an email address')).toBe('email')
    expect(errorKind('Enter an https:// link on facebook.com or fb.com.')).toBe('link')
    expect(errorKind('Use 6 to 20 characters: digits, spaces, +, - and parentheses.')).toBe('phone')
    expect(errorKind('use 24-hour time like 09:00')).toBe('time')
    expect(errorKind('Invalid input: expected number, received undefined')).toBe('invalid')
  })
})

describe('hoursSummary', () => {
  const name = (day: string) => day.toUpperCase()
  it('groups consecutive days with the same times', () => {
    const rows = initialFormState().hours.map((row) =>
      ['mon', 'tue', 'wed'].includes(row.day)
        ? { ...row, opens: '09:00', closes: '17:00' }
        : row.day === 'sat'
          ? { ...row, opens: '10:00', closes: '14:00' }
          : row,
    )
    expect(hoursSummary(rows, name)).toBe('MON-WED 09:00-17:00 \u00b7 SAT 10:00-14:00')
  })

  it('is empty when nothing is filled', () => {
    expect(hoursSummary(initialFormState().hours, name)).toBe('')
  })
})

describe('previewDataFrom', () => {
  it('passes translated labels, never slugs', () => {
    const state = { ...filled(), amenities: ['sea-view'], publicPhone: '+961 9 000 000' }
    const data = previewDataFrom(state, { galleryUrls: [], listingNumber: 47 }, 'ar', () => '')
    expect(data.category).toBe(CATEGORIES.find((c) => c.slug === 'food-and-beverage')!.ar)
    expect(data.governorate).toContain(GOVERNORATES.find((g) => g.slug === 'keserwan')!.ar)
    expect(data.amenities).toEqual([AMENITIES.find((a) => a.slug === 'sea-view')!.ar])
    expect(data.listingNumber).toBe(47)
    expect(data.phone).toBe('+961 9 000 000')
    expect(data.locale).toBe('ar')
  })

  it('stays blank where the owner has not chosen', () => {
    const data = previewDataFrom(initialFormState(), { galleryUrls: [] }, 'en', () => '')
    expect(data.category).toBe('')
    expect(data.governorate).toBe('')
    expect(data.listingNumber).toBeUndefined()
  })
})
