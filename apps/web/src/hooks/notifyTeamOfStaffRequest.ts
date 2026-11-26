import type { CollectionAfterChangeHook } from 'payload'
import { reportError } from '../lib/report'

/**
 * Tells the Vardenia team a guest has asked for event staff (18 November 2026).
 *
 * Sent to every team member with the admin or staff role, the people who can
 * open the request in the admin, so no address has to be configured. Plain
 * text, read on a phone. Never fails the request: a lost email is recoverable
 * from the admin list, a lost request is not. A failed send is reported.
 */
export const notifyTeamOfStaffRequest: CollectionAfterChangeHook = async ({
  doc,
  operation,
  req,
}) => {
  if (operation !== 'create') return doc
  try {
    const team = await req.payload.find({
      collection: 'users',
      depth: 0,
      limit: 50,
      overrideAccess: true,
      where: { roles: { in: ['admin', 'staff'] } },
      select: { email: true },
    })
    const to = team.docs
      .map((user) => String((user as { email?: unknown }).email ?? ''))
      .filter((email) => email.includes('@'))
    if (to.length === 0) return doc

    const site = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, '')
    const link = site ? `${site}/admin/collections/staff-requests/${doc.id}` : ''
    const role = doc.role === 'waiters' ? 'Waiters' : 'Hostesses'
    const text = [
      `A guest asked for ${role.toLowerCase()} on Vardenia.`,
      '',
      `Reference: ${doc.reference}`,
      `Name: ${doc.name}`,
      `Email: ${doc.email}`,
      doc.phone ? `Phone: ${doc.phone}` : null,
      '',
      `Event: ${doc.eventType}, ${doc.guests} guests`,
      `Date: ${doc.eventDate}${doc.startTime ? ` at ${doc.startTime}` : ''}${doc.hours ? `, ${doc.hours} hours` : ''}`,
      `Where: ${doc.venue}`,
      `Staff wanted: ${doc.staffWanted ?? 'not sure'}`,
      doc.notes ? `Notes: ${doc.notes}` : null,
      '',
      link ? `Open it: ${link}` : 'Open it under Bookings > Staff requests in the admin.',
    ]
      .filter((line) => line !== null)
      .join('\n')

    await req.payload.sendEmail({
      to,
      subject: `[Vardenia] ${role} request ${doc.reference}`,
      text,
    })
  } catch (error) {
    // Reported, so a request the team was never told about shows up in the
    // error list and Sentry, not only in a log.
    await reportError(error, {
      source: 'staff-request.team-email',
      extra: { reference: doc.reference },
    })
  }
  return doc
}
