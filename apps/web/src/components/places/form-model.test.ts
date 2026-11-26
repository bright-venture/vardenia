import { describe, expect, it } from 'vitest'
import { placeSubmissionSchema } from '@vardenia/core/place-submission'
import { GOVERNORATES } from '@vardenia/core/regions'
import { CATEGORIES, submittableKindsByCategory } from '@vardenia/core/taxonomy'
import {
  buildSubmission,
  checkSubmission,
  citiesFor,
  errorKind,
  formErrorKey,
  GOVERNORATE_ORDER,
  initialFormState,
  normaliseErrors,
  previewDataFrom,
  withGovernorate,
  type FormState,
} from './form-model'

const filled = (): FormState => ({
  ...initialFormState(),
  name: 'Le Petit Jardin',
  kind: 'restaurants',
  governorate: 'keserwan',
  city: 'jbeil',
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

  it('offers only the submittable kinds, grouped, none of the hidden ones', () => {
    const slugs = submittableKindsByCategory().flatMap((g) => g.kinds.map((k) => k.slug))
    expect(slugs).toHaveLength(10)
    expect(slugs).not.toContain('car-rental')
  })

  it('offers only the cities of the chosen governorate', () => {
    expect(citiesFor('south-lebanon').map((d) => d.slug)).toEqual(['sidon', 'tyre', 'jezzine'])
    expect(citiesFor('')).toEqual([])
  })

  it('clears the city with the governorate', () => {
    const state = filled()
    expect(withGovernorate(state, 'beirut').city).toBe('')
    expect(withGovernorate(state, 'keserwan').city).toBe('jbeil')
  })

  it('offers every governorate exactly its own cities from core regions', () => {
    for (const gov of GOVERNORATES) {
      expect(citiesFor(gov.slug).map((d) => d.slug)).toEqual(gov.cities.map((d) => d.slug))
      expect(citiesFor(gov.slug).length).toBeGreaterThan(0)
    }
  })
})

describe('buildSubmission', () => {
  it('builds an object the shared schema accepts', () => {
    const { data } = buildSubmission({ ...filled(), acceptsWhish: true }, pick, 'ar')
    const parsed = placeSubmissionSchema.safeParse(data)
    expect(parsed.success).toBe(true)
    expect(parsed.success && parsed.data.acceptsWhish).toBe(true)
    expect(data).toMatchObject({
      issue: 1,
      listingNumber: 47,
      locale: 'ar',
      pageTemplate: 'a',
      kind: 'restaurants',
      acceptsWhish: true,
    })
    for (const key of ['area', 'category', 'subcategories', 'payments', 'openingHours']) {
      expect(data).not.toHaveProperty(key)
    }
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
    expect(result.errors.kind).toBe('required')
    expect(result.errors.governorate).toBe('required')
    // No region yet: the city select is disabled, so the error is on the region only.
    expect(result.errors.city).toBeUndefined()
  })

  it('requires a city once the region is chosen', () => {
    const result = checkSubmission({ ...filled(), city: '' }, pick, 'en')
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.errors).toEqual({ city: 'required' })
  })

  it('refuses a city of another region on the city input', () => {
    const result = checkSubmission({ ...filled(), city: 'tyre' }, pick, 'en')
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(Object.keys(result.errors)).toEqual(['city'])
    expect(result.errors.city).not.toBe('required')
  })

  it('sends the same issue and number whatever the city', () => {
    for (const city of citiesFor('keserwan')) {
      const { data } = buildSubmission({ ...filled(), city: city.slug }, pick, 'en')
      expect(data).toMatchObject({ issue: 1, listingNumber: 47, city: city.slug })
    }
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
    expect(formErrorKey('kind')).toBe('kind')
    expect(formErrorKey('issue')).toBe('number')
    expect(formErrorKey('listingNumber')).toBe('number')
    expect(formErrorKey('name')).toBe('name')
  })

  it('keeps the first message per key', () => {
    expect(normaliseErrors({ issue: 'a', listingNumber: 'b' })).toEqual({ number: 'a' })
  })

  it('names the kind of a contact message by its code, never by searching the text', () => {
    // Text that merely mentions https or 6 to 20 is not a contact message.
    expect(errorKind('Use https:// links please')).toBe('invalid')
    expect(errorKind('between 6 to 20 people')).toBe('invalid')
  })

  it('refuses a hidden kind on the kind input', () => {
    const hidden = checkSubmission({ ...filled(), kind: 'car-rental' }, pick, 'en')
    expect(hidden.ok).toBe(false)
    if (!hidden.ok) expect(hidden.errors.kind).toBeDefined()
  })

  it('names the kind of each schema message, and never passes raw text through', () => {
    expect(errorKind('required')).toBe('required')
    expect(errorKind('too long')).toBe('tooLong')
    expect(errorKind('must be an email address')).toBe('email')
    expect(errorKind('Enter an https:// link on facebook.com or fb.com.')).toBe('link')
    expect(errorKind('Use 6 to 20 characters: digits, spaces, +, - and parentheses.')).toBe('phone')
    expect(errorKind('Invalid input: expected number, received undefined')).toBe('invalid')
  })
})

describe('previewDataFrom', () => {
  it('passes translated labels, never slugs', () => {
    const state = { ...filled(), publicPhone: '+961 9 000 000' }
    const data = previewDataFrom(state, { galleryUrls: [], listingNumber: 47 }, 'ar')
    expect(data.category).toBe(CATEGORIES.find((c) => c.slug === 'food-and-beverage')!.ar)
    expect(data.governorate).toContain(GOVERNORATES.find((g) => g.slug === 'keserwan')!.ar)
    expect(data.listingNumber).toBe(47)
    expect(data.phone).toBe('+961 9 000 000')
    expect(data.locale).toBe('ar')
  })

  it('stays blank where the owner has not chosen', () => {
    const data = previewDataFrom(initialFormState(), { galleryUrls: [] }, 'en')
    expect(data.category).toBe('')
    expect(data.governorate).toBe('')
    expect(data.listingNumber).toBeUndefined()
  })
})
