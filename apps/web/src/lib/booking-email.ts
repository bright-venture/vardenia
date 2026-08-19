import type { Payload } from 'payload'
import type { BookingStatus } from '@vardenia/core'

/**
 * The confirmation a customer receives.
 *
 * Often the first email anyone gets from Vardenia, which makes it the message
 * that decides whether the next one lands in an inbox. Two things follow from
 * that, and both are about looking like real mail rather than like a template:
 *
 *  - **A plain-text part as well as HTML.** An HTML-only message with a link in
 *    it scores badly with every filter, and the text part is what a watch or a
 *    screen reader renders.
 *  - **No link at all in the body.** There is nothing for the customer to click
 *    yet - no booking management page exists - and a message whose only content
 *    is a URL is the shape of phishing. The reference is the payload here.
 *
 * Written in the customer's language, right-to-left when that is Arabic.
 */

export interface BookingConfirmationArgs {
  payload: Payload
  to: string
  name: string
  reference: string
  status: BookingStatus
  start: Date
  end: Date
  partySize: number
  locale: 'en' | 'ar'
}

const BEIRUT = 'Asia/Beirut'

/**
 * Formatted in Beirut, always.
 *
 * The instant is stored in UTC and the customer is standing in Lebanon. A
 * confirmation that says 17:00 for a 20:00 table is worse than no confirmation:
 * it is wrong in a way the reader has no way to detect.
 */
function formatWhen(date: Date, locale: 'en' | 'ar'): string {
  return new Intl.DateTimeFormat(locale === 'ar' ? 'ar-LB' : 'en-GB', {
    timeZone: BEIRUT,
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date)
}

function formatTime(date: Date, locale: 'en' | 'ar'): string {
  return new Intl.DateTimeFormat(locale === 'ar' ? 'ar-LB' : 'en-GB', {
    timeZone: BEIRUT,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date)
}

interface Copy {
  subject: string
  heading: string
  intro: string
  whenLabel: string
  untilLabel: string
  partyLabel: string
  referenceLabel: string
  closing: string
}

const COPY: Record<'en' | 'ar', Record<'confirmed' | 'pending', Copy>> = {
  en: {
    confirmed: {
      subject: 'Your booking is confirmed',
      heading: 'Booking confirmed',
      intro: 'Your table is booked. Please quote this reference if you need to change anything.',
      whenLabel: 'When',
      untilLabel: 'Until',
      partyLabel: 'People',
      referenceLabel: 'Reference',
      closing: 'We look forward to seeing you.',
    },
    pending: {
      subject: 'We have your booking request',
      heading: 'Booking requested',
      intro:
        'We have passed your request to the business and will write again as soon as they confirm. Nothing is reserved yet.',
      whenLabel: 'Requested for',
      untilLabel: 'Until',
      partyLabel: 'People',
      referenceLabel: 'Reference',
      closing: 'We will be in touch shortly.',
    },
  },
  ar: {
    confirmed: {
      subject: 'تم تأكيد حجزك',
      heading: 'تم تأكيد الحجز',
      intro: 'تم تأكيد حجزك. يرجى ذكر هذا الرقم عند الحاجة إلى أي تعديل.',
      whenLabel: 'الموعد',
      untilLabel: 'حتى',
      partyLabel: 'عدد الأشخاص',
      referenceLabel: 'رقم الحجز',
      closing: 'نتطلع إلى استقبالك.',
    },
    pending: {
      subject: 'وصلنا طلب حجزك',
      heading: 'تم استلام طلب الحجز',
      intro: 'أرسلنا طلبك إلى المكان وسنعاود الكتابة إليك فور تأكيده. لم يتم حجز أي شيء بعد.',
      whenLabel: 'الموعد المطلوب',
      untilLabel: 'حتى',
      partyLabel: 'عدد الأشخاص',
      referenceLabel: 'رقم الحجز',
      closing: 'سنتواصل معك قريبًا.',
    },
  },
}

/** Anything that is not a live booking is not something we write about. */
const copyFor = (status: BookingStatus, locale: 'en' | 'ar'): Copy | null => {
  if (status === 'confirmed') return COPY[locale].confirmed
  if (status === 'pending') return COPY[locale].pending
  return null
}

const escapeHtml = (value: string) =>
  value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

export interface BookingEmailContent {
  subject: string
  html: string
  text: string
}

/**
 * Built as a pure function so the wording can be tested without sending
 * anything, and so a change to the copy is visible in a diff rather than
 * discovered in somebody's inbox.
 */
export function bookingConfirmationContent({
  name,
  reference,
  status,
  start,
  end,
  partySize,
  locale,
}: Omit<BookingConfirmationArgs, 'payload' | 'to'>): BookingEmailContent | null {
  const copy = copyFor(status, locale)
  if (!copy) return null

  const rtl = locale === 'ar'
  const when = formatWhen(start, locale)
  const until = formatTime(end, locale)

  const rows: [string, string][] = [
    [copy.whenLabel, when],
    [copy.untilLabel, until],
    [copy.partyLabel, String(partySize)],
    [copy.referenceLabel, reference],
  ]

  const text = [
    `${copy.heading}`,
    '',
    `${name},`,
    '',
    copy.intro,
    '',
    ...rows.map(([label, value]) => `${label}: ${value}`),
    '',
    copy.closing,
    'Vardenia',
  ].join('\n')

  const html = `<!doctype html>
<html lang="${locale}" dir="${rtl ? 'rtl' : 'ltr'}">
<body style="margin:0;padding:24px;background:#faf9f7;font-family:Georgia,'Times New Roman',serif;color:#1a1a1a;">
  <div style="max-width:520px;margin:0 auto;background:#ffffff;border:1px solid #e8e4de;border-radius:8px;padding:32px;">
    <p style="margin:0 0 4px;font-size:11px;letter-spacing:2px;text-transform:uppercase;color:#a08a5b;">Vardenia</p>
    <h1 style="margin:0 0 20px;font-size:22px;font-weight:normal;">${escapeHtml(copy.heading)}</h1>
    <p style="margin:0 0 8px;font-size:15px;">${escapeHtml(name)},</p>
    <p style="margin:0 0 24px;font-size:15px;line-height:1.6;color:#4a4a4a;">${escapeHtml(copy.intro)}</p>
    <table style="width:100%;border-collapse:collapse;font-size:15px;">
      ${rows
        .map(
          ([label, value]) =>
            `<tr><td style="padding:8px 0;color:#7a7a7a;border-bottom:1px solid #f0ede8;">${escapeHtml(label)}</td><td style="padding:8px 0;text-align:${rtl ? 'left' : 'right'};border-bottom:1px solid #f0ede8;">${escapeHtml(value)}</td></tr>`,
        )
        .join('\n      ')}
    </table>
    <p style="margin:24px 0 0;font-size:15px;color:#4a4a4a;">${escapeHtml(copy.closing)}</p>
  </div>
</body>
</html>`

  return { subject: copy.subject, html, text }
}

/**
 * Sends, or explains why it did not.
 *
 * Never throws at the caller. A booking that exists without a confirmation is a
 * problem for support; a booking that failed because an email provider had a bad
 * minute is a problem for the customer standing outside a restaurant.
 */
export async function sendBookingConfirmation({
  payload,
  to,
  ...rest
}: BookingConfirmationArgs): Promise<boolean> {
  const content = bookingConfirmationContent(rest)
  if (!content) return false

  try {
    await payload.sendEmail({
      to,
      subject: content.subject,
      html: content.html,
      text: content.text,
    })
    return true
  } catch (error) {
    payload.logger.error(
      { error, reference: rest.reference },
      'Booking confirmation failed to send',
    )
    return false
  }
}
