import type { Payload } from 'payload'
import type { BookingStatus } from '@vardenia/core'
import { reportError } from './report'
import { siteOrigin } from './auth-email'
import { emailPalette } from './email-palette'

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

/**
 * Who is speaking, when a reason is included.
 *
 * The sentence after this comes from the restaurant, not from us, and the reader
 * has to be able to tell. Without the attribution a blunt "we are fully booked"
 * reads as Vardenia's verdict on their evening, and a rude one would read as
 * ours. Kept beside the copy rather than in the messages file because this is
 * email, which has no `next-intl` around it.
 */
const REASON_LABEL: Record<'en' | 'ar', string> = {
  en: 'The business said:',
  ar: 'قال المكان:',
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

  return renderBookingEmail({ copy, name, reference, start, end, partySize, locale })
}

/**
 * One layout, several messages.
 *
 * Extracted when the status emails arrived, because the alternative was a second
 * copy of the same table markup - and two copies of an email template diverge
 * the first time somebody adjusts a padding value in one of them. Everything
 * that differs between messages is in `copy`.
 */
function renderBookingEmail({
  copy,
  name,
  reference,
  start,
  end,
  partySize,
  locale,
  reason,
}: {
  copy: Copy
  name: string
  reference: string
  start: Date
  end: Date
  partySize: number
  locale: 'en' | 'ar'
  /** What the venue said, when they said anything. See `REASON_LABEL`. */
  reason?: string
}): BookingEmailContent {
  const rtl = locale === 'ar'
  const when = formatWhen(start, locale)
  const until = formatTime(end, locale)
  const said = (reason ?? '').trim()

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
    ...(said ? ['', `${REASON_LABEL[locale]} ${said}`] : []),
    '',
    ...rows.map(([label, value]) => `${label}: ${value}`),
    '',
    copy.closing,
    'Vardenia',
  ].join('\n')

  const html = `<!doctype html>
<html lang="${locale}" dir="${rtl ? 'rtl' : 'ltr'}">
<body style="margin:0;padding:24px;background:${emailPalette.page};font-family:Georgia,'Times New Roman',serif;color:${emailPalette.strong};">
  <div style="max-width:520px;margin:0 auto;background:${emailPalette.card};border:1px solid ${emailPalette.edge};border-radius:8px;padding:32px;">
    <p style="margin:0 0 4px;font-size:11px;letter-spacing:2px;text-transform:uppercase;color:${emailPalette.accent};">Vardenia</p>
    <h1 style="margin:0 0 20px;font-size:22px;font-weight:normal;">${escapeHtml(copy.heading)}</h1>
    <p style="margin:0 0 8px;font-size:15px;">${escapeHtml(name)},</p>
    <p style="margin:0 0 24px;font-size:15px;line-height:1.6;color:${emailPalette.body};">${escapeHtml(copy.intro)}</p>
    ${
      said
        ? `<p style="margin:0 0 24px;padding:12px 16px;border-${rtl ? 'right' : 'left'}:3px solid ${emailPalette.edge};font-size:15px;line-height:1.6;color:${emailPalette.body};"><span style="color:${emailPalette.quiet};">${escapeHtml(REASON_LABEL[locale])}</span> ${escapeHtml(said)}</p>`
        : ''
    }
    <table style="width:100%;border-collapse:collapse;font-size:15px;">
      ${rows
        .map(
          ([label, value]) =>
            `<tr><td style="padding:8px 0;color:${emailPalette.quiet};border-bottom:1px solid ${emailPalette.edge};">${escapeHtml(label)}</td><td style="padding:8px 0;text-align:${rtl ? 'left' : 'right'};border-bottom:1px solid ${emailPalette.edge};">${escapeHtml(value)}</td></tr>`,
        )
        .join('\n      ')}
    </table>
    <p style="margin:24px 0 0;font-size:15px;color:${emailPalette.body};">${escapeHtml(copy.closing)}</p>
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
    /**
     * Reported here rather than at the call site, because this function returns
     * `false` instead of rethrowing - so the caller's `.catch` never sees a send
     * failure and would have reported nothing at all.
     *
     * The reference is attached deliberately. It is what makes this recoverable:
     * somebody can look up the booking and write to the customer by hand.
     */
    await reportError(error, {
      source: 'booking.confirmation-email',
      extra: { reference: rest.reference },
    })
    return false
  }
}

// ---------------------------------------------------------------------------
// What we write when the business answers
// ---------------------------------------------------------------------------

/**
 * The outcomes worth an email, which is not the same as the statuses that exist.
 *
 *  - `confirmed`  the business accepted. The message the customer is waiting for.
 *  - `declined`   the business could not take the request. Never confirmed, so
 *                 nothing was ever reserved and the wording must not imply it was.
 *  - `cancelled`  a booking that *was* confirmed has been called off. Different
 *                 news, and worse, because they had planned around it.
 *
 * `completed` and `no-show` are deliberately absent. Telling somebody they
 * turned up is noise; telling them they did not is an accusation, and one we
 * would be making from a button a busy person pressed at the end of a shift.
 */
export type BookingOutcomeKind = 'confirmed' | 'declined' | 'cancelled'

const OUTCOME_COPY: Record<'en' | 'ar', Record<BookingOutcomeKind, Copy>> = {
  en: {
    confirmed: {
      subject: 'Your booking is confirmed',
      heading: 'Booking confirmed',
      intro:
        'Good news - the business has confirmed your booking. Please quote this reference if you need to change anything.',
      whenLabel: 'When',
      untilLabel: 'Until',
      partyLabel: 'People',
      referenceLabel: 'Reference',
      closing: 'We look forward to seeing you.',
    },
    declined: {
      subject: 'Your booking request could not be taken',
      heading: 'Booking not available',
      intro:
        'The business was not able to take this booking, so nothing has been reserved. Another time may well be free, and other places nearby are on Vardenia.',
      whenLabel: 'You asked for',
      untilLabel: 'Until',
      partyLabel: 'People',
      referenceLabel: 'Reference',
      closing: 'Sorry to send disappointing news.',
    },
    cancelled: {
      subject: 'Your booking has been cancelled',
      heading: 'Booking cancelled',
      intro:
        'This booking has been cancelled and is no longer held. If that is unexpected, quote the reference below and we will look into it.',
      whenLabel: 'Was booked for',
      untilLabel: 'Until',
      partyLabel: 'People',
      referenceLabel: 'Reference',
      closing: 'Sorry for the change.',
    },
  },
  ar: {
    confirmed: {
      subject: 'تم تأكيد حجزك',
      heading: 'تم تأكيد الحجز',
      intro: 'خبر سار - أكّد المكان حجزك. يرجى ذكر هذا الرقم عند الحاجة إلى أي تعديل.',
      whenLabel: 'الموعد',
      untilLabel: 'حتى',
      partyLabel: 'عدد الأشخاص',
      referenceLabel: 'رقم الحجز',
      closing: 'نتطلع إلى استقبالك.',
    },
    declined: {
      subject: 'تعذّر قبول طلب حجزك',
      heading: 'الحجز غير متاح',
      intro:
        'لم يتمكن المكان من قبول هذا الحجز، ولم يتم حجز أي شيء. قد يكون موعد آخر متاحًا، وهناك أماكن أخرى قريبة على فاردينيا.',
      whenLabel: 'الموعد المطلوب',
      untilLabel: 'حتى',
      partyLabel: 'عدد الأشخاص',
      referenceLabel: 'رقم الحجز',
      closing: 'نأسف لهذا الخبر.',
    },
    cancelled: {
      subject: 'تم إلغاء حجزك',
      heading: 'تم إلغاء الحجز',
      intro:
        'تم إلغاء هذا الحجز ولم يعد محجوزًا. إذا كان ذلك غير متوقع، اذكر رقم الحجز أدناه وسنتحقق من الأمر.',
      whenLabel: 'كان محجوزًا في',
      untilLabel: 'حتى',
      partyLabel: 'عدد الأشخاص',
      referenceLabel: 'رقم الحجز',
      closing: 'نأسف لهذا التغيير.',
    },
  },
}

/**
 * Which outcome, if any, a status change should be written about.
 *
 * Takes both statuses because `cancelled` means two different things depending
 * on where it came from: from `pending` the business declined a request that was
 * never held, and from `confirmed` it called off something the customer had
 * planned around. Sending the same sentence for both would tell one of them
 * something untrue.
 */
export function outcomeFor(from: BookingStatus, to: BookingStatus): BookingOutcomeKind | null {
  if (from === to) return null
  if (to === 'confirmed') return 'confirmed'
  if (to === 'cancelled') return from === 'pending' ? 'declined' : 'cancelled'
  return null
}

export interface BookingOutcomeArgs {
  payload: Payload
  to: string
  name: string
  reference: string
  outcome: BookingOutcomeKind
  start: Date
  end: Date
  partySize: number
  locale: 'en' | 'ar'
  /**
   * What the venue said, when they wrote anything. Optional and usually absent:
   * a restaurant answering thirty requests at the end of a shift is not going to
   * explain each one, and the message has to read properly without it.
   */
  reason?: string
}

/** Pure, like the confirmation content, so the wording is testable. */
export function bookingOutcomeContent({
  name,
  reference,
  outcome,
  start,
  end,
  partySize,
  locale,
  reason,
}: Omit<BookingOutcomeArgs, 'payload' | 'to'>): BookingEmailContent {
  const copy = OUTCOME_COPY[locale][outcome]
  return renderBookingEmail({
    copy,
    name,
    reference,
    start,
    end,
    partySize,
    locale,
    /**
     * Only on the bad news. `confirmed` carries no reason today, and if a venue
     * ever leaves one on a booking they then accept, "the business said: we are
     * fully booked" underneath "Booking confirmed" would be a contradiction we
     * printed ourselves.
     */
    reason: outcome === 'confirmed' ? undefined : reason,
  })
}

/**
 * Sends, and never throws at the caller.
 *
 * Called from an `afterChange` hook, so the booking has already been written by
 * the time this runs. Letting a mail failure escape would turn a successful
 * confirmation into a 500 for the owner who pressed Accept, and leave them
 * pressing it again against a booking that is already confirmed.
 */
export async function sendBookingOutcome({
  payload,
  to,
  ...rest
}: BookingOutcomeArgs): Promise<boolean> {
  const content = bookingOutcomeContent(rest)

  try {
    await payload.sendEmail({
      to,
      subject: content.subject,
      html: content.html,
      text: content.text,
    })
    return true
  } catch (error) {
    await reportError(error, {
      source: 'booking.outcome-email',
      extra: { reference: rest.reference, outcome: rest.outcome },
    })
    return false
  }
}

// ---------------------------------------------------------------------------
// What we write to the venue
// ---------------------------------------------------------------------------

/**
 * Tells a business that a booking it was holding has been called off.
 *
 * The first message this product ever sends a partner, and it exists because the
 * dashboard alone does not solve the problem. A venue does not sit refreshing a
 * page; without this a table stays held for somebody who decided last week not
 * to come, and the venue finds out when the evening is over. That is the part of
 * a cancellation that actually costs money.
 *
 * # Both languages, like the partner password email
 *
 * The booking carries the *customer's* language, which says nothing about the
 * person who runs the restaurant. We have never asked a partner what they read,
 * so both go in one message rather than one being guessed.
 */
export interface VenueCancellationArgs {
  payload: Payload
  to: string
  businessName: string
  guestName: string
  reference: string
  start: Date
  partySize: number
  /** True when the booking had been confirmed, so the table was genuinely held. */
  wasConfirmed: boolean
}

export function venueCancellationContent({
  businessName,
  guestName,
  reference,
  start,
  partySize,
  wasConfirmed,
}: Omit<VenueCancellationArgs, 'payload' | 'to'>): BookingEmailContent {
  const whenEn = formatWhen(start, 'en')
  const whenAr = formatWhen(start, 'ar')

  /**
   * A confirmed booking freed a table; a pending one was only ever a request.
   * Saying "a table is now free" about something the venue never accepted would
   * be telling them about a table they did not know they had lost.
   */
  const leadEn = wasConfirmed
    ? `A confirmed booking at ${businessName} has been cancelled, so that table is free again.`
    : `A booking request at ${businessName} has been withdrawn. There is nothing to answer.`

  const leadAr = wasConfirmed
    ? `تم إلغاء حجز مؤكّد في ${businessName}، والطاولة متاحة الآن.`
    : `تم سحب طلب حجز في ${businessName}. لا حاجة للرد عليه.`

  const subject = wasConfirmed
    ? `Booking cancelled - ${reference}`
    : `Booking request withdrawn - ${reference}`

  const rows: [string, string][] = [
    ['Guest', guestName || 'Guest'],
    ['When', whenEn],
    ['People', String(partySize)],
    ['Reference', reference],
  ]

  const text = [
    leadEn,
    '',
    ...rows.map(([label, value]) => `${label}: ${value}`),
    '',
    `Your bookings: ${siteOrigin()}/partner`,
    '',
    '---',
    '',
    leadAr,
    '',
    `${whenAr} - ${partySize}`,
    reference,
    '',
    `حجوزاتك: ${siteOrigin()}/partner`,
    '',
    'Vardenia',
  ].join('\n')

  const html = `<!doctype html>
<html lang="en">
<body style="margin:0;padding:24px;background:${emailPalette.page};font-family:Georgia,'Times New Roman',serif;color:${emailPalette.strong};">
  <div style="max-width:520px;margin:0 auto;background:${emailPalette.card};border:1px solid ${emailPalette.edge};border-radius:8px;padding:32px;">
    <p style="margin:0 0 4px;font-size:11px;letter-spacing:2px;text-transform:uppercase;color:${emailPalette.accent};">Vardenia</p>
    <h1 style="margin:0 0 20px;font-size:22px;font-weight:normal;">${escapeHtml(wasConfirmed ? 'Booking cancelled' : 'Request withdrawn')}</h1>
    <p style="margin:0 0 24px;font-size:15px;line-height:1.6;color:${emailPalette.body};">${escapeHtml(leadEn)}</p>
    <table style="width:100%;border-collapse:collapse;font-size:15px;">
      ${rows
        .map(
          ([label, value]) =>
            `<tr><td style="padding:8px 0;color:${emailPalette.quiet};border-bottom:1px solid ${emailPalette.edge};">${escapeHtml(label)}</td><td style="padding:8px 0;text-align:right;border-bottom:1px solid ${emailPalette.edge};">${escapeHtml(value)}</td></tr>`,
        )
        .join('\n      ')}
    </table>
    <p style="margin:24px 0 0;font-size:13px;color:${emailPalette.quiet};">
      <a href="${escapeHtml(siteOrigin())}/partner" style="color:${emailPalette.accent};">${escapeHtml(siteOrigin())}/partner</a>
    </p>
    <div dir="rtl" lang="ar" style="margin-top:24px;border-top:1px solid ${emailPalette.edge};padding-top:24px;text-align:right;font-family:'Segoe UI',Tahoma,sans-serif;">
      <p style="margin:0;font-size:15px;line-height:1.8;color:${emailPalette.body};">${escapeHtml(leadAr)}</p>
    </div>
  </div>
</body>
</html>`

  return { subject, html, text }
}

/** Sends, and never throws - it runs from a hook after the write. */
export async function sendVenueCancellation({
  payload,
  to,
  ...rest
}: VenueCancellationArgs): Promise<boolean> {
  const content = venueCancellationContent(rest)

  try {
    await payload.sendEmail({
      to,
      subject: content.subject,
      html: content.html,
      text: content.text,
    })
    return true
  } catch (error) {
    await reportError(error, {
      source: 'booking.venue-cancellation',
      extra: { reference: rest.reference },
    })
    return false
  }
}
