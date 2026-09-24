import { headers as nextHeaders } from 'next/headers'
import { getPayload } from 'payload'
import {
  canDispute,
  statementState,
  type DisputeOutcome,
  type FeeUnit,
  type StatementState,
  type StatementStatus,
} from '@vardenia/core'
import config from '../payload.config'
import { BUSINESS_USER_COLLECTION } from '../access/index'

/**
 * A partner's own statements, for the dashboard.
 *
 * Read as the signed-in owner with access enforced, so the collection's rule is
 * the boundary: the businesses they manage, never a draft. Nothing here widens
 * that. The state and whether each line can still be questioned are worked out
 * here, on one clock, rather than in the page.
 */

export interface OwnerStatementLine {
  id: string
  day: string
  reference: string
  unit: FeeUnit
  quantity: number
  rate: number
  amount: number
  disputeOutcome: DisputeOutcome
  /** What the venue wrote when it questioned the line, shown back to it. */
  disputeReason: string
  canDispute: boolean
}

export interface OwnerStatement {
  id: number
  number: string
  period: string
  venue: string
  state: StatementState
  subtotal: number
  vatRate: number
  vat: number
  total: number
  dueAt: string | null
  disputeUntil: string | null
  lines: OwnerStatementLine[]
}

interface Doc {
  id: number
  number?: string | null
  period?: string | null
  status: StatementStatus
  business?: { name?: string | null } | number | null
  subtotal?: number | null
  vatRate?: number | null
  vat?: number | null
  total?: number | null
  dueAt?: string | null
  disputeUntil?: string | null
  lines?:
    | {
        id?: string | null
        day?: string | null
        reference?: string | null
        unit?: FeeUnit | null
        quantity?: number | null
        rate?: number | null
        amount?: number | null
        disputeOutcome?: DisputeOutcome | null
        disputeReason?: string | null
      }[]
    | null
}

function shape(doc: Doc, now: Date): OwnerStatement {
  return {
    id: doc.id,
    number: doc.number ?? '',
    period: doc.period ?? '',
    venue: typeof doc.business === 'object' && doc.business ? (doc.business.name ?? '') : '',
    state: statementState(doc, now),
    subtotal: Number(doc.subtotal ?? 0),
    vatRate: Number(doc.vatRate ?? 0),
    vat: Number(doc.vat ?? 0),
    total: Number(doc.total ?? 0),
    dueAt: doc.dueAt ?? null,
    disputeUntil: doc.disputeUntil ?? null,
    lines: (doc.lines ?? []).map((line) => ({
      id: line.id ?? '',
      day: line.day ?? '',
      reference: line.reference ?? '',
      unit: line.unit ?? 'booking',
      quantity: Number(line.quantity ?? 0),
      rate: Number(line.rate ?? 0),
      amount: Number(line.amount ?? 0),
      disputeOutcome: line.disputeOutcome ?? 'none',
      disputeReason: line.disputeReason ?? '',
      canDispute: canDispute(doc, line, now),
    })),
  }
}

async function ownerUser() {
  const payload = await getPayload({ config })
  const auth = await payload
    .auth({ headers: await nextHeaders() })
    .catch(() => ({ user: null }) as { user: null })
  const user = auth.user
  if (!user || user.collection !== BUSINESS_USER_COLLECTION) return null
  return { payload, user }
}

export async function ownerStatements(): Promise<OwnerStatement[]> {
  const session = await ownerUser()
  if (!session) return []

  const result = await session.payload.find({
    collection: 'statements',
    depth: 1,
    limit: 60,
    sort: '-period',
    overrideAccess: false,
    user: session.user,
  })
  const now = new Date()
  return (result.docs as unknown as Doc[]).map((doc) => shape(doc, now))
}

export async function ownerStatement(id: number): Promise<OwnerStatement | null> {
  if (!Number.isInteger(id)) return null
  const session = await ownerUser()
  if (!session) return null

  // findByID with access enforced throws on a statement the owner may not read,
  // which is the same answer as one that does not exist.
  const doc = await session.payload
    .findByID({ collection: 'statements', id, depth: 1, overrideAccess: false, user: session.user })
    .catch(() => null)
  return doc ? shape(doc as unknown as Doc, new Date()) : null
}
