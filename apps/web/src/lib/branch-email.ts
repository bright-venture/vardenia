import { dirFor, type Locale } from '@vardenia/i18n'
import { emailLayout, oneLine } from './place-submission-email'

/**
 * The two messages sent after a partner adds a branch (Task 9): one to the
 * team, who review and publish it, one to the partner. Pure builders, like
 * lib/place-submission-email, whose layout and escaping they share: every
 * value goes through escapeHtml inside emailLayout, and the subject is kept
 * on one line. The partner copy has no link (nothing is public yet); English
 * and Arabic, any other language gets the English copy.
 */

export interface BranchEmailArgs {
  listingId: number | string
  branchName: string
  sourceName: string
  brandName: string
  brandCreated: boolean
  governorate: string
  city?: string
  address: string
  partnerName: string
  partnerEmail: string
  locale: Locale
  /** siteOrigin() */
  origin: string
}

export interface BranchEmail {
  subject: string
  html: string
}

interface PartnerCopy {
  subject: string
  heading: string
  hello: (name: string) => string
  received: (branch: string) => string
  review: string
  closing: string
}

const PARTNER_COPY: Record<'en' | 'ar', PartnerCopy> = {
  en: {
    subject: 'We have received your new branch',
    heading: 'Thank you for your request',
    hello: (name) => `${name},`,
    received: (branch) => `We have received your request to add ${branch}.`,
    review:
      'Our team will review the branch before it goes live. Nothing is public yet; we will write to you once it has been checked.',
    closing: 'The Vardenia team',
  },
  ar: {
    subject:
      '\u0648\u0635\u0644\u0646\u0627 \u0637\u0644\u0628 \u0641\u0631\u0639\u0643 \u0627\u0644\u062c\u062f\u064a\u062f',
    heading: '\u0634\u0643\u0631\u0627\u064b \u0639\u0644\u0649 \u0637\u0644\u0628\u0643',
    hello: (name) => `${name}\u060c`,
    received: (branch) =>
      `\u0648\u0635\u0644\u0646\u0627 \u0637\u0644\u0628 \u0625\u0636\u0627\u0641\u0629 \u0627\u0644\u0641\u0631\u0639 ${branch}.`,
    review:
      '\u0633\u064a\u0631\u0627\u062c\u0639 \u0641\u0631\u064a\u0642\u0646\u0627 \u0627\u0644\u0641\u0631\u0639 \u0642\u0628\u0644 \u0646\u0634\u0631\u0647. \u0644\u0627 \u0634\u064a\u0621 \u0645\u0646\u0634\u0648\u0631 \u0628\u0639\u062f\u060c \u0648\u0633\u0646\u0643\u062a\u0628 \u0625\u0644\u064a\u0643 \u0628\u0639\u062f \u0627\u0644\u062a\u062d\u0642\u0642 \u0645\u0646\u0647.',
    closing: '\u0641\u0631\u064a\u0642 \u0641\u0627\u0631\u062f\u064a\u0646\u064a\u0627',
  },
}

export function branchRequestEmails(args: BranchEmailArgs): {
  team: BranchEmail
  partner: BranchEmail
} {
  const team: BranchEmail = {
    subject: `New branch requested: ${oneLine(args.branchName)}`,
    html: emailLayout({
      lang: 'en',
      dir: 'ltr',
      heading: 'A partner added a branch',
      paragraphs: [
        'It is saved as a draft with booking off, and waits for review. Set its tier and contract, then publish it. Nothing is public.',
        args.brandCreated
          ? `This is the first branch, so a new brand was created from ${args.sourceName}.`
          : `It joins the brand ${args.brandName}.`,
      ],
      rows: [
        ['Branch', args.branchName],
        ['Copied from', args.sourceName],
        ['Brand', args.brandName],
        ['Governorate', args.governorate],
        ['City', args.city ?? ''],
        ['Address', args.address],
        ['Partner', args.partnerName],
        ['Email', args.partnerEmail],
      ],
      link: {
        href: `${args.origin}/admin/collections/businesses/${encodeURIComponent(String(args.listingId))}`,
        label: 'Open in the admin',
      },
    }),
  }

  const arabic = args.locale === 'ar'
  const copy = PARTNER_COPY[arabic ? 'ar' : 'en']
  const partner: BranchEmail = {
    subject: copy.subject,
    html: emailLayout({
      lang: arabic ? 'ar' : 'en',
      dir: arabic ? dirFor('ar') : 'ltr',
      heading: copy.heading,
      paragraphs: [
        copy.hello(args.partnerName),
        copy.received(args.branchName),
        copy.review,
        copy.closing,
      ],
    }),
  }

  return { team, partner }
}
