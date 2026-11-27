import { describe, expect, it } from 'vitest'
import { placeSubmissionSchema } from '@vardenia/core/place-submission'
import { submittableKindsByCategory } from '@vardenia/core/taxonomy'
import {
  buildSubmission,
  checkSubmission,
  errorKind,
  formErrorKey,
  initialFormState,
  normaliseErrors,
  withIssue,
  withPlace,
  type FormState,
} from './form-model'
import type { OpenIssue } from './use-place-issues'

const allLebanon: OpenIssue = {
  issueId: 1,
  title: 'Summer',
  coverage: 'all-lebanon',
  governorate: null,
}
const keserwanOnly: OpenIssue = {
  issueId: 2,
  title: 'Keserwan',
  coverage: 'governorate',
  governorate: 'keserwan',
}

/** A complete form on an All Lebanon issue: a governorate, no city. */
const filled = (): FormState => ({
  ...initialFormState(),
  issue: allLebanon,
  name: 'Le Petit Jardin',
  kind: 'restaurants',
  governorate: 'keserwan',
  city: '',
  address: 'Old Port, Byblos',
  ownerName: 'Rita Haddad',
  ownerEmail: 'rita@example.com',
  ownerPhone: '+961 3 000 000',
  layout: 'full-page',
})

const pick = { issue: 1, number: 47 }

/** A complete form on an issue for Keserwan: its city chosen. */
const filledByCity = (): FormState => ({
  ...filled(),
  issue: keserwanOnly,
  governorate: 'keserwan',
  city: 'jbeil',
})
const cityPick = { issue: 2, number: 5 }

describe('choices', () => {
  it('offers every kind, coming-soon ones included, grouped by category', () => {
    const slugs = submittableKindsByCategory().flatMap((g) => g.kinds.map((k) => k.slug))
    expect(slugs).toHaveLength(16)
    expect(slugs).toContain('car-rental')
  })
})

describe('issue first', () => {
  it('starts with no issue and no place', () => {
    expect(initialFormState()).toMatchObject({ issue: null, governorate: '', city: '' })
  })

  it('a new All Lebanon issue clears the place and the layout', () => {
    const next = withIssue(filledByCity(), allLebanon)
    expect(next).toMatchObject({ issue: allLebanon, governorate: '', city: '', layout: null })
  })

  it('a new issue for one governorate takes that governorate, and clears the city and layout', () => {
    const next = withIssue(filled(), keserwanOnly)
    expect(next).toMatchObject({
      issue: keserwanOnly,
      governorate: 'keserwan',
      city: '',
      layout: null,
    })
  })

  it('choosing the same issue again changes nothing', () => {
    const state = filled()
    expect(withIssue(state, { ...allLebanon })).toBe(state)
  })

  it('a new governorate of an All Lebanon issue clears the layout, and never sets a city', () => {
    const next = withPlace(filled(), 'beirut')
    expect(next).toMatchObject({ governorate: 'beirut', city: '', layout: null })
    const same = filled()
    expect(withPlace(same, 'keserwan')).toBe(same)
  })

  it('a new city of an issue for one governorate clears the layout, keeping the governorate', () => {
    const next = withPlace(filledByCity(), 'jounieh')
    expect(next).toMatchObject({ governorate: 'keserwan', city: 'jounieh', layout: null })
    const same = filledByCity()
    expect(withPlace(same, 'jbeil')).toBe(same)
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
      layout: 'full-page',
      kind: 'restaurants',
      acceptsWhish: true,
    })
    for (const key of ['area', 'category', 'subcategories', 'payments', 'openingHours']) {
      expect(data).not.toHaveProperty(key)
    }
  })

  it('sends the optional description, and the schema accepts it empty or up to 2000', () => {
    const { data } = buildSubmission({ ...filled(), description: 'Seasonal cooking.' }, pick, 'en')
    expect(data).toMatchObject({ description: 'Seasonal cooking.' })
    expect(placeSubmissionSchema.safeParse(data).success).toBe(true)
    const empty = buildSubmission({ ...filled(), description: '' }, pick, 'en').data
    expect(placeSubmissionSchema.safeParse(empty).success).toBe(true)
    const long = buildSubmission({ ...filled(), description: 'x'.repeat(2001) }, pick, 'en').data
    expect(placeSubmissionSchema.safeParse(long).success).toBe(false)
  })

  it('sends the chosen issue, and no number while none is picked', () => {
    const { data } = buildSubmission(filled(), null, 'en')
    expect(data).toMatchObject({ issue: 1 })
    expect(data).not.toHaveProperty('listingNumber')
    const { data: none } = buildSubmission(initialFormState(), null, 'en')
    expect(none).not.toHaveProperty('issue')
  })

  it('sends no city for an All Lebanon issue, and the city for an issue for one governorate', () => {
    const { data } = buildSubmission({ ...filled(), city: 'jbeil' }, pick, 'en')
    expect(data).toMatchObject({ governorate: 'keserwan' })
    expect(data).not.toHaveProperty('city')
    const { data: byCity } = buildSubmission(filledByCity(), cityPick, 'en')
    expect(byCity).toMatchObject({ issue: 2, governorate: 'keserwan', city: 'jbeil' })
    expect(placeSubmissionSchema.safeParse(byCity).success).toBe(true)
  })

  it('sends cash and Whish as ticked, and the schema keeps both', () => {
    const { data } = buildSubmission({ ...filled(), acceptsCash: true }, pick, 'en')
    const parsed = placeSubmissionSchema.safeParse(data)
    expect(parsed.success && parsed.data.acceptsCash).toBe(true)
    expect(parsed.success && parsed.data.acceptsWhish).toBe(false)
  })

  it('sends no layout while none is chosen', () => {
    const { data } = buildSubmission({ ...filled(), layout: null }, pick, 'en')
    expect(data).not.toHaveProperty('layout')
  })

  it('starts with no layout chosen, and never sends a page design', () => {
    expect(initialFormState().layout).toBeNull()
    expect(buildSubmission(filled(), pick, 'en').data).not.toHaveProperty('pageTemplate')
  })
})

describe('checkSubmission', () => {
  it('passes a complete form', () => {
    expect(checkSubmission(filled(), pick, 'en').ok).toBe(true)
  })

  it('passes a complete form on an issue for one governorate', () => {
    expect(checkSubmission(filledByCity(), cityPick, 'en').ok).toBe(true)
  })

  it('reports missing fields under the form keys, and the issue first', () => {
    const result = checkSubmission(initialFormState(), null, 'en')
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.errors.issue).toBe('required')
    expect(result.errors.name).toBe('required')
    expect(result.errors.address).toBe('required')
    expect(result.errors.ownerEmail).toBeDefined()
    expect(result.errors.number).toBeDefined()
    expect(result.errors.kind).toBe('required')
    expect(result.errors.layout).toBe('required')
    // No issue yet: no place select is shown, so the error is on the issue only.
    expect(result.errors.governorate).toBeUndefined()
    expect(result.errors.city).toBeUndefined()
  })

  it('requires the governorate, never a city, on an All Lebanon issue', () => {
    const result = checkSubmission({ ...filled(), governorate: '' }, pick, 'en')
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.errors).toEqual({ governorate: 'required' })
  })

  it('requires the city on an issue for one governorate', () => {
    const result = checkSubmission({ ...filledByCity(), city: '' }, cityPick, 'en')
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.errors).toEqual({ city: 'required' })
  })

  it("refuses a city that is not the issue governorate's on the city input", () => {
    const result = checkSubmission({ ...filledByCity(), city: 'tyre' }, cityPick, 'en')
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(Object.keys(result.errors)).toEqual(['city'])
    expect(result.errors.city).not.toBe('required')
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
    expect(formErrorKey('issue')).toBe('issue')
    expect(formErrorKey('listingNumber')).toBe('number')
    expect(formErrorKey('name')).toBe('name')
    expect(formErrorKey('layout')).toBe('layout')
  })

  it('keeps the first message per key', () => {
    expect(normaliseErrors({ listingNumber: 'a', 'listingNumber.x': 'b', issue: 'c' })).toEqual({
      number: 'a',
      issue: 'c',
    })
  })

  it('names the kind of a contact message by its code, never by searching the text', () => {
    // Text that merely mentions https or 6 to 20 is not a contact message.
    expect(errorKind('Use https:// links please')).toBe('invalid')
    expect(errorKind('between 6 to 20 people')).toBe('invalid')
  })

  it('refuses an unknown kind on the kind input', () => {
    const hidden = checkSubmission({ ...filled(), kind: 'spaceport' }, pick, 'en')
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
