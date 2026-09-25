import type {
  Access,
  CollectionAfterChangeHook,
  CollectionBeforeChangeHook,
  CollectionConfig,
  Where,
} from 'payload'
import { APIError } from 'payload'
import {
  DISPUTE_OUTCOMES,
  FEE_UNITS,
  STATEMENT_STATUSES,
  isPeriod,
  statementDeadlines,
  statementNumber,
  statementTotals,
  type StatementLineAmount,
} from '@vardenia/core'
import { isAdmin, isStaff, isStaffFieldLevel, ownedBusinessIds } from '../access/index'
import { sendStatementEmail } from '../lib/statement-email'
import { reportError } from '../lib/report'

/**
 * A venue's monthly booking-fee statement, which is also its invoice.
 *
 * One per venue per month, drawn up by staff from Booking fees in the admin on the 8th,
 * once every booking of the month has had its seven days to be marked. It
 * starts as a draft nobody outside the team can see. Sending it - setting the
 * status to `sent`, on the statement or from Booking fees - stamps the two deadlines
 * and emails the venue. See packages/core/src/booking-fees for the rules.
 *
 * # Who sees what
 *
 * - staff  : everything, drafts included, and the internal notes.
 * - owner  : the sent and paid statements of the businesses they manage. Never a
 *            draft: a draft is our working copy, and a venue reading figures we
 *            have not checked yet is a conversation nobody planned to have.
 *
 * Owners cannot write here at all. Questioning a line goes through /billing/
 * dispute, which checks the window and touches only that line.
 */

export const readStatements: Access = ({ req }) => {
  const { user } = req
  if (!user) return false
  if (user.collection === 'users') return isStaff({ req } as Parameters<Access>[0])
  if (user.collection === 'business-users') {
    const owned = ownedBusinessIds(user)
    if (owned.length === 0) return false
    const where: Where = {
      and: [{ business: { in: owned } }, { status: { in: ['sent', 'paid'] } }],
    }
    return where
  }
  return false
}

interface StatementData {
  number?: string | null
  business?: unknown
  period?: string | null
  status?: string | null
  lines?: StatementLineAmount[] | null
  vatRate?: number | null
  sentAt?: string | null
  paidAt?: string | null
}

/** The next "VRD-2026-0007" for this year: the highest so far, plus one. */
async function nextNumber(req: Parameters<CollectionBeforeChangeHook>[0]['req']) {
  const year = new Date().getUTCFullYear()
  const latest = await req.payload.find({
    collection: 'statements',
    where: { number: { like: `VRD-${year}-` } },
    sort: '-number',
    limit: 1,
    depth: 0,
    overrideAccess: true,
    req,
  })
  const last = String((latest.docs[0] as { number?: string } | undefined)?.number ?? '')
  const sequence = Number(last.split('-')[2] ?? 0) || 0
  return statementNumber(year, sequence + 1)
}

const idOf = (value: unknown): string | number | null => {
  if (typeof value === 'string' || typeof value === 'number') return value
  const id = (value as { id?: unknown } | null)?.id
  return typeof id === 'string' || typeof id === 'number' ? id : null
}

/**
 * Numbers, totals and deadlines, all derived rather than typed.
 *
 * The totals are recomputed on every save, so settling a dispute in the admin
 * changes what the venue owes without anybody doing the arithmetic. The
 * deadlines are stamped once, the first time the statement is sent: re-saving a
 * sent statement must not move a venue's due date.
 */
const deriveFields: CollectionBeforeChangeHook = async ({ data, originalDoc, operation, req }) => {
  const next = data as StatementData
  const before = (originalDoc ?? {}) as StatementData

  if (operation === 'create') {
    if (!isPeriod(next.period)) {
      throw new APIError('The period must be a month, written like 2026-10.', 400)
    }

    // One statement per venue per month. A void one does not count, so a
    // statement drawn up wrongly can be voided and drawn up again.
    const businessId = idOf(next.business)
    const existing = await req.payload.find({
      collection: 'statements',
      where: {
        and: [
          { business: { equals: businessId } },
          { period: { equals: next.period } },
          { status: { not_equals: 'void' } },
        ],
      },
      limit: 1,
      depth: 0,
      overrideAccess: true,
      req,
    })
    if (existing.totalDocs > 0) {
      throw new APIError('This venue already has a statement for that month.', 400)
    }

    if (!next.number) next.number = await nextNumber(req)
  }

  const lines = next.lines ?? before.lines ?? []
  const totals = statementTotals(lines, Number(next.vatRate ?? before.vatRate ?? 0))
  Object.assign(next, totals)

  const status = next.status ?? before.status
  if (status === 'sent' && !before.sentAt && !next.sentAt) {
    const sentAt = new Date()
    const { disputeUntil, dueAt } = statementDeadlines(sentAt)
    Object.assign(next, {
      sentAt: sentAt.toISOString(),
      disputeUntil: disputeUntil.toISOString(),
      dueAt: dueAt.toISOString(),
    })
  }
  if (status === 'paid' && !before.paidAt && !next.paidAt) {
    next.paidAt = new Date().toISOString()
  }

  return next
}

/** Emails the venue the first time a statement is sent. Never throws. */
const emailWhenSent: CollectionAfterChangeHook = async ({ doc, previousDoc, req, context }) => {
  const was = (previousDoc as StatementData | undefined)?.status
  const now = (doc as StatementData).status
  if (now !== 'sent' || was === 'sent' || context?.skipStatementEmail === true) return doc

  await sendStatementEmail(req.payload, doc as never).catch(async (error) => {
    await reportError(error, { source: 'billing.statement-email', extra: { statement: doc.id } })
  })
  return doc
}

export const Statements: CollectionConfig = {
  slug: 'statements',
  labels: { singular: 'Fee statement', plural: 'Fee statements' },

  admin: {
    // Can be grouped by listing in the list view (Group by, then Business), so
    // each listing's entries sit together. See the links on the admin home.
    groupBy: true,
    useAsTitle: 'number',
    defaultColumns: ['number', 'business', 'period', 'total', 'status', 'dueAt'],
    group: 'Bookings',
    listSearchableFields: ['number', 'period'],
    description:
      'Monthly booking-fee statements. Draw them up and send them from Booking fees in the menu; settle disputes and record payments here.',
  },

  access: {
    read: readStatements,
    create: isStaff,
    update: isStaff,
    // A sent invoice is a record. Void it instead; deleting is for mistakes
    // caught before anything left the building.
    delete: isAdmin,
  },

  hooks: {
    beforeChange: [deriveFields],
    afterChange: [emailWhenSent],
  },

  fields: [
    {
      name: 'number',
      type: 'text',
      unique: true,
      index: true,
      admin: { readOnly: true, description: 'Given automatically. Never edited.' },
    },
    {
      name: 'business',
      type: 'relationship',
      relationTo: 'businesses',
      required: true,
      index: true,
    },
    {
      name: 'period',
      type: 'text',
      required: true,
      index: true,
      admin: { description: 'The month billed, like 2026-10.' },
    },
    {
      name: 'status',
      type: 'select',
      required: true,
      index: true,
      defaultValue: 'draft',
      options: STATEMENT_STATUSES.map((status) => ({
        label: status.charAt(0).toUpperCase() + status.slice(1),
        value: status,
      })),
      admin: {
        position: 'sidebar',
        description:
          'Draft: only the team sees it. Sent: emailed to the venue, deadlines start. Paid: settled. Void: cancelled.',
      },
    },
    {
      name: 'lines',
      type: 'array',
      labels: { singular: 'Line', plural: 'Lines' },
      admin: {
        // The date, reference, fee and dispute state as each line's title.
        components: { RowLabel: '/components/admin/StatementLineLabel#StatementLineLabel' },
      },
      fields: [
        {
          type: 'row',
          fields: [
            {
              name: 'booking',
              type: 'relationship',
              relationTo: 'bookings',
              admin: { width: '30%' },
            },
            { name: 'reference', type: 'text', admin: { width: '20%' } },
            { name: 'day', type: 'text', admin: { width: '20%', description: 'YYYY-MM-DD' } },
            {
              name: 'unit',
              type: 'select',
              options: FEE_UNITS.map((unit) => ({ label: unit, value: unit })),
              admin: { width: '30%', isClearable: false },
            },
          ],
        },
        {
          type: 'row',
          fields: [
            { name: 'quantity', type: 'number', min: 0, admin: { width: '33%' } },
            { name: 'rate', type: 'number', min: 0, admin: { width: '33%' } },
            { name: 'amount', type: 'number', min: 0, admin: { width: '34%' } },
          ],
        },
        {
          type: 'row',
          fields: [
            {
              name: 'disputeOutcome',
              type: 'select',
              defaultValue: 'none',
              options: DISPUTE_OUTCOMES.map((outcome) => ({ label: outcome, value: outcome })),
              admin: {
                // Cleared, a line reads as never questioned. Pick an outcome instead.
                isClearable: false,
                width: '30%',
                description: 'Upheld takes the line off the total. Rejected keeps it.',
              },
            },
            { name: 'disputeReason', type: 'text', maxLength: 300, admin: { width: '50%' } },
            { name: 'disputedAt', type: 'date', admin: { width: '20%', readOnly: true } },
          ],
        },
      ],
    },
    {
      type: 'row',
      fields: [
        {
          name: 'vatRate',
          type: 'number',
          min: 0,
          defaultValue: 0,
          admin: { width: '25%', description: 'Percent. 0 until VAT registration.' },
        },
        { name: 'subtotal', type: 'number', admin: { width: '25%', readOnly: true } },
        { name: 'vat', type: 'number', admin: { width: '25%', readOnly: true } },
        { name: 'total', type: 'number', admin: { width: '25%', readOnly: true } },
      ],
    },
    {
      type: 'row',
      fields: [
        { name: 'sentAt', type: 'date', admin: { width: '33%', readOnly: true } },
        {
          name: 'disputeUntil',
          type: 'date',
          admin: { width: '33%', readOnly: true, description: 'Last moment to question a line.' },
        },
        { name: 'dueAt', type: 'date', index: true, admin: { width: '34%', readOnly: true } },
      ],
    },
    {
      type: 'row',
      fields: [
        { name: 'paidAt', type: 'date', admin: { width: '33%' } },
        {
          name: 'paymentMethod',
          type: 'select',
          options: [
            { label: 'Whish', value: 'whish' },
            { label: 'Bank transfer', value: 'bank' },
            { label: 'Card (Areeba)', value: 'card' },
            { label: 'Cash', value: 'cash' },
          ],
          admin: { width: '33%' },
        },
        { name: 'paymentReference', type: 'text', admin: { width: '34%' } },
      ],
    },
    {
      name: 'internalNotes',
      type: 'textarea',
      access: { read: isStaffFieldLevel, update: isStaffFieldLevel },
      admin: { description: 'Not visible to the venue.' },
    },
  ],
}
