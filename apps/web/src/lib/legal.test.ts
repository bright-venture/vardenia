import { describe, expect, it } from 'vitest'
import { PLACEHOLDER, pendingDecisions, privacyPolicy, termsOfService } from './legal'
import { groupLines } from '../components/LegalDocument'

/**
 * These are drafts, and the tests exist to keep them honest rather than to check
 * prose.
 *
 * Two things matter. Every claim in the privacy policy has to match what the
 * code actually does, because a policy describing a different system is worse
 * than none - it is a statement on record that is untrue. And an unsettled
 * clause has to stay visibly unsettled, because the failure mode for a draft is
 * that it quietly starts looking finished.
 */

const documents = [
  ['privacy policy', privacyPolicy()],
  ['terms', termsOfService()],
] as const

describe.each(documents)('%s', (_name, document) => {
  it('has a title, an introduction and sections', () => {
    expect(document.title.length).toBeGreaterThan(0)
    expect(document.intro.length).toBeGreaterThan(0)
    expect(document.sections.length).toBeGreaterThan(3)
  })

  it('gives every section a heading and something under it', () => {
    for (const section of document.sections) {
      expect(section.heading.trim().length).toBeGreaterThan(0)
      expect(section.body.length).toBeGreaterThan(0)
    }
  })

  it('names what is still open rather than leaving a blank', () => {
    for (const line of document.sections.flatMap((section) => section.body)) {
      // An empty bracket or a bare TODO is how an unfinished clause hides. A
      // gap that is going to be filled in later has to say what is missing.
      expect(line).not.toMatch(/\[\s*\]|\bTODO\b|\bXXX\b|lorem ipsum/i)
    }
  })

  /**
   * A placeholder may finish a sentence - "write to <a contact address>" is one
   * unsettled thought and belongs in one block. It may not *start* one, because
   * everything before the full stop is then settled text being dragged into a
   * block headed NOT SETTLED.
   *
   * That is worse than untidy. The whole point of marking these is that a reader
   * can tell what we have decided from what we have not, and the live page was
   * flagging "Vardenia is a printed magazine and an online directory of places
   * in Lebanon" - plainly true, and nobody's open question - as doubtful. It
   * also left a sentence starting in lower case, because the marker is stripped
   * out before the text is rendered.
   */
  it('never drags a settled sentence into an unsettled clause', () => {
    for (const line of document.sections.flatMap((section) => section.body)) {
      expect(line).not.toMatch(/\.\s+TO CONFIRM:/)
    }
  })
})

describe('what the policy claims about the code', () => {
  const lines = privacyPolicy()
    .sections.flatMap((section) => section.body)
    .join('\n')
    .toLowerCase()

  /**
   * lib/scan-guard hashes the address with the app secret and keeps it in
   * memory only. That is unusual enough to be worth saying, and it would be a
   * false claim the moment somebody starts storing it.
   */
  it('says IP addresses are not stored, which scan-guard makes true', () => {
    expect(lines).toContain('we do not store your ip address')
  })

  /** The only cookie is `payload-token`, and it is strictly necessary. */
  it('explains the single cookie and why there is no consent banner', () => {
    expect(lines).toContain('one cookie')
    expect(lines).toContain('no consent banner')
  })

  /**
   * The booking notes placeholder invites "a dietary need, an anniversary, a
   * wheelchair", which is health data under GDPR Article 9. A policy that did
   * not mention it would be describing a tamer product than the one shipped.
   */
  it('warns that the notes field can carry health information', () => {
    expect(lines).toContain('health information')
  })

  /** Owners see the guest's name and phone. They never see the email. */
  it('is accurate about what the business receives', () => {
    expect(lines).toContain('they do not see your email address')
  })

  /**
   * The policy used to say, flatly, "We do not use analytics or advertising
   * trackers, and there is no third-party script on the site collecting
   * anything about you."
   *
   * That was true when it was written and became false the moment an analytics
   * provider was configured - a privacy policy contradicted by the page it is
   * printed on. Nothing would have caught it: the variables live in Netlify, so
   * the claim and the thing it describes are not even in the same repository.
   *
   * Pinned as a claim rather than as wording. If analytics is ever removed
   * again, this test should be updated deliberately, not worked around.
   */
  it('does not deny using analytics, because the site now does', () => {
    expect(lines).not.toContain('we do not use analytics')
    expect(lines).not.toContain('no third-party script')
  })

  it('says what the analytics collects and names it as a supplier', () => {
    expect(lines).toContain('which pages were visited')
    expect(lines).toContain('sets no cookie')
    expect(lines).toContain('the service that counts page visits')
  })

  /**
   * Cookieless is the whole reason there is still no consent banner, so the two
   * claims have to stay consistent with each other. A provider that set a
   * cookie would make this section wrong without touching it.
   */
  it('still claims no analytics cookie, which is why the banner is absent', () => {
    expect(lines).toContain('no advertising or analytics cookie')
    expect(lines).toContain('no consent banner')
  })

  it('says where the analytics data is held', () => {
    expect(lines).toContain('european union')
  })
})

describe('pendingDecisions', () => {
  it('lists every unsettled point across both documents', () => {
    const pending = pendingDecisions()
    expect(pending.length).toBeGreaterThan(0)
    for (const item of pending) expect(item).toContain(PLACEHOLDER)
  })

  it('includes the ones that cannot be guessed', () => {
    const all = pendingDecisions().join(' ').toLowerCase()
    expect(all).toContain('registered legal entity')
    expect(all).toContain('retention')
    expect(all).toContain('governing law')
  })
})

/**
 * The grouping bug that silently ate a clause.
 *
 * The first renderer pulled list items out of the body and rendered them
 * separately, which dropped any list item that was also an unsettled clause.
 * Seven placeholders in the source, six on the page, and nothing in the markup
 * to suggest anything was missing.
 */
describe('groupLines', () => {
  it('keeps consecutive list items together', () => {
    const groups = groupLines(['intro', '- one', '- two', 'after'])
    expect(groups.map((g) => g.kind)).toEqual(['single', 'list', 'single'])
    expect(groups[1]?.lines).toEqual(['- one', '- two'])
  })

  it('never swallows an unsettled clause written as a list item', () => {
    const groups = groupLines(['- one', `- ${PLACEHOLDER} something`, '- two'])
    const flattened = groups.flatMap((g) => g.lines)
    expect(flattened).toHaveLength(3)
    expect(flattened.some((line) => line.includes(PLACEHOLDER))).toBe(true)
  })

  it('gives an unsettled clause its own group so it cannot be styled as body text', () => {
    const groups = groupLines([`- ${PLACEHOLDER} x`])
    expect(groups).toHaveLength(1)
    expect(groups[0]?.kind).toBe('single')
  })

  it('loses nothing, whatever the shape', () => {
    const body = ['a', '- b', `- ${PLACEHOLDER} c`, '- d', 'e', `${PLACEHOLDER} f`]
    expect(groupLines(body).flatMap((g) => g.lines)).toEqual(body)
  })
})
