import { describe, expect, it } from 'vitest'
import { enquiryDraft, gmailLink, isHandheld, mailtoLink, outlookLink } from './enquiry-mail'

const copy = {
  subject: 'Vardenia magazine enquiry: {business}',
  greeting: 'Hello Vardenia,',
  intro: 'Intro.',
  mailBusiness: 'Business',
  mailName: 'Contact name',
  mailEmail: 'Email',
  mailLocation: 'Location',
  mailCategory: 'Category',
  closing: 'Closing.',
  thanks: 'Thank you,',
}
const enquiry = {
  business: 'Le Royal & Co',
  name: 'Rana',
  email: 'rana@example.com',
  location: 'Byblos',
  category: 'Hotels',
  message: 'Sea view, 12 rooms.',
}
const draft = enquiryDraft('contact@vardenia.com', enquiry, copy)

describe('the enquiry email draft', () => {
  it('puts the business in the subject', () => {
    expect(draft.subject).toBe('Vardenia magazine enquiry: Le Royal & Co')
  })

  it('carries every field, the message, and signs with the name', () => {
    for (const line of [
      'Business: Le Royal & Co',
      'Contact name: Rana',
      'Email: rana@example.com',
      'Location: Byblos',
      'Category: Hotels',
      'Sea view, 12 rooms.',
    ])
      expect(draft.body).toContain(line)
    expect(draft.body.endsWith('Thank you,\nRana')).toBe(true)
  })

  it('leaves out the message block when there is none', () => {
    const body = enquiryDraft('contact@vardenia.com', { ...enquiry, message: '' }, copy).body
    expect(body).not.toContain('\n\n\n')
  })
})

describe('where the draft opens', () => {
  it('a phone gets a mailto: link with everything encoded', () => {
    const url = new URL(mailtoLink(draft))
    expect(url.protocol).toBe('mailto:')
    expect(url.pathname).toBe('contact@vardenia.com')
    expect(url.searchParams.get('subject')).toBe(draft.subject)
    expect(url.searchParams.get('body')).toBe(draft.body)
  })

  it('Gmail opens its compose page, addressed and filled in', () => {
    const url = new URL(gmailLink(draft))
    expect(url.host).toBe('mail.google.com')
    expect(url.searchParams.get('view')).toBe('cm')
    expect(url.searchParams.get('to')).toBe('contact@vardenia.com')
    expect(url.searchParams.get('su')).toBe(draft.subject)
    expect(url.searchParams.get('body')).toBe(draft.body)
  })

  it('Outlook opens its compose page, addressed and filled in', () => {
    const url = new URL(outlookLink(draft))
    expect(url.host).toBe('outlook.live.com')
    expect(url.searchParams.get('to')).toBe('contact@vardenia.com')
    expect(url.searchParams.get('subject')).toBe(draft.subject)
    expect(url.searchParams.get('body')).toBe(draft.body)
  })

  it('tells a phone from a computer', () => {
    const iphone = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) Mobile/15E148'
    const android = 'Mozilla/5.0 (Linux; Android 15; Pixel 9) Mobile Safari/537.36'
    const windows = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/130.0 Safari/537.36'
    expect(isHandheld(iphone, true)).toBe(true)
    expect(isHandheld(android, true)).toBe(true)
    expect(isHandheld(windows, false)).toBe(false)
    // An iPad asking for the desktop site still has a touch screen.
    expect(isHandheld('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', true)).toBe(true)
  })
})
