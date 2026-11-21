import { dirFor, type Locale } from '@vardenia/i18n'
import { emailPalette } from './email-palette'

/**
 * The two messages sent after a place is submitted: one to the team, one to the
 * owner. Pure builders so the wording and the escaping can be tested without
 * sending anything. The route sends them (see app/place-submissions/route.ts).
 *
 * Every user-supplied string goes through escapeHtml. The owner email carries no
 * link at all, and above all no admin link: nothing is public yet.
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
  locale: Locale
  /** siteOrigin() */
  origin: string
}

export interface PlaceSubmissionEmail {
  subject: string
  html: string
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

interface OwnerCopy {
  subject: string
  heading: string
  hello: (name: string) => string
  received: (business: string) => string
  review: string
  closing: string
}

const OWNER_COPY: Record<'en' | 'ar', OwnerCopy> = {
  en: {
    subject: 'We have received your listing',
    heading: 'Thank you for your submission',
    hello: (name) => `${name},`,
    received: (business) => `Thank you for adding ${business} to Vardenia.`,
    review:
      'Your listing is under review by our team. Nothing is public yet; we will write to you once it has been checked.',
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
    review:
      '\u0625\u062f\u0631\u0627\u062c\u0643 \u0642\u064a\u062f \u0627\u0644\u0645\u0631\u0627\u062c\u0639\u0629 \u0644\u062f\u0649 \u0641\u0631\u064a\u0642\u0646\u0627. \u0644\u0627 \u0634\u064a\u0621 \u0645\u0646\u0634\u0648\u0631 \u0628\u0639\u062f\u060c \u0648\u0633\u0646\u0643\u062a\u0628 \u0625\u0644\u064a\u0643 \u0628\u0639\u062f \u0627\u0644\u062a\u062d\u0642\u0642 \u0645\u0646\u0647.',
    closing: '\u0641\u0631\u064a\u0642 \u0641\u0627\u0631\u062f\u064a\u0646\u064a\u0627',
  },
}

export function placeSubmissionEmails(args: PlaceSubmissionEmailArgs): {
  team: PlaceSubmissionEmail
  owner: PlaceSubmissionEmail
} {
  const name = oneLine(args.businessName)

  const team: PlaceSubmissionEmail = {
    subject: `New place submitted: ${name}`,
    html: emailLayout({
      lang: 'en',
      dir: 'ltr',
      heading: 'A new place was submitted',
      paragraphs: ['It is saved as a draft and waits for review. Nothing is public.'],
      rows: [
        ['Business', args.businessName],
        ['Governorate', args.governorate],
        ['Listing number', String(args.listingNumber)],
        ['Issue', args.issueTitle],
        ['Owner', args.ownerName],
        ['Email', args.ownerEmail],
        ['Phone', args.ownerPhone],
      ],
      link: {
        href: `${args.origin}/admin/collections/businesses/${encodeURIComponent(String(args.businessId))}`,
        label: 'Open in the admin',
      },
    }),
  }

  const arabic = args.locale === 'ar'
  const copy = OWNER_COPY[arabic ? 'ar' : 'en']
  const owner: PlaceSubmissionEmail = {
    subject: copy.subject,
    html: emailLayout({
      lang: arabic ? 'ar' : 'en',
      dir: arabic ? dirFor('ar') : 'ltr',
      heading: copy.heading,
      paragraphs: [
        copy.hello(args.ownerName),
        copy.received(args.businessName),
        copy.review,
        copy.closing,
      ],
    }),
  }

  return { team, owner }
}
