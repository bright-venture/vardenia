/**
 * The homepage enquiry as an email ready to send, in the reader's language.
 * Pure, so the draft it prepares is tested (enquiry-mail.test.ts).
 *
 * The same draft goes three ways (11 November 2026): a mailto: link, which a
 * phone hands to its mail app, and Gmail's and Outlook's web compose pages,
 * which a computer opens in a new tab. On a computer with no mail app set up,
 * a mailto: link does nothing at all, which read as a broken button.
 */
export interface EnquiryCopy {
  /** "Vardenia magazine enquiry: {business}" */
  subject: string
  greeting: string
  intro: string
  mailBusiness: string
  mailName: string
  mailEmail: string
  mailLocation: string
  mailCategory: string
  closing: string
  thanks: string
}

export interface Enquiry {
  business: string
  name: string
  email: string
  location: string
  category: string
  message: string
}

export interface EnquiryDraft {
  to: string
  subject: string
  body: string
}

export function enquiryDraft(to: string, enquiry: Enquiry, copy: EnquiryCopy): EnquiryDraft {
  const lines = [
    copy.greeting,
    '',
    copy.intro,
    '',
    `${copy.mailBusiness}: ${enquiry.business}`,
    `${copy.mailName}: ${enquiry.name}`,
    `${copy.mailEmail}: ${enquiry.email}`,
    `${copy.mailLocation}: ${enquiry.location}`,
    `${copy.mailCategory}: ${enquiry.category}`,
    ...(enquiry.message ? ['', enquiry.message] : []),
    '',
    copy.closing,
    '',
    copy.thanks,
    enquiry.name,
  ]
  return {
    to,
    subject: copy.subject.replace('{business}', enquiry.business),
    body: lines.join('\n'),
  }
}

/** For the phone's own mail app. */
export const mailtoLink = ({ to, subject, body }: EnquiryDraft): string =>
  `mailto:${to}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`

/** Gmail's compose page, filled in. */
export const gmailLink = ({ to, subject, body }: EnquiryDraft): string =>
  `https://mail.google.com/mail/?${new URLSearchParams({ view: 'cm', fs: '1', to, su: subject, body })}`

/** Outlook on the web's compose page, filled in (personal and work accounts). */
export const outlookLink = ({ to, subject, body }: EnquiryDraft): string =>
  `https://outlook.live.com/mail/0/deeplink/compose?${new URLSearchParams({ to, subject, body })}`

/** A phone or tablet, which hands mailto: to its mail app; a computer may not. */
export const isHandheld = (userAgent: string, coarsePointer: boolean): boolean =>
  /Android|iPhone|iPad|iPod|Mobile/i.test(userAgent) || coarsePointer
