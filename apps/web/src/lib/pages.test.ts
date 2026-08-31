import { existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { faqPage } from './pages'
import { SECTION_PATHS } from '@vardenia/core'
import { CONTENT_PAGES, CONTENT_PAGE_SLUGS, contentPage } from './pages'
import { PLACEHOLDER } from './legal'

const here = path.dirname(fileURLToPath(import.meta.url))
const LOCALE_DIR = path.resolve(here, '../app/(frontend)/[locale]')

/**
 * These pages are only useful if they are reachable, so most of what is checked
 * here is the routing rather than the prose: a page defined with no route folder
 * is a link in the footer that 404s, and a slug that collides with a directory
 * section is a page that silently never renders.
 */

describe('content pages', () => {
  it('has a route folder for every page', () => {
    for (const slug of CONTENT_PAGE_SLUGS) {
      const route = path.join(LOCALE_DIR, slug, 'page.tsx')
      expect(existsSync(route), `${slug} has no route at ${route}`).toBe(true)
    }
  })

  /**
   * Both live at the top level, and a section is a dynamic segment. A content
   * page named `stay` would be shadowed by the directory section or shadow it,
   * depending on which way Next resolved it - and either way one of them would
   * quietly stop working.
   */
  it('never takes a path a directory section already uses', () => {
    for (const slug of CONTENT_PAGE_SLUGS) {
      expect(SECTION_PATHS).not.toContain(slug)
    }
  })

  it('builds every page it lists', () => {
    for (const slug of CONTENT_PAGE_SLUGS) {
      const page = contentPage(slug)
      expect(page, slug).not.toBeNull()
      expect(page?.title.trim().length).toBeGreaterThan(0)
      expect(page?.intro.trim().length).toBeGreaterThan(0)
      expect(page?.sections.length).toBeGreaterThan(0)
    }
  })

  it('returns null for a slug that is not a page', () => {
    expect(contentPage('nonsense')).toBeNull()
    expect(contentPage('')).toBeNull()
  })

  it('gives every section a heading and something under it', () => {
    for (const slug of CONTENT_PAGE_SLUGS) {
      for (const section of contentPage(slug)?.sections ?? []) {
        expect(section.heading.trim().length, slug).toBeGreaterThan(0)
        expect(section.body.length, `${slug} / ${section.heading}`).toBeGreaterThan(0)
      }
    }
  })

  /**
   * The same rule the legal documents follow. A placeholder that starts a new
   * sentence drags the settled half of the line into a block headed NOT SETTLED,
   * which on a sales page means flagging a promise we have actually made as
   * something nobody has decided.
   */
  it('never drags a settled sentence into an unsettled clause', () => {
    for (const slug of CONTENT_PAGE_SLUGS) {
      for (const section of contentPage(slug)?.sections ?? []) {
        for (const line of section.body) {
          expect(line, `${slug} / ${section.heading}`).not.toMatch(/\.\s+TO CONFIRM:/)
        }
      }
    }
  })

  it('leaves no unfinished gap unmarked', () => {
    for (const slug of CONTENT_PAGE_SLUGS) {
      for (const section of contentPage(slug)?.sections ?? []) {
        for (const line of section.body) {
          expect(line, slug).not.toMatch(/\[\s*\]|\bTODO\b|\bXXX\b|lorem ipsum/i)
        }
      }
    }
  })

  /**
   * A price or a deadline is not mine to invent, and a plausible wrong number on
   * a page a business is reading is a commitment somebody has to honour. Both
   * pages that quote terms must say plainly that they are not settled.
   */
  it('marks the commercial terms as unsettled rather than inventing them', () => {
    for (const slug of ['partner-with-us', 'advertise'] as const) {
      const text = JSON.stringify(contentPage(slug))
      expect(text, slug).toContain(PLACEHOLDER)
    }
  })

  it('uses url-safe slugs', () => {
    for (const slug of CONTENT_PAGE_SLUGS) {
      expect(slug).toMatch(/^[a-z][a-z-]*[a-z]$/)
    }
  })

  it('lists exactly the pages it defines', () => {
    expect(CONTENT_PAGE_SLUGS.sort()).toEqual(Object.keys(CONTENT_PAGES).sort())
  })
})

/**
 * The FAQ has to describe what the site actually does.
 *
 * It said a booking could be made "with a name, an email address and a phone
 * number" and needed no account, which stopped being true when booking moved
 * behind sign-in. Nobody noticed, because prose has no compiler: the code was
 * honest - BookingForm says "Booking requires an account" in a comment - and
 * only the page a reader sees was wrong.
 *
 * These pin the two claims that would embarrass us, not the wording around
 * them. Rewrite the copy freely; just do not promise the opposite of the code.
 */
describe('the FAQ against what booking really requires', () => {
  const text = () =>
    faqPage()
      .sections.flatMap((section) => [section.heading, ...section.body])
      .join(' ')
      .toLowerCase()

  it('does not tell readers they can book without an account', () => {
    expect(text()).not.toMatch(/no\.\s*a booking can be made/)
    expect(text()).not.toMatch(/booking[^.]*requires? no account/)
  })

  it('says an account is needed and that the address has to be confirmed', () => {
    const all = text()

    expect(all).toContain('do i need an account to book?')
    // /booking/request answers 401 without a session and 403 without a verified
    // address. A reader who is told about the first and not the second gets
    // stuck at a step nothing warned them about.
    expect(all).toMatch(/confirm/)
  })

  /**
   * The same failure as the booking answer, found the same way.
   *
   * The FAQ once promised "every page has an Arabic version" while this file
   * had no locale parameter at all, so the promise rendered in English on
   * /ar/faq and refuted itself to precisely the reader who would check.
   *
   * These pages are translated now, so the claim is narrower rather than gone:
   * the legal documents are still English, and so are listing descriptions.
   * Pinned as claims, not as wording.
   */
  it('does not promise more than is translated', () => {
    expect(text()).not.toMatch(/every page has an arabic version/)
  })

  it('still admits the legal documents are English', () => {
    expect(text()).toMatch(/legal documents are in english/)
  })
})

/**
 * Arabic, pinned in the repository rather than only in a one-off check.
 *
 * The failure worth catching is not a crash. It is a page that quietly returns
 * English for an Arabic reader - which renders perfectly, and is invisible to
 * everyone who does not read Arabic.
 */
describe('the standing pages in Arabic', () => {
  const ARABIC = /[؀-ۿ]/

  it.each(CONTENT_PAGE_SLUGS)('%s is written in Arabic', (slug) => {
    const page = contentPage(slug, 'ar')
    expect(page).not.toBeNull()
    expect(page!.title, 'title').toMatch(ARABIC)
    expect(page!.intro, 'intro').toMatch(ARABIC)
    for (const section of page!.sections) {
      expect(section.heading, section.heading).toMatch(ARABIC)
    }
  })

  it.each(CONTENT_PAGE_SLUGS)('%s says something different from the English page', (slug) => {
    expect(contentPage(slug, 'ar')!.title).not.toBe(contentPage(slug, 'en')!.title)
  })

  /**
   * A translation that drops or invents a paragraph is how the two languages
   * start promising different things, which on pages that quote prices and
   * describe what a listing includes is a commercial problem rather than a
   * cosmetic one.
   */
  it.each(CONTENT_PAGE_SLUGS)('%s keeps the same shape in both languages', (slug) => {
    const ar = contentPage(slug, 'ar')!
    const en = contentPage(slug, 'en')!
    expect(ar.sections).toHaveLength(en.sections.length)
    ar.sections.forEach((section, i) => {
      expect(section.body.length, `section ${i}`).toBe(en.sections[i]!.body.length)
    })
  })

  it('defaults to English when no locale is passed', () => {
    for (const slug of CONTENT_PAGE_SLUGS) {
      expect(contentPage(slug)).toEqual(contentPage(slug, 'en'))
    }
  })

  /**
   * The marker stays English on purpose: lib/legal counts unresolved clauses by
   * matching it, and two spellings is how that count silently starts missing
   * half of them.
   */
  it('leaves the TO CONFIRM marker untranslated', () => {
    const unsettled = contentPage('advertise', 'ar')!
      .sections.flatMap((s) => s.body)
      .filter((line) => line.includes(PLACEHOLDER))

    expect(unsettled.length).toBeGreaterThan(0)
  })
})
