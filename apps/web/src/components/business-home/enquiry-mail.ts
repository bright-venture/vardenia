/**
 * The homepage enquiry as a mailto: link, in the reader's language. Pure, so
 * the draft it prepares is tested (enquiry-mail.test.ts).
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
  mailInterest: string
  closing: string
  thanks: string
}

export interface Enquiry {
  business: string
  name: string
  email: string
  location: string
  category: string
  interest: string
  message: string
}

export function enquiryMail(to: string, enquiry: Enquiry, copy: EnquiryCopy): string {
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
    `${copy.mailInterest}: ${enquiry.interest}`,
    ...(enquiry.message ? ['', enquiry.message] : []),
    '',
    copy.closing,
    '',
    copy.thanks,
    enquiry.name,
  ]
  const subject = copy.subject.replace('{business}', enquiry.business)
  return `mailto:${to}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(lines.join('\n'))}`
}
