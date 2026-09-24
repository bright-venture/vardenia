import type { Payload } from 'payload'
import { DISPUTE_DAYS, PAYMENT_DAYS } from '@vardenia/core'
import { siteOrigin } from './auth-email'
import { beirutCalendarDayLabel, beirutDate } from './beirut'
import { emailPalette } from './email-palette'
import { reportError } from './report'

/**
 * Tells a venue its monthly statement is ready: how much, by when, and where to
 * read it line by line.
 *
 * English and Arabic in one message, like every other email to a venue: we have
 * never asked a partner which they read, so neither is guessed.
 *
 * The lines themselves are not in the email. They are on the statement page,
 * where each one can be questioned, and an email listing forty bookings is one
 * nobody scrolls to the bottom of.
 */

const escapeHtml = (value: string) =>
  value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

export interface StatementEmailInput {
  number: string
  businessName: string
  period: string
  total: number
  lineCount: number
  dueAt: Date
  url: string
}

const dollars = (amount: number) =>
  `$${amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

/** "2026-10" as "October 2026" and "تشرين الأول 2026". */
function monthName(period: string, locale: 'en' | 'ar'): string {
  const [year, month] = period.split('-').map(Number)
  const date = new Date(Date.UTC(year ?? 2000, (month ?? 1) - 1, 15))
  return date.toLocaleDateString(locale === 'ar' ? 'ar-LB' : 'en-GB', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  })
}

export function statementEmailContent(input: StatementEmailInput) {
  const monthEn = monthName(input.period, 'en')
  const monthAr = monthName(input.period, 'ar')
  const dueEn = beirutCalendarDayLabel(beirutDate(input.dueAt), 'en')
  const dueAr = beirutCalendarDayLabel(beirutDate(input.dueAt), 'ar')
  const total = dollars(input.total)

  const subject = `Vardenia statement ${input.number} - ${monthEn}`

  const leadEn = `Your Vardenia statement for ${monthEn} is ready: ${input.lineCount} booking${input.lineCount === 1 ? '' : 's'} at ${input.businessName}, ${total} in total.`
  const stepsEn = `If a line is wrong, you can question it on the statement page within ${DISPUTE_DAYS} days. Please pay within ${PAYMENT_DAYS} days, by ${dueEn}.`
  const leadAr = `كشف حسابك من فاردينيا عن ${monthAr} جاهز: ${input.lineCount} حجز في ${input.businessName}، والمجموع ${total}.`
  const stepsAr = `إذا كان أي سطر غير صحيح، يمكنك الاعتراض عليه في صفحة الكشف خلال ${DISPUTE_DAYS} أيام. يرجى الدفع خلال ${PAYMENT_DAYS} يوماً، قبل ${dueAr}.`

  const rows: [string, string][] = [
    ['Statement', input.number],
    ['Month', monthEn],
    ['Total', total],
    ['Due', dueEn],
  ]

  const text = [
    leadEn,
    '',
    ...rows.map(([label, value]) => `${label}: ${value}`),
    '',
    stepsEn,
    '',
    input.url,
    '',
    '---',
    '',
    leadAr,
    stepsAr,
    '',
    input.url,
    '',
    'Vardenia',
  ].join('\n')

  const html = `<!doctype html>
<html lang="en">
<body style="margin:0;padding:24px;background:${emailPalette.page};font-family:Georgia,'Times New Roman',serif;color:${emailPalette.strong};">
  <div style="max-width:520px;margin:0 auto;background:${emailPalette.card};border:1px solid ${emailPalette.edge};border-radius:8px;padding:32px;">
    <p style="margin:0 0 4px;font-size:11px;letter-spacing:2px;text-transform:uppercase;color:${emailPalette.accent};">Vardenia</p>
    <h1 style="margin:0 0 20px;font-size:22px;font-weight:normal;">${escapeHtml(`Statement for ${monthEn}`)}</h1>
    <p style="margin:0 0 24px;font-size:15px;line-height:1.6;color:${emailPalette.body};">${escapeHtml(leadEn)}</p>
    <table style="width:100%;border-collapse:collapse;font-size:15px;">
      ${rows
        .map(
          ([label, value]) =>
            `<tr><td style="padding:8px 0;color:${emailPalette.quiet};border-bottom:1px solid ${emailPalette.edge};">${escapeHtml(label)}</td><td style="padding:8px 0;text-align:right;border-bottom:1px solid ${emailPalette.edge};">${escapeHtml(value)}</td></tr>`,
        )
        .join('\n      ')}
    </table>
    <p style="margin:24px 0 0;font-size:15px;line-height:1.6;color:${emailPalette.body};">${escapeHtml(stepsEn)}</p>
    <p style="margin:24px 0 0;font-size:13px;color:${emailPalette.quiet};">
      <a href="${escapeHtml(input.url)}" style="color:${emailPalette.accent};">${escapeHtml(input.url)}</a>
    </p>
    <div dir="rtl" lang="ar" style="margin-top:24px;border-top:1px solid ${emailPalette.edge};padding-top:24px;text-align:right;font-family:'Segoe UI',Tahoma,sans-serif;">
      <p style="margin:0 0 12px;font-size:15px;line-height:1.8;color:${emailPalette.body};">${escapeHtml(leadAr)}</p>
      <p style="margin:0;font-size:15px;line-height:1.8;color:${emailPalette.body};">${escapeHtml(stepsAr)}</p>
    </div>
  </div>
</body>
</html>`

  return { subject, html, text }
}

interface StatementDoc {
  id: number | string
  number?: string | null
  business?: unknown
  period?: string | null
  total?: number | null
  dueAt?: string | null
  lines?: unknown[] | null
}

const idOf = (value: unknown): string | number | null => {
  if (typeof value === 'string' || typeof value === 'number') return value
  const id = (value as { id?: unknown } | null)?.id
  return typeof id === 'string' || typeof id === 'number' ? id : null
}

/**
 * Sends the statement to every account that manages the venue.
 *
 * Returns how many were sent. None is not an error: a venue with no partner
 * account yet still gets its statement, by hand, and the team sees the count.
 */
export async function sendStatementEmail(payload: Payload, doc: StatementDoc): Promise<number> {
  const businessId = idOf(doc.business)
  if (businessId === null || !doc.dueAt) return 0

  const [owners, business] = await Promise.all([
    payload.find({
      collection: 'business-users',
      where: { businesses: { in: [businessId] } },
      limit: 20,
      depth: 0,
      overrideAccess: true,
    }),
    payload
      .findByID({ collection: 'businesses', id: businessId, depth: 0, overrideAccess: true })
      .catch(() => null),
  ])

  const content = statementEmailContent({
    number: String(doc.number ?? ''),
    businessName: String((business as { name?: unknown } | null)?.name ?? 'your listing'),
    period: String(doc.period ?? ''),
    total: Number(doc.total ?? 0),
    lineCount: doc.lines?.length ?? 0,
    dueAt: new Date(doc.dueAt),
    url: `${siteOrigin()}/partner/statements/${doc.id}`,
  })

  let sent = 0
  for (const owner of owners.docs) {
    const to = String((owner as { email?: unknown }).email ?? '')
    if (!to) continue
    try {
      await payload.sendEmail({
        to,
        subject: content.subject,
        html: content.html,
        text: content.text,
      })
      sent += 1
    } catch (error) {
      await reportError(error, {
        source: 'billing.statement-email',
        extra: { statement: doc.id },
      })
    }
  }
  return sent
}
