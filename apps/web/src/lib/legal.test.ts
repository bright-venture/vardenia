import { describe, expect, it } from 'vitest'
import { LOCALES, type Locale } from '@vardenia/i18n'
import {
  COMMERCIAL_REGISTRATION_NUMBER,
  PLACEHOLDER,
  legalEdition,
  pendingDecisions,
  privacyPolicy,
  termsOfService,
  type LegalDocument,
} from './legal'
import { CONTACT } from './contact'
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

  /**
   * Signing in sets `payload-token` and the `vd_session` hint (lib/session-hint),
   * both strictly necessary. Nothing else is set; the locale cookie is off.
   */
  it('explains the two sign-in cookies and why there is no consent banner', () => {
    expect(lines).toContain('two small cookies')
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

  /**
   * Law 81/2018, Article 91 allows health data only with explicit agreement,
   * and Article 88 asks the form to say why, whether it is optional, and who
   * receives it. BookingForm asks for the tick; this pins the policy to it.
   */
  it('says the notes need an explicit tick, are optional, and who gets them', () => {
    expect(lines).toContain('article 91')
    expect(lines).toContain('tick a box to agree')
    expect(lines).toContain('it is optional')
    expect(lines).toContain('the place you are booking with, and the vardenia team')
  })

  it('says each receipt counts once, which saveReceipt enforces', () => {
    expect(lines).toContain('receipt number')
    expect(lines).toContain('cannot be sent twice')
  })

  it('states a period for each kind of data', () => {
    for (const kept of [
      '12 months after the visit',
      'error records**: 90 days',
      'until you close it',
    ])
      expect(lines).toContain(kept)
  })

  it('does not name the suppliers, as the owner decided', () => {
    const terms = termsOfService()
      .sections.flatMap((section) => section.body)
      .join('\n')
      .toLowerCase()
    for (const name of ['cloudflare', 'supabase', 'netlify', 'resend', 'umami', 'anthropic']) {
      expect(lines).not.toContain(name)
      expect(terms).not.toContain(name)
    }
  })

  /**
   * The network provider's page-speed beacon is on for visitors outside the
   * EU (kept by the owner on 6 November 2026), so the policy has to say so,
   * and say it sets no cookie, which is why there is still no banner.
   */
  it('says the network also measures page speed, outside the EU, without a cookie', () => {
    expect(lines).toContain('how fast pages load')
    expect(lines).toContain('for visitors outside the european union')
    expect(lines).toContain('measures how fast it loads')
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

  /**
   * The visit counter runs on Umami's general cloud, which may store data in
   * the US, so the policy must not promise the figures stay in the EU, and
   * must list that service among those that may process data outside it.
   */
  it('does not promise the page-visit figures stay in the EU', () => {
    expect(lines).not.toContain('page-visit figures are held in the european union')
    expect(lines).toContain('the service that counts page visits may process data outside it')
    expect(lines).toContain('hosted in the european union, in frankfurt')
  })
})

describe('pendingDecisions', () => {
  it('lists every unsettled point across both documents', () => {
    for (const item of pendingDecisions()) expect(item).toContain(PLACEHOLDER)
  })

  /** The last open point, settled 9 November 2026: nothing is left open. */
  it('has nothing left open', () => {
    expect(pendingDecisions()).toEqual([])
  })

  it('states how data leaving the EU is covered, and who can open the weekly copy', () => {
    const text = privacyPolicy()
      .sections.flatMap((section) => section.body)
      .join(' ')
    expect(text).toContain('EU-US Data Privacy Framework')
    expect(text).toContain('standard contractual clauses')
    expect(text).toContain('only Vardenia holds the key that opens it')
  })

  /** Given by the owner on 9 November 2026. */
  it('states the commercial registration number on both documents', () => {
    for (const doc of [privacyPolicy(), termsOfService()]) {
      const text = doc.sections.flatMap((section) => section.body).join(' ')
      expect(text).toContain("Vardenia's commercial registration number is 1036217.")
    }
    expect(pendingDecisions().join(' ').toLowerCase()).not.toContain('registration number')
  })

  /**
   * Bills are kept ten years, the period Lebanese law sets for accounting
   * records (settled 9 November 2026), and a bill names no guest, so that
   * length keeps nothing personal past a booking's 12 months.
   */
  it('keeps bills ten years, without guest names', () => {
    const lines = privacyPolicy()
      .sections.flatMap((section) => section.body)
      .join(' ')
      .toLowerCase()
    expect(lines).toContain('monthly bills to businesses**: ten years')
    expect(lines).toContain("never by a guest's name")
    expect(pendingDecisions().join(' ').toLowerCase()).not.toContain('accounting law')
  })

  /** Answered by the owner on 6 November 2026; none of these may come back as open. */
  it('no longer lists what has been settled', () => {
    const all = pendingDecisions().join(' ').toLowerCase()
    for (const settled of [
      'no-show',
      'consent tick',
      'governing law',
      'limitation of liability',
      'naming those suppliers',
      'where the business terms live',
      'accounting law',
    ])
      expect(all).not.toContain(settled)
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

/**
 * Both documents in the nine other languages (9 November 2026).
 *
 * The English is the original and governs, so the failure worth catching is a
 * translation that has drifted from it: a line added or removed in English
 * alone, a list item that became a paragraph, an unsettled clause that is
 * flagged in one language and silently settled in another, or the address,
 * number or email missing where the English has them. Compared shape by shape,
 * since nobody here can check the prose of nine languages in a test.
 */
describe('translated legal documents', () => {
  const TRANSLATED = LOCALES.filter((locale): locale is Exclude<Locale, 'en'> => locale !== 'en')
  const kinds: [string, (locale?: Locale) => LegalDocument][] = [
    ['privacy policy', privacyPolicy],
    ['terms', termsOfService],
  ]
  const text = (doc: LegalDocument) =>
    [doc.title, doc.intro, ...doc.sections.flatMap((s) => [s.heading, ...s.body])].join(' | ')
  const count = (haystack: string, needle: string) => haystack.split(needle).length - 1

  for (const [name, build] of kinds) {
    const english = build('en')

    it.each(TRANSLATED)(`has the ${name} in %s, line for line with the English`, (locale) => {
      const translated = build(locale)
      expect(translated.title).not.toBe(english.title)
      expect(translated.sections).toHaveLength(english.sections.length)

      english.sections.forEach((section, i) => {
        const other = translated.sections[i]!
        expect(other.body, `section ${i} (${section.heading})`).toHaveLength(section.body.length)
        section.body.forEach((line, j) => {
          const theirs = other.body[j]!
          const where = `section ${i} line ${j}`
          expect(theirs.startsWith('- '), `${where}: list item`).toBe(line.startsWith('- '))
          expect(theirs.includes(PLACEHOLDER), `${where}: unsettled`).toBe(
            line.includes(PLACEHOLDER),
          )
          expect(count(theirs, '**'), `${where}: emphasis`).toBe(count(line, '**'))
        })
      })
    })

    it.each(TRANSLATED)(`names the same contact details in the %s ${name}`, (locale) => {
      const translated = text(build(locale))
      const original = text(english)
      for (const detail of [
        CONTACT.email!,
        CONTACT.postalAddress!,
        COMMERCIAL_REGISTRATION_NUMBER,
      ]) {
        expect(count(translated, detail), detail).toBe(count(original, detail))
      }
    })
  }

  it.each(TRANSLATED)('says in %s that the English governs, and links to it', (locale) => {
    const edition = legalEdition(locale)
    expect(edition.translationNote).toBeTruthy()
    expect(edition.readInEnglish).toBeTruthy()
    expect(edition.lastUpdated).not.toBe('Last updated')
  })

  it('needs no such note on the English original', () => {
    expect(legalEdition('en').translationNote).toBeNull()
    expect(privacyPolicy()).toEqual(privacyPolicy('en'))
  })
})
