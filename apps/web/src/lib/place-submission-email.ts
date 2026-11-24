import { dirFor, type Locale } from '@vardenia/i18n'
import { emailPalette } from './email-palette'
import { governorateLabel } from './labels'

/**
 * The two messages sent after a place is submitted: one to the team, one to the
 * owner. Pure builders so the wording and the escaping can be tested without
 * sending anything. The route sends them (see app/place-submissions/route.ts).
 *
 * Every user-supplied string goes through escapeHtml. The owner email carries no
 * link at all, and above all no admin link: nothing is public yet.
 *
 * The owner email says: received, we will get back to you, the agreed price, and
 * that nothing is paid unless the business is accepted, with the reference and
 * page number. No payment details yet (payment emails are a later task).
 *
 * The owner copy exists in English and Arabic; any other language gets the
 * English copy, laid out left to right to match it.
 */

/**
 * Where team alerts about new places and branches go: a dedicated address if
 * set, else where error alerts go. Null when neither is configured.
 */
export const teamAlertAddress = (): string | null =>
  process.env.PLACE_SUBMISSION_ALERT_TO?.trim() || process.env.ERROR_ALERT_TO?.trim() || null

export interface PlaceSubmissionEmailArgs {
  businessId: number | string
  businessName: string
  governorate: string
  listingNumber: number
  issueTitle: string
  ownerName: string
  ownerEmail: string
  ownerPhone: string
  /** VD-<n>. */
  reference: string
  /** The yearly price the owner agreed to, from Settings (snapshotted on the submission). */
  price: number
  /** ISO code, USD in practice. */
  currency: string
  locale: Locale
  /** siteOrigin() */
  origin: string
}

export interface PlaceSubmissionEmail {
  subject: string
  html: string
  /** The plain-text part, which some phones and watches show instead of the HTML. */
  text: string
}

/** Shared with lib/branch-email. */
export const escapeHtml = (value: string) =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')

/** Header values must not carry line breaks. */
export const oneLine = (value: string) => value.replace(/[\r\n]+/g, ' ').trim()

const FONT = "Georgia,'Times New Roman',serif"

/** The shared email layout (also lib/branch-email). */
export function emailLayout(opts: {
  lang: string
  dir: 'ltr' | 'rtl'
  heading: string
  paragraphs: string[]
  rows?: [string, string][]
  link?: { href: string; label: string }
}): string {
  const rtl = opts.dir === 'rtl'
  const rows = (opts.rows ?? [])
    .map(
      ([label, value]) =>
        `<tr><td style="padding:8px 0;color:${emailPalette.quiet};border-bottom:1px solid ${emailPalette.edge};">${escapeHtml(label)}</td><td style="padding:8px 0;text-align:${rtl ? 'left' : 'right'};border-bottom:1px solid ${emailPalette.edge};">${escapeHtml(value)}</td></tr>`,
    )
    .join('\n      ')
  return `<!doctype html>
<html lang="${opts.lang}" dir="${opts.dir}">
<body style="margin:0;padding:24px;background:${emailPalette.page};font-family:${FONT};color:${emailPalette.strong};">
  <div style="max-width:520px;margin:0 auto;background:${emailPalette.card};border:1px solid ${emailPalette.edge};border-radius:8px;padding:32px;">
    <p style="margin:0 0 4px;font-size:11px;letter-spacing:2px;text-transform:uppercase;color:${emailPalette.accent};">Vardenia</p>
    <h1 style="margin:0 0 20px;font-size:22px;font-weight:normal;">${escapeHtml(opts.heading)}</h1>
    ${opts.paragraphs
      .map(
        (p) =>
          `<p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:${emailPalette.body};">${escapeHtml(p)}</p>`,
      )
      .join('\n    ')}
    ${rows ? `<table style="width:100%;border-collapse:collapse;font-size:15px;margin:0 0 24px;">\n      ${rows}\n    </table>` : ''}
    ${
      opts.link
        ? `<p style="margin:0;"><a href="${escapeHtml(opts.link.href)}" style="display:inline-block;padding:12px 20px;border-radius:6px;background:${emailPalette.buttonBg};color:${emailPalette.buttonText};text-decoration:none;font-size:15px;">${escapeHtml(opts.link.label)}</a></p>`
        : ''
    }
  </div>
</body>
</html>`
}

/**
 * The plain-text twin of emailLayout: the same words, rows and link, in the
 * same order. Both emails were sent as HTML only (QA, 22 November 2026).
 */
export function emailText(opts: {
  heading: string
  paragraphs: string[]
  rows?: [string, string][]
  link?: { href: string; label: string }
}): string {
  // "Vardenia" first, as the kicker above the HTML heading.
  const lines = ['Vardenia', '', opts.heading, '', ...opts.paragraphs.flatMap((p) => [p, ''])]
  if (opts.rows?.length) lines.push(...opts.rows.map(([label, value]) => `${label}: ${value}`), '')
  if (opts.link) lines.push(`${opts.link.label}: ${opts.link.href}`)
  return lines.join('\n').trimEnd()
}

interface OwnerCopy {
  subject: string
  heading: string
  hello: (name: string) => string
  received: (business: string) => string
  review: string
  price: (amount: string) => string
  payOnlyIfAccepted: string
  closing: string
}

/** $20 for USD, otherwise "20 EUR". */
export const formatPrice = (price: number, currency: string) =>
  currency.toUpperCase() === 'USD' ? `$${price}` : `${price} ${currency.toUpperCase()}`

const OWNER_LABELS = {
  en: { reference: 'Reference', page: 'Page number' },
  ar: {
    reference: 'المرجع',
    page: 'رقم الصفحة',
  },
}

const OWNER_COPY: Record<'en' | 'ar', OwnerCopy> = {
  en: {
    subject: 'We have received your listing',
    heading: 'Thank you for your submission',
    hello: (name) => `${name},`,
    received: (business) => `Thank you for adding ${business} to Vardenia.`,
    review: 'We received your business and we will get back to you.',
    price: (amount) => `The price agreed is ${amount} a year.`,
    payOnlyIfAccepted: 'You pay only if we accept your business.',
    closing: 'The Vardenia team',
  },
  ar: {
    subject:
      '\u0648\u0635\u0644\u0646\u0627 \u0637\u0644\u0628 \u0625\u062f\u0631\u0627\u062c \u0645\u0643\u0627\u0646\u0643',
    heading:
      '\u0634\u0643\u0631\u0627\u064b \u0639\u0644\u0649 \u0625\u0631\u0633\u0627\u0644\u0643',
    hello: (name) => `${name}\u060c`,
    received: (business) =>
      `\u0634\u0643\u0631\u0627\u064b \u0644\u0625\u0636\u0627\u0641\u0629 ${business} \u0625\u0644\u0649 \u0641\u0627\u0631\u062f\u064a\u0646\u064a\u0627.`,
    review: 'وصلنا طلب إدراج مكانك وسنعاود التواصل معك.',
    price: (amount) => `السعر المتفق عليه هو ${amount} في السنة.`,
    payOnlyIfAccepted: 'لن تدفع إلا إذا قبلنا مكانك.',
    closing: '\u0641\u0631\u064a\u0642 \u0641\u0627\u0631\u062f\u064a\u0646\u064a\u0627',
  },
}

export function placeSubmissionEmails(args: PlaceSubmissionEmailArgs): {
  team: PlaceSubmissionEmail
  owner: PlaceSubmissionEmail
} {
  const name = oneLine(args.businessName)

  // The slug ("keserwan") reads as a typo in an email; the team reads English.
  const teamBody = {
    heading: 'A new place was submitted',
    paragraphs: ['The owner accepted the terms. It waits for review. Nothing is public.'],
    rows: [
      ['Reference', args.reference],
      ['Business', args.businessName],
      ['Governorate', governorateLabel(args.governorate, 'en')],
      ['Listing number', String(args.listingNumber)],
      ['Issue', args.issueTitle],
      ['Owner', args.ownerName],
      ['Email', args.ownerEmail],
      ['Phone', args.ownerPhone],
    ] as [string, string][],
    link: {
      href: `${args.origin}/admin/collections/businesses/${encodeURIComponent(String(args.businessId))}`,
      label: 'Open in the admin',
    },
  }
  const team: PlaceSubmissionEmail = {
    subject: `New place submitted: ${name}`,
    html: emailLayout({ lang: 'en', dir: 'ltr', ...teamBody }),
    text: emailText(teamBody),
  }

  const arabic = args.locale === 'ar'
  const copy = OWNER_COPY[arabic ? 'ar' : 'en']
  const ownerBody = {
    heading: copy.heading,
    paragraphs: [
      copy.hello(args.ownerName),
      copy.received(args.businessName),
      copy.review,
      copy.price(formatPrice(args.price, args.currency)),
      copy.payOnlyIfAccepted,
      copy.closing,
    ],
    rows: [
      [OWNER_LABELS[arabic ? 'ar' : 'en'].reference, args.reference],
      [OWNER_LABELS[arabic ? 'ar' : 'en'].page, String(args.listingNumber)],
    ] as [string, string][],
  }
  const owner: PlaceSubmissionEmail = {
    subject: copy.subject,
    html: emailLayout({
      lang: arabic ? 'ar' : 'en',
      dir: arabic ? dirFor('ar') : 'ltr',
      ...ownerBody,
    }),
    text: emailText(ownerBody),
  }

  return { team, owner }
}

export interface PlaceRejectionEmailArgs {
  ownerName: string
  businessName: string
  /** VD-<n>. */
  reference: string
  /** Staff's reason. Used only when `shareReason` is true. */
  reason: string
  shareReason: boolean
  locale: Locale
  /** siteOrigin() */
  origin: string
}

interface RejectionCopy {
  subject: string
  heading: string
  hello: (name: string) => string
  notAccepted: (business: string) => string
  reasonIntro: string
  again: string
  link: string
  closing: string
  reference: string
}

const REJECTION_COPY: Record<'en' | 'ar', RejectionCopy> = {
  en: {
    subject: 'About your Vardenia listing',
    heading: 'We could not accept your listing',
    hello: (name) => `${name},`,
    notAccepted: (business) =>
      `Thank you for sending ${business}. We are sorry, but we could not accept it this time.`,
    reasonIntro: 'The reason:',
    again: 'You are welcome to apply again. The form is on the Magazine Places page.',
    link: 'Apply again',
    closing: 'The Vardenia team',
    reference: 'Reference',
  },
  ar: {
    subject: 'بخصوص إدراج مكانك في فارديينيا',
    heading: 'لم نتمكن من قبول طلبك',
    hello: (name) => `${name}،`,
    notAccepted: (business) => `شكراً لإرسال ${business}. نأسف، لم نتمكن من قبوله هذه المرة.`,
    reasonIntro: 'السبب:',
    again: 'يسعدنا أن تقدّم من جديد. النموذج في صفحة أماكن المجلة.',
    link: 'قدّم من جديد',
    closing: 'فريق فارديينيا',
    reference: 'المرجع',
  },
}

/**
 * The short notice the owner gets when staff reject a submission. Plain: that
 * it was not accepted, the reference, the reason only when staff chose to share
 * it, and where to apply again. Nothing about payment. The reason is staff text
 * and is escaped by the shared layout like every other string.
 */
export function placeRejectionEmail(args: PlaceRejectionEmailArgs): PlaceSubmissionEmail {
  const arabic = args.locale === 'ar'
  const copy = REJECTION_COPY[arabic ? 'ar' : 'en']
  const reason = args.shareReason ? args.reason.trim() : ''
  const body = {
    heading: copy.heading,
    paragraphs: [
      copy.hello(args.ownerName),
      copy.notAccepted(args.businessName),
      ...(reason ? [`${copy.reasonIntro} ${reason}`] : []),
      copy.again,
      copy.closing,
    ],
    rows: [[copy.reference, args.reference]] as [string, string][],
    // English is the unprefixed address (localePrefix: as-needed).
    link: { href: `${args.origin}${arabic ? '/ar' : ''}/magazine-places`, label: copy.link },
  }
  return {
    subject: copy.subject,
    html: emailLayout({
      lang: arabic ? 'ar' : 'en',
      dir: arabic ? dirFor('ar') : 'ltr',
      ...body,
    }),
    text: emailText(body),
  }
}
