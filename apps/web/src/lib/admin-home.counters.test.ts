import { describe, expect, it, vi } from 'vitest'

vi.mock('./dashboard-stats', () => ({
  dashboardCounts: async () => ({
    publishedListings: 4,
    draftListings: 2,
    publishedArticles: 0,
    issues: 0,
    activeCodes: 0,
    recentScans: 9,
  }),
}))

const { adminHome } = await import('./admin-home')

const fakePayload = (pending: number, incomplete: number) => {
  const counts: { collection: string; where: unknown; overrideAccess?: boolean; user?: unknown }[] =
    []
  const payload = {
    find: async () => ({ docs: [], totalDocs: 0 }),
    count: async (args: { collection: string; where?: Record<string, unknown> }) => {
      counts.push(args as never)
      const status = (args.where?.['submission.status'] as { equals?: string } | undefined)?.equals
      return {
        totalDocs: status === 'pending' ? pending : status === 'incomplete' ? incomplete : 0,
      }
    },
  }
  return { payload: payload as never, counts }
}

const staff = { id: 2, collection: 'users', roles: ['staff'] } as never

describe('admin home submission counters', () => {
  it('counts Submissions to review (pending) and Incomplete forms', async () => {
    const { payload } = fakePayload(3, 5)
    const home = await adminHome(payload, staff)
    expect(home.numbers.submissionsToReview).toBe(3)
    expect(home.numbers.incompleteForms).toBe(5)
  })

  it('asks as the signed-in staff member, with access rules on, and reads no rows', async () => {
    const { payload, counts } = fakePayload(1, 1)
    await adminHome(payload, staff)
    const asked = counts.filter(
      (c) => c.collection === 'businesses' && JSON.stringify(c.where).includes('submission.status'),
    )
    expect(asked).toHaveLength(2)
    for (const c of asked) {
      expect(c.overrideAccess).toBe(false)
      expect(c.user).toBe(staff)
    }
  })

  it('puts a link to the pending queue on the to-do list only when there are some', async () => {
    const some = await adminHome(fakePayload(2, 0).payload, staff)
    const item = some.attention.find((a) => a.title === '2 submissions to review')
    expect(item?.href).toBe(
      '/admin/collections/businesses?where[submission.status][equals]=pending',
    )
    const none = await adminHome(fakePayload(0, 4).payload, staff)
    expect(none.attention.some((a) => /submission/.test(a.title))).toBe(false)
  })
})
