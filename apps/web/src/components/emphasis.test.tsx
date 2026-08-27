import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { isEmailAddress, withEmphasis } from './emphasis'
import { CONTACT } from '../lib/contact'
import { contactEmail } from '../lib/placeholder'

/**
 * The renderer behind every written page, checked against real rendered markup
 * rather than against the shape of the array it returns.
 *
 * The point of interest is the address. It is written as a bold run by
 * `contactEmail`, and until this file existed it rendered as bold text, which on
 * a phone is a string to be selected and retyped.
 */

const html = (text: string) => renderToStaticMarkup(<p>{withEmphasis(text, 't')}</p>)

describe('bold runs', () => {
  it('renders **this** as strong and leaves the rest alone', () => {
    const out = html('Rates start at **$400** per issue.')
    expect(out).toContain('<strong')
    expect(out).toContain('$400')
    expect(out).toContain('per issue.')
  })

  it('keeps plain text plain', () => {
    expect(html('Nothing emphasised here.')).not.toContain('<strong')
  })
})

describe('an address in a bold run', () => {
  it('becomes a mailto link', () => {
    const out = html('Write to **contact@vardenia.com**.')
    expect(out).toContain('href="mailto:contact@vardenia.com"')
    expect(out).toContain('>contact@vardenia.com</a>')
  })

  /**
   * The line the site actually publishes, taken from the same function the
   * contact page and the privacy policy call. A test that hardcodes the address
   * would keep passing after somebody changed it in lib/contact.
   */
  it('links the address the site really publishes', () => {
    expect(CONTACT.email, 'no address is set, so this test proves nothing').toBeTruthy()
    expect(html(contactEmail())).toContain(`href="mailto:${CONTACT.email}"`)
  })

  /**
   * Anything looser would start linking inside sentences and inside the legal
   * text, where a stray link is a change to a document somebody has to sign off.
   */
  it('does not link a bold run that merely contains an address', () => {
    const out = html('**Write to contact@vardenia.com now**')
    expect(out).not.toContain('mailto')
    expect(out).toContain('<strong')
  })

  it('does not link an unemphasised address', () => {
    expect(html('Write to contact@vardenia.com.')).not.toContain('mailto')
  })
})

describe('isEmailAddress', () => {
  it('accepts an ordinary address', () => {
    for (const value of ['contact@vardenia.com', 'a.b+c@sub.example.co.uk']) {
      expect(isEmailAddress(value), value).toBe(true)
    }
  })

  it('rejects anything missing a part, or carrying a space', () => {
    for (const value of ['contact', 'contact@', '@vardenia.com', 'a@b', 'a b@c.com', 'a@b@c.com']) {
      expect(isEmailAddress(value), value).toBe(false)
    }
  })
})
