import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { SECTIONS } from '@vardenia/core'
import {
  HIDEABLE_LABELS,
  HIDEABLE_PAGES,
  HIDEABLE_PATH,
  SECTION_PAGES,
  cleanHiddenPages,
  isHrefHidden,
  withoutHidden,
} from './hideable-pages'

describe('hideable pages', () => {
  it('lists the six sections exactly as the site has them', () => {
    expect([...SECTION_PAGES].sort()).toEqual(SECTIONS.map((s) => s.path).sort())
  })

  it('gives every page a path and an admin label', () => {
    for (const page of HIDEABLE_PAGES) {
      expect(HIDEABLE_PATH[page]).toMatch(/^\//)
      expect(HIDEABLE_LABELS[page]).toBeTruthy()
    }
  })

  it('keeps only real pages from what was stored', () => {
    expect(cleanHiddenPages(['stay', 'directory', 'refunds', 'magazine-issues', 3])).toEqual([
      'stay',
      'directory',
      'magazine-issues',
    ])
  })

  it('hides the directory index but never a listing', () => {
    expect(isHrefHidden('/directory', ['directory'])).toBe(true)
    expect(isHrefHidden('/directory?where=matn', ['directory'])).toBe(true)
    expect(isHrefHidden('/ar/directory', ['directory'])).toBe(true)
    expect(isHrefHidden('/directory/yacht-beirut', ['directory'])).toBe(false)
  })

  it('hides each issue and article with their index', () => {
    expect(isHrefHidden('/magazine/issues/all-lebanon', ['magazine-issues'])).toBe(true)
    expect(isHrefHidden('/magazine/articles/forty-eight-hours', ['magazine-articles'])).toBe(true)
    expect(isHrefHidden('/magazine', ['magazine-issues'])).toBe(false)
    expect(isHrefHidden('/magazine/issues', ['magazine'])).toBe(false)
  })

  it('hides a section and only that section', () => {
    expect(isHrefHidden('/stay', ['stay'])).toBe(true)
    expect(isHrefHidden('/stay?page=2', ['stay'])).toBe(true)
    expect(isHrefHidden('/eat-and-drink', ['stay'])).toBe(false)
  })

  it('takes the partner sign-in link out of a list', () => {
    const links = [{ href: '/about' }, { href: '/partner' }, { href: '/advertise' }]
    expect(withoutHidden(links, ['partner-sign-in']).map((l) => l.href)).toEqual([
      '/about',
      '/advertise',
    ])
  })

  it('has every value in the database enum, through the migrations', () => {
    const dir = path.join(__dirname, '../migrations')
    const sql = [
      '20261109_072535_hidden_pages.ts',
      '20261111_120000_hidden_pages_more.ts',
      '20261111_160000_hidden_pages_sign_in.ts',
      '20261111_170000_hidden_pages_legal_links.ts',
    ]
      .map((f) => readFileSync(path.join(dir, f), 'utf8'))
      .join('\n')
    for (const page of HIDEABLE_PAGES) expect(sql).toContain(`'${page}'`)
  })
})
