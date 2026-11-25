import { describe, expect, it } from 'vitest'
import type { FieldAccess } from 'payload'
import { PARTNER_EDITABLE_FIELDS } from '@vardenia/core'
import { Businesses } from './Businesses'
import { staffSearch } from '../hooks/staffSearch'
import { syncOwnerPhoneSearch } from '../hooks/syncOwnerPhoneSearch'
import { recordSubmissionHistory } from '../hooks/recordSubmissionHistory'
import { requireRejectionReason } from '../hooks/requireRejectionReason'
import { releaseListingNumber } from '../hooks/releaseListingNumber'
import { PROTECTED_SORT_FIELDS } from '../hooks/guardSort'

/**
 * Admin review tools (Task 6): the search columns, the rejection and history
 * fields, and the hooks that keep them honest.
 */

type Loose = {
  name?: string
  type?: string
  fields?: Loose[]
  tabs?: { fields: Loose[] }[]
  access?: Record<string, FieldAccess>
  admin?: { readOnly?: boolean; components?: { Field?: string } }
}

const find = (fields: Loose[], path: string[]): Loose => {
  const [head, ...rest] = path
  for (const f of fields) {
    if (f.name === head) return rest.length ? find(f.fields ?? [], rest) : f
    for (const tab of f.tabs ?? []) {
      try {
        return find(tab.fields, path)
      } catch {
        /* next tab */
      }
    }
  }
  throw new Error(`no field ${path.join('.')}`)
}
const submission = (...path: string[]) =>
  find(Businesses.fields as unknown as Loose[], ['submission', ...path])
const ctx = (user: unknown) => ({ req: { user } }) as unknown as Parameters<FieldAccess>[0]
const staff = { id: 2, collection: 'users', roles: ['staff'] }
const owner = { id: 20, collection: 'business-users', businesses: [7] }
const customer = { id: 21, collection: 'customers' }

describe('Listings search', () => {
  const searched = Businesses.admin?.listSearchableFields ?? []

  it('finds a business by reference, page number, owner name, email and phone', () => {
    for (const field of [
      'name',
      'listingNumber',
      'submission.reference',
      'submission.ownerName',
      'submission.ownerEmail',
      'submission.ownerPhone',
      'submission.ownerPhoneSearch',
    ]) {
      expect(searched, field).toContain(field)
    }
  })

  it('searches only fields that are staff-only (the owner fields), so nothing leaks to the public', () => {
    for (const field of searched.filter((f) => f.startsWith('submission.'))) {
      const access = submission(...field.split('.').slice(1)).access!
      expect(access.read!(ctx(staff)), field).toBe(true)
      for (const who of [owner, customer, null]) expect(access.read!(ctx(who)), field).toBe(false)
    }
  })

  it('runs the search rewrite and the phone sync', () => {
    expect(Businesses.hooks?.beforeOperation).toContain(staffSearch)
    expect(Businesses.hooks?.beforeChange).toContain(syncOwnerPhoneSearch)
  })

  it('the phone search column cannot be sorted on by the public', () => {
    expect(PROTECTED_SORT_FIELDS).toContain('submission.ownerPhoneSearch')
  })
})

describe('rejection and history fields', () => {
  const STAFF_ONLY = [
    ['ownerPhoneSearch'],
    ['rejectionReason'],
    ['rejectionReasonShared'],
    ['rejectedAt'],
    ['rejectedBy'],
    ['history'],
  ]

  it.each(STAFF_ONLY)(
    '%s: staff read and write it; nobody else reads, writes or creates it',
    (...path) => {
      const access = submission(...path).access!
      expect(access.read!(ctx(staff))).toBe(true)
      for (const who of [owner, customer, null]) {
        expect(access.read!(ctx(who))).toBe(false)
        expect(access.update!(ctx(who))).toBe(false)
        expect(access.create!(ctx(who))).toBe(false)
      }
    },
  )

  it('the history is read-only in the admin and holds step, time, who and a short note, never owner details', () => {
    const history = submission('history')
    expect(history.admin?.readOnly).toBe(true)
    expect((history.fields ?? []).map((f) => f.name)).toEqual(['step', 'at', 'by', 'note'])
  })

  it('is never partner-editable', () => {
    expect(PARTNER_EDITABLE_FIELDS as readonly string[]).not.toContain('submission')
  })

  it('records history and requires a reason, and still frees the number on rejection', () => {
    expect(Businesses.hooks?.beforeChange).toContain(recordSubmissionHistory)
    expect(Businesses.hooks?.beforeChange).toContain(releaseListingNumber)
    expect(Businesses.hooks?.beforeValidate).toContain(requireRejectionReason)
  })
})

describe('review view and the payment and review panel', () => {
  it('are components on the Submission group, which only staff see', () => {
    expect(submission('review').admin?.components?.Field).toBe(
      '/components/admin/SubmissionReview#SubmissionReview',
    )
    expect(submission('paymentPanel').admin?.components?.Field).toBe(
      '/components/admin/PaymentReviewPanel#PaymentReviewPanel',
    )
  })

  it('has one Reject control: inside the panel, not registered on its own', () => {
    const paths = JSON.stringify(Businesses.fields)
    expect(paths).not.toContain('/components/admin/RejectSubmission#RejectSubmission')
  })
})
