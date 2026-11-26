import { describe, expect, it, vi } from 'vitest'
import type { Where } from 'payload'
import { Businesses } from '../collections/Businesses'
import { LIST_COLUMNS, LIST_DEFAULT_COLUMNS } from '../collections/businesses-list-columns'
import {
  CLOSED_STATUSES,
  DEADLINE_SOON_DAYS,
  STAGE_LABELS,
  STATUS_LABELS,
  SUBMISSION_QUEUES,
  countQuery,
  countedKeys,
  countsFromRow,
  deadlineFilters,
  deadlineText,
  isShowing,
  listHref,
  loadQueueCounts,
  nextDeadline,
  queueHref,
  whereParams,
  whereToSql,
} from './submission-queues'

const now = new Date('2026-11-24T10:00:00.000Z')
const DAY = 86_400_000

type Loose = {
  name?: string
  type?: string
  options?: { value: string }[]
  fields?: Loose[]
}
const submission = (Businesses.fields as unknown as Loose[]).find((f) => f.name === 'submission')!
const optionsOf = (fields: Loose[], name: string) =>
  fields.find((f) => f.name === name)!.options!.map((o) => o.value)
const STATUSES = optionsOf(submission.fields!, 'status')
const STAGES = optionsOf(submission.fields!.find((f) => f.name === 'payment')!.fields!, 'stage')

/** Every equals/in value a where names on a path, walking and/or. */
function valuesOn(where: Where | null, path: string): string[] {
  if (!where) return []
  return Object.entries(where).flatMap(([key, value]) => {
    if (key === 'and' || key === 'or') return (value as Where[]).flatMap((w) => valuesOn(w, path))
    if (key !== path) return []
    const c = value as { equals?: string; in?: string[] }
    return [...(c.equals ? [c.equals] : []), ...(c.in ?? [])]
  })
}

describe('quick filters (PRD v4 7.1)', () => {
  it('are the ten chips, in order', () => {
    expect(SUBMISSION_QUEUES.map((q) => q.label)).toEqual([
      'Awaiting downpayment',
      'Downpayment received, to review',
      'Accepted, awaiting the rest',
      'Fully paid, ready to publish',
      'Refunds to send',
      'Closed',
      'Incomplete',
      'All',
      'Sample listings',
      'Real listings',
    ])
  })

  it('has Sample and Real chips on the isSample flag, and All is still unfiltered', () => {
    const by = (key: string) => SUBMISSION_QUEUES.find((q) => q.key === key)!
    expect(by('sample').where).toEqual({ or: [{ and: [{ isSample: { equals: true } }] }] })
    expect(by('real').where).toEqual({ or: [{ and: [{ isSample: { not_equals: true } }] }] })
    expect(by('all').where).toBeNull()
  })

  it('filter on real statuses and stages only', () => {
    for (const q of SUBMISSION_QUEUES) {
      for (const v of valuesOn(q.where, 'submission.status')) expect(STATUSES).toContain(v)
      for (const v of valuesOn(q.where, 'submission.payment.stage')) expect(STAGES).toContain(v)
    }
  })

  it('map each work status to its chip, and Closed to the four ends', () => {
    const by = (key: string) => SUBMISSION_QUEUES.find((q) => q.key === key)!
    expect(valuesOn(by('awaiting-downpayment').where, 'submission.status')).toEqual([
      'awaiting_downpayment',
    ])
    expect(valuesOn(by('to-review').where, 'submission.status')).toEqual(['pending'])
    expect(valuesOn(by('awaiting-rest').where, 'submission.status')).toEqual(['accepted'])
    expect(valuesOn(by('ready-to-publish').where, 'submission.status')).toEqual(['paid'])
    expect(valuesOn(by('refunds').where, 'submission.payment.stage')).toEqual(['refund_due'])
    expect(valuesOn(by('closed').where, 'submission.status')).toEqual([...CLOSED_STATUSES])
    expect(valuesOn(by('incomplete').where, 'submission.status')).toEqual(['incomplete'])
    expect(by('all').where).toBeNull()
  })

  it('open on the deadline that drives them, nearest first, and always carry a sort', () => {
    const sortOf = (key: string) => SUBMISSION_QUEUES.find((q) => q.key === key)!.sort
    expect(sortOf('awaiting-downpayment')).toBe('submission.payment.downpaymentDueAt')
    expect(sortOf('awaiting-rest')).toBe('submission.payment.balanceDueAt')
    for (const q of SUBMISSION_QUEUES) expect(q.sort).toBeTruthy()
  })

  it('are written in the or/and shape the Filters panel reads back', () => {
    for (const q of SUBMISSION_QUEUES) {
      if (!q.where) continue
      expect(Object.keys(q.where)).toEqual(['or'])
      for (const branch of q.where.or as Where[]) expect(Object.keys(branch)).toEqual(['and'])
    }
  })
})

describe('links', () => {
  it('put the filter and the sort in the address, in bracket form', () => {
    expect(queueHref('to-review')).toBe(
      '/admin/collections/businesses?where[or][0][and][0][submission.status][equals]=pending&sort=submission.submittedAt',
    )
    expect(queueHref('all')).toBe('/admin/collections/businesses?sort=-createdAt')
    expect(listHref(null)).toBe('/admin/collections/businesses')
  })

  it('index arrays (in) and encode values', () => {
    const params = whereParams(SUBMISSION_QUEUES.find((q) => q.key === 'closed')!.where)
    expect(params).toEqual([
      ['where[or][0][and][0][submission.status][in][0]', 'rejected'],
      ['where[or][0][and][0][submission.status][in][1]', 'lapsed'],
      ['where[or][0][and][0][submission.status][in][2]', 'abandoned'],
      ['where[or][0][and][0][submission.status][in][3]', 'expired'],
    ])
    expect(listHref({ name: { equals: 'a&b' } })).toContain('=a%26b')
  })

  it('know which chip the address shows', () => {
    const toReview = SUBMISSION_QUEUES.find((q) => q.key === 'to-review')!
    const paid = SUBMISSION_QUEUES.find((q) => q.key === 'ready-to-publish')!
    const all = SUBMISSION_QUEUES.find((q) => q.key === 'all')!
    const here = Object.fromEntries(whereParams(toReview.where))
    expect(isShowing(toReview.where, here)).toBe(true)
    expect(isShowing(paid.where, here)).toBe(false)
    expect(isShowing(all.where, here)).toBe(false)
    expect(isShowing(all.where, {})).toBe(true)
    expect(isShowing(all.where, { search: 'VD-12' })).toBe(false)
    // A filter added on top (Filters panel) is no longer the chip.
    expect(isShowing(toReview.where, { ...here, 'where[or][0][and][1][issue][equals]': '3' })).toBe(
      false,
    )
  })

  it('keep a deadline filter marked after the clock moves', () => {
    const then = deadlineFilters(now)['due-soon']
    const later = deadlineFilters(new Date(now.getTime() + 60_000))['due-soon']
    expect(isShowing(later.where, Object.fromEntries(whereParams(then.where)))).toBe(true)
  })
})

describe('deadline filters', () => {
  it('cover the running deadline of each stage, within the window', () => {
    const { where } = deadlineFilters(now)['due-soon']
    const soon = new Date(now.getTime() + DEADLINE_SOON_DAYS * DAY).toISOString()
    expect(where).toEqual({
      or: [
        {
          and: [
            { 'submission.status': { equals: 'awaiting_downpayment' } },
            { 'submission.payment.downpaymentDueAt': { greater_than_equal: now.toISOString() } },
            { 'submission.payment.downpaymentDueAt': { less_than: soon } },
          ],
        },
        {
          and: [
            { 'submission.status': { equals: 'accepted' } },
            { 'submission.payment.balanceDueAt': { greater_than_equal: now.toISOString() } },
            { 'submission.payment.balanceDueAt': { less_than: soon } },
          ],
        },
      ],
    })
  })

  it('overdue is before now; the home counter is both together', () => {
    const f = deadlineFilters(now)
    expect(JSON.stringify(f.overdue.where)).not.toContain('greater_than_equal')
    expect(JSON.stringify(f.overdue.where)).toContain(now.toISOString())
    expect(JSON.stringify(f['due-within'].where)).not.toContain('greater_than_equal')
  })
})

describe('counts: one SQL statement', () => {
  it('has one column per chip and deadline filter, over listings not in the trash', () => {
    const { text, values } = countQuery('"payload"."businesses"', now)
    const keys = countedKeys(now)
    expect(keys.map((k) => k.key)).toEqual([
      'awaiting-downpayment',
      'to-review',
      'awaiting-rest',
      'ready-to-publish',
      'refunds',
      'closed',
      'incomplete',
      'all',
      'sample',
      'real',
      'due-soon',
      'overdue',
      'due-within',
    ])
    for (let i = 0; i < keys.length; i++) expect(text).toContain(` as c${i}`)
    expect(text).toMatch(/from "payload"\."businesses" where deleted_at is null$/)
    expect(text).toContain('count(*)::int as c7')
    // Values are bound, never interpolated.
    expect(text).not.toContain('pending')
    expect(text).not.toContain(now.toISOString())
    expect(values).toContain('pending')
    expect(values).toContainEqual([...CLOSED_STATUSES])
  })

  it('translates a filter into bound conditions', () => {
    const values: unknown[] = []
    const sql = whereToSql(deadlineFilters(now).overdue.where, values)
    expect(sql).toBe(
      '(("submission_status"::text = $1 and "submission_payment_downpayment_due_at" < $2::timestamptz) or ("submission_status"::text = $3 and "submission_payment_balance_due_at" < $4::timestamptz))',
    )
    expect(values).toEqual([
      'awaiting_downpayment',
      now.toISOString(),
      'accepted',
      now.toISOString(),
    ])
    const inValues: unknown[] = []
    expect(whereToSql({ 'submission.status': { in: ['a', 'b'] } }, inValues)).toBe(
      '"submission_status"::text = any($1::text[])',
    )
  })

  it('translates the boolean sample flag, equals and not_equals', () => {
    const a: unknown[] = []
    expect(whereToSql({ isSample: { equals: true } }, a)).toBe('"is_sample" = $1')
    expect(a).toEqual([true])
    const b: unknown[] = []
    expect(whereToSql({ isSample: { not_equals: true } }, b)).toBe(
      '"is_sample" is distinct from $1',
    )
    expect(b).toEqual([true])
  })

  it('refuses a path or an operator it does not know, rather than guessing', () => {
    expect(() => whereToSql({ 'submission.ownerEmail': { equals: 'x' } }, [])).toThrow(/no column/)
    expect(() => whereToSql({ 'submission.status': { like: 'x' } }, [])).toThrow(/not supported/)
  })

  it('reads the row back by key, a missing or odd value as 0', () => {
    const row = Object.fromEntries(countedKeys(now).map((_, i) => [`c${i}`, i]))
    row.c3 = 'x' as never
    delete row.c4
    const counts = countsFromRow(row, now)
    expect(counts['awaiting-downpayment']).toBe(0)
    expect(counts['to-review']).toBe(1)
    expect(counts['ready-to-publish']).toBe(0)
    expect(counts.refunds).toBe(0)
    expect(counts['due-within']).toBe(12)
  })

  it('is staff only: anyone else gets null and no query runs', async () => {
    const query = vi.fn()
    const payload = { db: { pool: { query }, schemaName: 'payload', tableNameMap: new Map() } }
    for (const user of [
      null,
      { collection: 'business-users', roles: ['admin'] },
      { collection: 'customers' },
      { collection: 'users', roles: [] },
    ]) {
      expect(await loadQueueCounts(payload as never, user, now)).toBeNull()
    }
    expect(query).not.toHaveBeenCalled()
  })

  it('runs one query for staff and returns the counts', async () => {
    const query = vi.fn(async () => ({
      rows: [Object.fromEntries(countedKeys(now).map((_, i) => [`c${i}`, i + 1]))],
    }))
    const payload = {
      db: {
        pool: { query },
        schemaName: 'payload',
        tableNameMap: new Map([['businesses', 'businesses']]),
      },
    }
    const counts = await loadQueueCounts(
      payload as never,
      { collection: 'users', roles: ['staff'] },
      now,
    )
    expect(query).toHaveBeenCalledTimes(1)
    expect(counts?.['awaiting-downpayment']).toBe(1)
    expect(counts?.all).toBe(8)
  })
})

describe('list cells', () => {
  it('have a short label for every status and stage', () => {
    for (const s of STATUSES) expect(STATUS_LABELS[s]).toBeTruthy()
    for (const s of STAGES) expect(STAGE_LABELS[s]).toBeTruthy()
  })

  it('show the deadline that is running: downpayment while awaited, the rest once accepted', () => {
    const payment = {
      downpaymentDueAt: '2026-11-30T10:00:00.000Z',
      balanceDueAt: '2026-12-24T10:00:00.000Z',
    }
    expect(nextDeadline({ status: 'awaiting_downpayment', payment })).toEqual({
      which: 'downpayment',
      at: new Date(payment.downpaymentDueAt),
    })
    expect(nextDeadline({ status: 'accepted', payment })?.which).toBe('balance')
    for (const status of ['pending', 'paid', 'approved', 'rejected', 'lapsed', null]) {
      expect(nextDeadline({ status, payment })).toBeNull()
    }
    expect(nextDeadline({ status: 'accepted', payment: { balanceDueAt: null } })).toBeNull()
    expect(nextDeadline({ status: 'accepted', payment: { balanceDueAt: 'nonsense' } })).toBeNull()
    expect(nextDeadline(null)).toBeNull()
  })

  it('count days left, warn within the window, and mark overdue', () => {
    const at = (ms: number) => new Date(now.getTime() + ms)
    expect(deadlineText(at(10 * DAY), now)).toEqual({ text: '10 days left', tone: 'plain' })
    expect(deadlineText(at(3 * DAY), now)).toEqual({ text: '3 days left', tone: 'warn' })
    expect(deadlineText(at(DAY + 1), now)).toEqual({ text: '1 day left', tone: 'warn' })
    expect(deadlineText(at(3_600_000), now)).toEqual({ text: 'Under a day left', tone: 'warn' })
    expect(deadlineText(at(0), now)).toEqual({ text: 'Overdue', tone: 'bad' })
    expect(deadlineText(at(-2 * DAY - 5), now)).toEqual({ text: 'Overdue 2 days', tone: 'bad' })
  })
})

describe('the Listings list', () => {
  it('has no base filter and no collection sort (that would order the public directory too)', () => {
    const admin = Businesses.admin as Record<string, unknown>
    expect(admin.baseListFilter).toBeUndefined()
    expect((Businesses as unknown as Record<string, unknown>).defaultSort).toBeUndefined()
    expect(Businesses.admin?.components?.beforeListTable).toEqual([
      '/components/admin/SubmissionQueues#SubmissionQueues',
    ])
  })

  it('shows the PRD columns by default, each a real field or list column', () => {
    expect(Businesses.admin?.defaultColumns).toEqual(LIST_DEFAULT_COLUMNS)
    const top = new Set<string>()
    const walk = (fields: Loose[] & { tabs?: unknown }[]) => {
      for (const f of fields as (Loose & { tabs?: { name?: string; fields: Loose[] }[] })[]) {
        if (f.name) top.add(f.name)
        if (f.tabs) for (const t of f.tabs) if (!t.name) walk(t.fields as never)
        if (!f.name && f.fields) walk(f.fields as never)
      }
    }
    walk(Businesses.fields as never)
    for (const c of LIST_DEFAULT_COLUMNS) expect(top).toContain(c)
  })

  it('list columns store nothing and have a cell each', () => {
    for (const c of LIST_COLUMNS) {
      expect(c.type).toBe('ui')
      expect(c.admin?.components?.Cell).toMatch(/^\/components\/admin\/SubmissionCells#\w+Cell$/)
    }
  })
})
