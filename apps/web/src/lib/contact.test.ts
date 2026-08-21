import { describe, expect, it } from 'vitest'
import { CONTACT } from './contact'
import { PLACEHOLDER, contactEmail, contactPhone, contactPostal } from './placeholder'
import { privacyPolicy, termsOfService } from './legal'
import { CONTENT_PAGE_SLUGS, contentPage } from './pages'

/**
 * There is no mailbox yet, so every page that has to name one says so instead.
 *
 * What is actually being protected here is the day that changes: setting
 * `CONTACT.email` has to fill the contact page, both pages that sell a listing,
 * and the privacy policy at once. Four places, two of them inside a legal
 * document nobody rereads, and the one that would be missed longest is the one a
 * data request is sent to.
 */

const restore = (fn: () => void) => {
  const before = { ...CONTACT }
  try {
    fn()
  } finally {
    Object.assign(CONTACT, before)
  }
}

describe('contact details', () => {
  it('has no mailbox yet, and says so rather than inventing one', () => {
    expect(CONTACT.email).toBeNull()
    expect(contactEmail()).toContain(PLACEHOLDER)
  })

  it('reads as an instruction once there is an address', () => {
    restore(() => {
      CONTACT.email = 'hello@vardenia.com'
      const line = contactEmail()

      expect(line).not.toContain(PLACEHOLDER)
      expect(line).toContain('hello@vardenia.com')
    })
  })

  it('omits the phone line entirely rather than marking one we never wanted', () => {
    expect(contactPhone()).toBeNull()
    restore(() => {
      CONTACT.phone = '+961 1 000000'
      expect(contactPhone()).toContain('+961 1 000000')
    })
  })

  it('marks the postal address, which the privacy policy also needs', () => {
    expect(contactPostal()).toContain(PLACEHOLDER)
  })

  /**
   * The mistake this guards against, made twice already.
   *
   * The marker is stripped before the line renders, so a placeholder in the
   * middle of a sentence leaves text that does not parse - and drags the settled
   * half of the sentence into a block headed NOT SETTLED. A contact line has to
   * be a whole sentence in both states.
   */
  it('is a whole line, never a fragment inside a sentence', () => {
    for (const line of [contactEmail(), contactPostal()]) {
      expect(line.startsWith(PLACEHOLDER)).toBe(true)
    }
  })
})

describe('every page that names a contact', () => {
  const allLines = () => [
    ...[...privacyPolicy().sections, ...termsOfService().sections].flatMap((s) => s.body),
    ...CONTENT_PAGE_SLUGS.flatMap((slug) =>
      (contentPage(slug)?.sections ?? []).flatMap((s) => s.body),
    ),
  ]

  it('never puts a placeholder mid-sentence', () => {
    for (const line of allLines()) {
      // Anything before the marker on the same line is settled text being
      // dragged into an unsettled block.
      const at = line.indexOf(PLACEHOLDER)
      if (at === -1) continue
      expect(line.slice(0, at).replace(/^- /, '').trim(), line).toBe('')
    }
  })

  it('fills in everywhere at once when the address is set', () => {
    const before = allLines().filter((line) => line.includes(PLACEHOLDER)).length

    restore(() => {
      CONTACT.email = 'hello@vardenia.com'
      const after = allLines().filter((line) => line.includes(PLACEHOLDER)).length

      // One address closes four gaps: contact, partner-with-us, advertise,
      // add-your-business, and both mentions in the privacy policy.
      expect(before - after).toBeGreaterThanOrEqual(4)
    })
  })
})
