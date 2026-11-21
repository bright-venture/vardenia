import { describe, expect, it } from 'vitest'
import { branchRequestSchema } from '@vardenia/core'
import {
  branchIssueKey,
  buildBranchBody,
  emptyBranchDraft,
  readBranchResponse,
  validateBranchDraft,
} from './partner-branch-form'

const filled = () => ({
  ...emptyBranchDraft(12),
  name: 'Cafe Nour Jounieh',
  governorate: 'keserwan',
  address: 'Old souk',
  mapUrl: 'https://www.google.com/maps/@33.98,35.61,17z',
})

describe('buildBranchBody', () => {
  it('builds a body the strict branch schema accepts, without blank optional keys', () => {
    const body = buildBranchBody(filled(), 'ar')
    expect(body).toEqual({
      sourceListingId: 12,
      name: 'Cafe Nour Jounieh',
      governorate: 'keserwan',
      address: 'Old souk',
      mapUrl: 'https://www.google.com/maps/@33.98,35.61,17z',
      locale: 'ar',
    })
    expect(branchRequestSchema.safeParse(body).success).toBe(true)
  })

  it('sends only the contact fields that were filled in', () => {
    const draft = filled()
    draft.contact.phone = ' 03 123 456 '
    draft.district = 'keserwan'
    const body = buildBranchBody(draft, 'en')
    expect(body.contact).toEqual({ phone: '03 123 456' })
    expect(body.district).toBe('keserwan')
    expect(branchRequestSchema.safeParse(body).success).toBe(true)
  })

  it('only ever sends keys of the branch schema', () => {
    const draft = filled()
    for (const key of Object.keys(draft.contact)) {
      draft.contact[key as keyof typeof draft.contact] = 'x'
    }
    const allowed = [
      'sourceListingId',
      'name',
      'governorate',
      'district',
      'address',
      'mapUrl',
      'location',
      'openingHours',
      'contact',
      'locale',
    ]
    for (const key of Object.keys(buildBranchBody(draft, 'en'))) expect(allowed).toContain(key)
  })
})

describe('readBranchResponse', () => {
  it('is a success on 201', () => {
    expect(readBranchResponse(201, { ok: true, listingId: 4, brandId: 2 })).toEqual({ ok: true })
  })

  it('puts schema issues beside their fields', () => {
    expect(
      readBranchResponse(400, {
        ok: false,
        code: 'invalid',
        message: 'Please check the branch details.',
        issues: [
          { path: 'mapUrl', message: 'That link points outside Lebanon.' },
          { path: 'contact.phone', message: 'Use 6 to 20 characters.' },
        ],
      }),
    ).toEqual({
      ok: false,
      code: 'invalid',
      message: 'Please check the branch details.',
      fields: {
        mapUrl: 'That link points outside Lebanon.',
        'contact.phone': 'Use 6 to 20 characters.',
      },
    })
  })

  it('keeps the limit refusals with their message', () => {
    expect(
      readBranchResponse(429, { ok: false, code: 'daily-limit', message: 'At most 5 a day.' }),
    ).toEqual({ ok: false, code: 'daily-limit', message: 'At most 5 a day.', fields: {} })
    expect(
      readBranchResponse(409, { ok: false, code: 'brand-full', message: 'At most 20.' }),
    ).toMatchObject({ code: 'brand-full', message: 'At most 20.' })
  })

  it('names the rate limiter, which answers in plain text', () => {
    expect(readBranchResponse(429, null)).toEqual({
      ok: false,
      code: 'too-many',
      message: null,
      fields: {},
    })
    expect(readBranchResponse(500, null)).toEqual({
      ok: false,
      code: 'error',
      message: null,
      fields: {},
    })
  })
})

describe('localized branch errors (review M3)', () => {
  it('catches blank required fields on the client, before sending', () => {
    expect(validateBranchDraft(emptyBranchDraft(12))).toEqual({
      name: 'errRequired',
      governorate: 'errGovernorate',
      address: 'errRequired',
      mapUrl: 'errMapRequired',
    })
    expect(validateBranchDraft(filled())).toEqual({})
  })

  it.each([
    ['name', 'required', 'errRequired'],
    ['name', 'too long', 'errTooLong'],
    ['address', 'too long', 'errTooLong'],
    ['governorate', 'Invalid option: expected one of "beirut"|"matn"', 'errGovernorate'],
    ['district', 'is not in the chosen governorate', 'errDistrict'],
    ['mapUrl', 'paste a Google Maps link or give the map point', 'errMapRequired'],
    ['mapUrl', 'That link points outside Lebanon. Check it is the right place.', 'errMapOutside'],
    [
      'mapUrl',
      'Paste a Google Maps link (https://www.google.com/maps/..., or a maps.app.goo.gl short link).',
      'errMapLink',
    ],
    ['location', 'must be a point in Lebanon: longitude then latitude', 'errMapOutside'],
    ['contact.phone', 'Use 6 to 20 characters: digits, spaces, +, - and parentheses.', 'errPhone'],
    ['contact.email', 'Enter a valid email address.', 'errEmail'],
    ['contact.x', 'Enter an https:// link on x.com or twitter.com, or just the handle.', 'errLink'],
    ['contact.phone', 'something new', 'errInvalid'],
    ['', 'Unrecognized key: "tier"', 'errInvalid'],
  ])('maps %s "%s" to %s', (path, message, key) => {
    expect(branchIssueKey(path, message)).toBe(key)
  })
})
