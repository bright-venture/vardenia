import { describe, expect, it } from 'vitest'
import { Businesses } from '../collections/Businesses'
import { SUBMISSION_QUEUES, queueHref } from './submission-queues'

describe('submission queues', () => {
  it('offers Submitted, Incomplete, Abandoned and Rejected on submission.status, plus the whole list', () => {
    expect(SUBMISSION_QUEUES.map((q) => [q.label, q.status])).toEqual([
      ['All listings', null],
      ['Submitted', 'pending'],
      ['Incomplete', 'incomplete'],
      ['Abandoned', 'abandoned'],
      ['Rejected', 'rejected'],
    ])
  })

  it('links to the normal Listings list with one filter, or none', () => {
    expect(queueHref('pending')).toBe(
      '/admin/collections/businesses?where[submission.status][equals]=pending',
    )
    expect(queueHref(null)).toBe('/admin/collections/businesses')
  })

  it('does not hide anything: the list has no base filter and no filter on read', () => {
    const admin = Businesses.admin as Record<string, unknown>
    expect(admin.baseListFilter).toBeUndefined()
    expect((Businesses as unknown as Record<string, unknown>).defaultSort).toBeUndefined()
    expect(Businesses.admin?.components?.beforeListTable).toEqual([
      '/components/admin/SubmissionQueues#SubmissionQueues',
    ])
  })
})
