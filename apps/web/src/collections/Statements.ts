import type {
  Access,
  CollectionAfterChangeHook,
  CollectionBeforeChangeHook,
  CollectionConfig,
  Where,
} from 'payload'
import { APIError } from 'payload'
import { sql } from '@payloadcms/db-postgres'
import {
  DISPUTE_OUTCOMES,
  FEE_UNITS,
  STATEMENT_STATUSES,
  canDispute,
  isPeriod,
  statementDeadlines,
  statementNumber,
  statementTotals,
  type StatementLineAmount,
} from '@vardenia/core'
import {
  fixedOnceCreated,
  isAdmin,
  isStaff,
  isStaffFieldLevel,
  ownedBusinessIds,
} from '../access/index'
import { sendStatementEmail } from '../lib/statement-email'
import { reportError } from '../lib/report'
import { transactionDb } from '../lib/transaction-db'
import { STATEMENT_MOVES } from '../lib/statement-moves'

// Re-exported for the tests and anything that imported it from here.
export { STATEMENT_MOVES }

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

/**
 * The statements a venue partner may see: sent and paid. A draft is not
 * finished and a void one was withdrawn, so neither is theirs to read - in
 * the dashboard, through the API, or as a printable invoice. One list, so the
 * invoice route and this rule cannot disagree again.
 */
export const OWNER_VISIBLE_STATUSES: readonly string[] = ['sent', 'paid']

export const readStatements: Access = ({ req }) => {
  const { user } = req
  if (!user) return false
  if (user.collection === 'users') return isStaff({ req } as Parameters<Access>[0])
  if (user.collection === 'business-users') {
    const owned = ownedBusinessIds(user)
    if (owned.length === 0) return false
    const where: Where = {
      and: [{ business: { in: owned } }, { status: { in: [...OWNER_VISIBLE_STATUSES] } }],
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

/** Any fixed number, so the lock below means "creating a statement" and nothing else. */
const NUMBER_LOCK = 4_820_001

/**
 * One statement is created at a time, until each one commits.
 *
 * Taken before the one-per-month check as well as before numbering. The check
 * is a read followed by a write, which two draw-ups at once both passed; the
 * database's partial index catches that in production, but only where the
 * migration that made it has run, and on the development database, which is
 * synced without migrations, it went straight through. Serialised, the second
 * save reads the first one's statement and is refused in words. Statements are
 * created a few hundred times a month, so the wait costs nothing.
 *
 * Taking it twice in one transaction is fine: Postgres counts it, and both are
 * released at commit.
 */
async function lockStatementCreation(req: Parameters<CollectionBeforeChangeHook>[0]['req']) {
  const db = await transactionDb(req)
  if (db) await db.execute(sql`SELECT pg_advisory_xact_lock(${NUMBER_LOCK}, 0)`)
}

/**
 * The next "VRD-2026-0007" for this year: the highest so far, plus one.
 *
 * # Under a lock, because "highest plus one" is a race on its own
 *
 * Two statements created at the same moment - two staff drawing up, or a
 * draw-up and a statement made by hand - both read 0006 and both chose 0007.
 * The unique index refused the second, and the draw-up then reported that
 * venue as "already drawn up" when it had never been drawn up at all.
 *
 * The creation lock (below) is held by this save's transaction until it
 * commits. A second numbering waits for it, and by the time it reads, the
 * first statement and its number are committed. Numbers stay consecutive, with no gaps from a
 * sequence handing out numbers to saves that later fail.
 */
async function nextNumber(req: Parameters<CollectionBeforeChangeHook>[0]['req']) {
  const year = new Date().getUTCFullYear()
  await lockStatementCreation(req)
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

/** What each outcome means for the money, in the words staff choose by. */
const OUTCOME_LABELS: Record<(typeof DISPUTE_OUTCOMES)[number], string> = {
  none: 'Not questioned',
  open: 'Questioned: waiting for a decision',
  upheld: 'Removed from the bill',
  rejected: 'Kept on the bill',
}

/** The payment fields, once a payment is recorded (or being recorded). */
const isPaid = (data: { status?: string } | undefined) => data?.status === 'paid'

/** Dispute fields only on a line the venue questioned; elsewhere they are noise. */
const wasQuestioned = (_: unknown, siblingData: { disputeOutcome?: string | null } | undefined) =>
  Boolean(siblingData?.disputeOutcome && siblingData.disputeOutcome !== 'none')

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
interface LineData {
  id?: string | null
  booking?: unknown
  reference?: string | null
  day?: string | null
  unit?: string | null
  quantity?: number | null
  rate?: number | null
  amount?: number | null
  disputeOutcome?: string | null
  disputeReason?: string | null
  disputedAt?: string | null
}

/**
 * A partner's dispute, applied to the lines as they stand in this write.
 *
 * The dispute route used to read the statement, change one line, and write the
 * whole array back. Staff settling another line in between had their decision
 * overwritten by that stale copy. The route now sends only which line and why,
 * as `context.openDispute`, and the line is opened here against the document
 * Payload has just read for this update - and refused if it can no longer be
 * disputed by then.
 */
function applyDispute(next: StatementData, before: StatementData, request: unknown): void {
  const dispute = request as { line?: unknown; reason?: unknown } | undefined
  if (!dispute || typeof dispute.line !== 'string' || typeof dispute.reason !== 'string') return

  const current = (before.lines ?? []) as LineData[]
  const target = current.find((line) => line.id === dispute.line)
  const statement = before as { status: never; disputeUntil?: string | null }
  if (!target || !canDispute(statement, target as never, new Date())) {
    throw new APIError('This line can no longer be disputed.', 409)
  }

  next.lines = current.map((line) =>
    line.id === dispute.line
      ? {
          ...line,
          disputeOutcome: 'open',
          disputeReason: dispute.reason as string,
          disputedAt: new Date().toISOString(),
        }
      : line,
  ) as never
}

/**
 * The statement as it stands in the database now, with its row locked until
 * this save commits.
 *
 * # Why the copy Payload hands the hook is not enough
 *
 * Payload reads `originalDoc` at the start of an update, unlocked, and writes
 * the whole `lines` array back at the end. Two saves at once - a venue
 * questioning one line while another of its people questions a second, or
 * staff settling a line while a venue questions another - each started from the
 * same copy, and whichever wrote last erased the other's change. A question
 * could simply disappear.
 *
 * `FOR UPDATE` makes the second save wait for the first to commit, and the
 * read after it, on the same transaction, sees what the first one wrote. Null
 * when it cannot be asked, and the save goes ahead on Payload's copy as before.
 */
async function lockedStatement(
  req: Parameters<CollectionBeforeChangeHook>[0]['req'],
  id: unknown,
): Promise<StatementData | null> {
  const statementId = Number(id)
  const db = await transactionDb(req)
  if (!db || !Number.isInteger(statementId)) return null

  await db.execute(
    sql`SELECT "id" FROM "payload"."statements" WHERE "id" = ${statementId} FOR UPDATE`,
  )
  return (await req.payload
    .findByID({ collection: 'statements', id: statementId, depth: 0, overrideAccess: true, req })
    .catch(() => null)) as StatementData | null
}

/**
 * Keeps a question the venue asked after this form was opened.
 *
 * Staff save the whole form, every line included, from a copy loaded minutes
 * ago. A line the venue questioned since then is "not questioned" in that copy,
 * and saving it would close the question unanswered. The venue's half of a
 * dispute - the reason and when it was asked - only ever comes from the venue,
 * so it is always taken from the database. The decision is staff's, but only
 * on a question they could see: if the form never showed this question, the
 * line keeps it open.
 */
export function keepVenueQuestions(lines: LineData[], stored: LineData[]): LineData[] {
  const byId = new Map(stored.filter((line) => line.id).map((line) => [line.id, line]))
  return lines.map((line) => {
    const saved = line.id ? byId.get(line.id) : undefined
    if (!saved?.disputedAt) return line
    const sawQuestion = sameInstant(line.disputedAt, saved.disputedAt)
    return {
      ...line,
      disputeReason: saved.disputeReason ?? null,
      disputedAt: saved.disputedAt,
      disputeOutcome: sawQuestion ? line.disputeOutcome : saved.disputeOutcome,
    }
  })
}

/** What a line bills for. Fixed once the statement is issued; see below. */
const LOCKED_LINE_FIELDS = ['reference', 'day', 'unit', 'quantity', 'rate', 'amount'] as const

const sameInstant = (a: unknown, b: unknown) =>
  (a ?? null) === (b ?? null) ||
  (a != null && b != null && new Date(String(a)).getTime() === new Date(String(b)).getTime())

/**
 * Once a statement has left draft, what it bills and its deadlines are fixed.
 *
 * A sent statement is an invoice a venue holds. Through the API a staff account
 * could still change a line's quantity, rate or amount, or move the dates the
 * venue's dispute window and payment deadline are counted from - silently
 * rewriting a document the venue has already been sent. Disputes are settled
 * through each line's outcome, and payment through its own fields; both stay
 * open. A statement drawn up wrongly is voided and drawn up again.
 */
function assertIssuedUnchanged(before: StatementData, next: StatementData): void {
  const was = (before.lines ?? []) as LineData[]
  const now = (next.lines ?? before.lines ?? []) as LineData[]

  const changedLines =
    was.length !== now.length ||
    now.some((line, i) => {
      const old = was[i]
      if (!old || old.id !== line.id) return true
      if (String(idOf(old.booking)) !== String(idOf(line.booking))) return true
      return LOCKED_LINE_FIELDS.some((field) => (old[field] ?? null) !== (line[field] ?? null))
    })

  const dates = ['sentAt', 'disputeUntil', 'dueAt'] as const
  const record = (doc: StatementData) => doc as Record<string, unknown>
  // Only a value that is actually given counts as a change. An admin save that
  // leaves the hidden date fields empty is not moving them - and deriveFields
  // never clears them - so it must not be refused for it.
  const changedDates = dates.some((field) => {
    const given = record(next)[field]
    return given != null && !sameInstant(record(before)[field], given)
  })

  if (changedLines || changedDates) {
    throw new APIError(
      'An issued statement keeps its lines and dates. Settle a line through its dispute outcome, or set the statement to Void and draw the month up again.',
      400,
    )
  }
}

const deriveFields: CollectionBeforeChangeHook = async ({
  data,
  originalDoc,
  operation,
  req,
  context,
}) => {
  const next = data as StatementData
  let before = (originalDoc ?? {}) as StatementData

  if (operation === 'create') {
    if (!isPeriod(next.period)) {
      throw new APIError('The period must be a month, written like 2026-10.', 400)
    }

    // One statement per venue per month. A void one does not count, so a
    // statement drawn up wrongly can be voided and drawn up again. Under the
    // creation lock, so two at once cannot both pass. See lockStatementCreation.
    await lockStatementCreation(req)
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

  // On update, everything below is checked against the statement as it stands
  // now, locked, rather than the copy read at the start. See lockedStatement.
  if (operation === 'update') {
    const stored = await lockedStatement(req, (originalDoc as { id?: unknown } | undefined)?.id)
    if (stored) {
      // A new object: Payload's own copy is left as it read it.
      before = { ...before, ...stored }
      if (next.lines)
        next.lines = keepVenueQuestions(
          next.lines as LineData[],
          (stored.lines ?? []) as LineData[],
        ) as never
    }
  }

  if (operation === 'update' && before.status && next.status && next.status !== before.status) {
    if (!(STATEMENT_MOVES[before.status] ?? []).includes(next.status)) {
      throw new APIError(
        before.status === 'void'
          ? 'A void statement stays void. Draw the month up again from Booking fees.'
          : `A ${before.status} statement cannot go back to ${next.status}. Set it to Void and draw the month up again instead.`,
        400,
      )
    }
  }

  if (operation === 'update') {
    applyDispute(next, before, context?.openDispute)
    if (before.status && before.status !== 'draft') assertIssuedUnchanged(before, next)
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
    // Opens on one folder per listing; a folder is the normal list, filtered
    // to that listing. See components/admin/FolderListView.
    components: {
      views: { list: { Component: '/components/admin/FolderListView#FolderListView' } },
    },
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
      admin: { readOnly: true, position: 'sidebar', description: 'Given automatically.' },
    },
    {
      name: 'business',
      label: 'Listing',
      type: 'relationship',
      relationTo: 'businesses',
      required: true,
      index: true,
      // Its lines are that venue's bookings for that month. Moving either would
      // bill someone for somebody else's guests.
      access: { update: fixedOnceCreated },
      admin: { position: 'sidebar' },
    },
    {
      name: 'period',
      type: 'text',
      required: true,
      index: true,
      access: { update: fixedOnceCreated },
      admin: { position: 'sidebar', description: 'The month billed.' },
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
        isClearable: false,
        description: 'Change it with the buttons at the top, then Save.',
      },
    },
    {
      /**
       * Status, total and dates in words, with only the next moves allowed.
       * Nothing stored. See components/admin/StatementSummary.
       */
      name: 'summary',
      type: 'ui',
      admin: { components: { Field: '/components/admin/StatementSummary#StatementSummary' } },
    },
    {
      type: 'row',
      fields: [
        // Under the summary, where Record payment points. Only once it is paid: before then they are three empty boxes asking
        // about a payment that has not happened.
        {
          name: 'paidAt',
          label: 'Paid on',
          type: 'date',
          admin: { width: '33%', condition: isPaid, description: 'Today if left empty.' },
        },
        {
          name: 'paymentMethod',
          label: 'Paid by',
          type: 'select',
          options: [
            { label: 'Whish', value: 'whish' },
            { label: 'Bank transfer', value: 'bank' },
            { label: 'Card (Areeba)', value: 'card' },
            { label: 'Cash', value: 'cash' },
          ],
          admin: { width: '33%', condition: isPaid },
        },
        {
          name: 'paymentReference',
          type: 'text',
          admin: {
            width: '34%',
            condition: isPaid,
            description: 'The transfer or receipt number.',
          },
        },
      ],
    },
    {
      /**
       * The lines a venue questioned, each with its reason and a keep or remove
       * choice, above the lines themselves. See components/admin/StatementDisputes.
       * Nothing stored: the buttons set each line's disputeOutcome below.
       */
      name: 'disputes',
      type: 'ui',
      admin: {
        components: { Field: '/components/admin/StatementDisputes#StatementDisputes' },
      },
    },
    {
      name: 'lines',
      type: 'array',
      labels: { singular: 'Line', plural: 'Lines' },
      admin: {
        // A read-only table instead of Payload's cards of inputs. Every line is
        // copied from a booking when the statement is drawn up; editing one by
        // hand could point it at another booking while its reference still
        // named the first. Disputes are answered in the box above. See
        // components/admin/StatementLines.
        components: { Field: '/components/admin/StatementLines#StatementLines' },
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
              label: 'Decision',
              type: 'select',
              defaultValue: 'none',
              options: DISPUTE_OUTCOMES.map((outcome) => ({
                label: OUTCOME_LABELS[outcome],
                value: outcome,
              })),
              admin: {
                // Cleared, a line reads as never questioned. Pick an outcome instead.
                isClearable: false,
                width: '30%',
                condition: wasQuestioned,
              },
            },
            {
              name: 'disputeReason',
              label: "Venue's reason",
              type: 'text',
              maxLength: 300,
              // The venue's own words, written through /billing/dispute.
              admin: { width: '50%', readOnly: true, condition: wasQuestioned },
            },
            {
              name: 'disputedAt',
              label: 'Questioned on',
              type: 'date',
              admin: { width: '20%', readOnly: true, condition: wasQuestioned },
            },
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
          // Only while a draft. Once sent, the venue has been told the total.
          access: { update: ({ doc }) => !doc || doc.status === 'draft' },
          label: 'VAT rate (%)',
          admin: {
            width: '50%',
            description: '0 until VAT registration. Can change only while a draft.',
          },
        },
        // Worked out on save and shown in the summary at the top, in dollars.
        { name: 'subtotal', type: 'number', admin: { readOnly: true, hidden: true } },
        { name: 'vat', type: 'number', admin: { readOnly: true, hidden: true } },
        {
          name: 'total',
          type: 'number',
          admin: {
            readOnly: true,
            hidden: true,
            components: { Cell: '/components/admin/ListCells#MoneyCell' },
          },
        },
      ],
    },
    {
      type: 'row',
      fields: [
        // Set when it is sent, and shown in the summary as dates.
        { name: 'sentAt', type: 'date', admin: { readOnly: true, hidden: true } },
        { name: 'disputeUntil', type: 'date', admin: { readOnly: true, hidden: true } },
        {
          name: 'dueAt',
          label: 'Due',
          type: 'date',
          index: true,
          admin: { readOnly: true, hidden: true, date: { displayFormat: 'd MMM yyyy' } },
        },
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
