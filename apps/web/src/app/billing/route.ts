import type { NextRequest } from 'next/server'
import { getPayload } from 'payload'
import { previousPeriod, isPeriod, statementReadyOn, statementState } from '@vardenia/core'
import config from '../../payload.config'
import { beirutDate } from '../../lib/beirut'
import { findEvery } from '../../lib/find-every'
import { billingPage, isStaffRequest } from '../../lib/billing-page'

/**
 * The staff page for a month of booking-fee statements.
 *
 *   /billing              last month
 *   /billing?period=2026-10
 *
 * Two buttons and a list: draw up the drafts, send them, and see where every
 * statement of the month stands. Reading and editing a single statement - a
 * dispute to settle, a payment to record - happens in the admin, where the
 * Statements collection lives. See lib/statements for what drawing up does.
 */

export const dynamic = 'force-dynamic'

interface Row {
  id: number
  number?: string | null
  period?: string | null
  status: 'draft' | 'sent' | 'paid' | 'void'
  total?: number | null
  dueAt?: string | null
  business?: { name?: string | null } | number | null
  lines?: { disputeOutcome?: string | null }[] | null
}

export async function GET(request: NextRequest) {
  const payload = await getPayload({ config })
  if (!(await isStaffRequest(payload, request.headers))) {
    return new Response('Staff only. Sign in to the admin panel first.', { status: 403 })
  }

  const url = new URL(request.url)
  const today = beirutDate()
  const asked = url.searchParams.get('period')
  const period = isPeriod(asked) ? asked : previousPeriod(today)

  const statements = await findEvery<Row>(payload, {
    collection: 'statements',
    where: { period: { equals: period } },
    depth: 1,
    overrideAccess: true,
    sort: 'number',
  })

  const now = new Date()
  const rows = statements.docs.map((doc) => ({
    id: doc.id,
    number: doc.number ?? '',
    venue: typeof doc.business === 'object' && doc.business ? (doc.business.name ?? '') : '',
    total: Number(doc.total ?? 0),
    state: statementState({ status: doc.status, dueAt: doc.dueAt }, now),
    openDisputes: (doc.lines ?? []).filter((line) => line.disputeOutcome === 'open').length,
  }))

  return new Response(
    billingPage({
      period,
      readyOn: statementReadyOn(period),
      ready: today >= statementReadyOn(period),
      rows,
      message: url.searchParams.get('message'),
    }),
    { headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' } },
  )
}
