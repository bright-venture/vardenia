import { existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
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
