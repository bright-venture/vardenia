import { describe, expect, it } from 'vitest'
import { CONTACT } from './contact'
import { PLACEHOLDER, contactEmail, contactPhone, contactPostal } from './placeholder'
import { privacyPolicy, termsOfService } from './legal'
import { CONTENT_PAGE_SLUGS, contentPage } from './pages'

/**
 * One address has to reach four places at once.
 *
 * `CONTACT.email` feeds the contact page, both pages that sell a listing, and
 * the privacy policy. Two of those are inside a legal document nobody rereads,
 * and the one that would stay wrong longest is the one a data request is sent
 * to, so the test that matters is the one counting how many gaps the address
 * closes rather than the one checking the constant.
 *
 * The postal address is still unset, which is what keeps the placeholder
 * machinery under test now that the mailbox exists.
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
  it('publishes the mailbox rather than a marked gap', () => {
    expect(CONTACT.email).toBe('contact@vardenia.com')
    expect(contactEmail()).not.toContain(PLACEHOLDER)
    expect(contactEmail()).toContain('contact@vardenia.com')
  })

  /**
   * The gap has to come back if the address is ever removed, because the
   * alternative is a page that names nobody and does not admit it.
   */
  it('goes back to a marked gap if the address is taken away', () => {
    restore(() => {
      CONTACT.email = null
      expect(contactEmail()).toContain(PLACEHOLDER)
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
    restore(() => {
      CONTACT.email = null
      CONTACT.postalAddress = null

      for (const line of [contactEmail(), contactPostal()]) {
        expect(line.startsWith(PLACEHOLDER), line).toBe(true)
      }
    })
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

  /**
   * Measured by taking the address away rather than by adding it, now that it is
   * set. Same property either way: one field is load-bearing in several
   * documents, and a page that stopped reading it would go unnoticed because it
   * would simply carry on rendering a sentence.
   */
  it('fills in everywhere at once, and empties everywhere at once', () => {
    const marked = () => allLines().filter((line) => line.includes(PLACEHOLDER)).length
    const withAddress = marked()

    restore(() => {
      CONTACT.email = null

      // Six, counted rather than assumed: contact, partner-with-us, advertise,
      // add-your-business, and the privacy policy, which names it twice. The
      // note this replaces said four while listing six.
      expect(marked() - withAddress).toBeGreaterThanOrEqual(6)
    })
  })
})
