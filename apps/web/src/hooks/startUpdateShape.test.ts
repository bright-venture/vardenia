import { describe, expect, it, vi } from 'vitest'
import type { PlaceSubmission } from '@vardenia/core'

vi.mock('../lib/report', () => ({ reportError: vi.fn(async () => {}) }))
vi.mock('../lib/branches', () => ({ runInTransaction: vi.fn() }))

import { Businesses } from '../collections/Businesses'
import { followUpData } from '../lib/place-submission'
import { guardKindFields } from './guardKindFields'
import { guardPartnerListingWrite } from './guardPartnerListingWrite'
import {
  approveSubmissionOnPublish,
  linkPartnerOnPublish,
  refusePublishingRejected,
  refusePublishingUnfinished,
  requireContractToPublish,
} from './linkPartnerOnPublish'
import { ensureQrCode } from './ensureQrCode'
import { autoTranslateListing } from './autoTranslateListing'
import { fillLocationFromMapUrl } from './fillLocationFromMapUrl'
import { markMediaAttached } from './markMediaAttached'
import { protectSeatingAreaBookings } from './protectSeatingAreaBookings'
import { releaseListingNumber } from './releaseListingNumber'
import { revalidateListingsAfterChange } from './revalidateListings'
import { syncBrandPublished } from './syncBrandPublished'

/**
 * The write startPlaceSubmission makes right after creating the draft (the
 * reference, plus name and address in the default locale) is an ordinary update
 * as far as Payload is concerned, so every businesses hook runs on it, for an
 * anonymous request on a hidden incomplete draft. Each hook is run here with
 * exactly that data and that stored draft: none may refuse it, free the number
 * or publish.
 */

const input = { locale: 'ar', name: 'Cafe Nour', address: 'Hamra St' } as PlaceSubmission
const data = followUpData(input, 'VD-555') as Record<string, unknown>

/** The draft as stored after the create. */
const stored = {
  id: 555,
  name: 'Cafe Nour',
  slug: 'cafe-nour',
  _status: 'draft',
  tier: 'silver',
  issue: 7,
  listingNumber: 12,
  governorate: 'beirut',
  subcategories: ['cafes'],
  submission: {
    status: 'incomplete',
    ownerName: 'Nour',
    ownerEmail: 'n@x.com',
    ownerPhone: '+9617',
  },
}

const req = (extra: Record<string, unknown> = {}) => ({
  user: null,
  locale: 'en',
  payload: {
    find: vi.fn(),
    findByID: vi.fn(),
    update: vi.fn(),
    create: vi.fn(),
    count: vi.fn(),
    logger: { error: vi.fn(), info: vi.fn() },
  },
  ...extra,
})

const call = (hook: unknown, args: Record<string, unknown>) =>
  (hook as (a: unknown) => unknown)({
    operation: 'update',
    originalDoc: stored,
    previousDoc: stored,
    doc: { ...stored, ...data },
    data: structuredClone(data),
    req: req(),
    context: { skipQrGeneration: true, skipAutoTranslate: true },
    collection: Businesses,
    ...args,
  })

describe('the follow-up write of a start', () => {
  it('sends only the reference, and name and address for another locale', () => {
    expect(data).toEqual({
      name: 'Cafe Nour',
      address: 'Hamra St',
      submission: { reference: 'VD-555' },
    })
    expect(followUpData({ ...input, locale: 'en' }, 'VD-1')).toEqual({
      submission: { reference: 'VD-1' },
    })
  })
})

describe('businesses hooks on that write, anonymous, on an incomplete draft', () => {
  it('beforeValidate hooks neither refuse nor change it', async () => {
    for (const hook of [
      refusePublishingRejected,
      refusePublishingUnfinished,
      requireContractToPublish,
      fillLocationFromMapUrl,
      guardKindFields,
      protectSeatingAreaBookings,
    ]) {
      expect(await call(hook, {})).toEqual(data)
    }
  })

  it('releaseListingNumber keeps the number (status is read from the stored draft)', () => {
    const out = call(releaseListingNumber, {}) as Record<string, unknown>
    expect(out).toEqual(data)
    expect(out).not.toHaveProperty('listingNumber')
  })

  it('approveSubmissionOnPublish does not approve or publish', () => {
    const out = call(approveSubmissionOnPublish, {}) as Record<string, unknown>
    expect(out).toEqual(data)
    expect(out).not.toHaveProperty('_status')
  })

  it('guardPartnerListingWrite passes a system write untouched', async () => {
    const args = { id: 555, data, overrideAccess: true }
    expect(await call(guardPartnerListingWrite, { args, overrideAccess: true })).toBe(args)
  })

  it('afterChange hooks do nothing to other records', async () => {
    const r = req()
    const doc = { ...stored, ...data }
    for (const hook of [ensureQrCode, linkPartnerOnPublish, autoTranslateListing]) {
      expect(await call(hook, { doc, req: r })).toBe(doc)
    }
    expect(await call(markMediaAttached, { doc, req: r })).toBe(doc)
    expect(await call(syncBrandPublished, { doc, req: r })).toBe(doc)
    expect(await call(revalidateListingsAfterChange, { doc, req: r })).toBe(doc)
    for (const m of ['find', 'findByID', 'update', 'create', 'count'] as const) {
      expect(r.payload[m]).not.toHaveBeenCalled()
    }
  })

  it('linkPartnerOnPublish does not link, even without the skip flags', async () => {
    const r = req()
    const doc = { ...stored, ...data }
    await call(linkPartnerOnPublish, { doc, req: r, context: {} })
    expect(r.payload.create).not.toHaveBeenCalled()
  })
})
