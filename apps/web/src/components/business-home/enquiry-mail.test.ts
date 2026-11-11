import { describe, expect, it } from 'vitest'
import { enquiryMail } from './enquiry-mail'

const copy = {
  subject: 'Vardenia magazine enquiry: {business}',
  greeting: 'Hello Vardenia,',
  intro: 'Intro.',
  mailBusiness: 'Business',
  mailName: 'Contact name',
  mailEmail: 'Email',
  mailLocation: 'Location',
  mailCategory: 'Category',
  mailInterest: 'Interested in',
  closing: 'Closing.',
  thanks: 'Thank you,',
}
const enquiry = {
  business: 'Le Royal & Co',
  name: 'Rana',
  email: 'rana@example.com',
  location: 'Byblos',
  category: 'Hotels',
  interest: 'Magazine advertising',
  message: 'Sea view, 12 rooms.',
}

describe('the enquiry email draft', () => {
  it('goes to the Vardenia mailbox with the business in the subject', () => {
    const url = new URL(enquiryMail('contact@vardenia.com', enquiry, copy))
    expect(url.protocol).toBe('mailto:')
    expect(url.pathname).toBe('contact@vardenia.com')
    expect(url.searchParams.get('subject')).toBe('Vardenia magazine enquiry: Le Royal & Co')
  })

  it('carries every field, the message, and signs with the name', () => {
    const body = new URL(enquiryMail('contact@vardenia.com', enquiry, copy)).searchParams.get(
      'body',
    )!
    for (const line of [
      'Business: Le Royal & Co',
      'Contact name: Rana',
      'Email: rana@example.com',
      'Location: Byblos',
      'Category: Hotels',
      'Interested in: Magazine advertising',
      'Sea view, 12 rooms.',
    ])
      expect(body).toContain(line)
    expect(body.trim().endsWith('Thank you,\nRana')).toBe(true)
  })

  it('leaves out the message block when there is none', () => {
    const body = new URL(
      enquiryMail('contact@vardenia.com', { ...enquiry, message: '' }, copy),
    ).searchParams.get('body')!
    expect(body).not.toContain('\n\n\n')
  })
})
