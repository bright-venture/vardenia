import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { SECTIONS } from '@vardenia/core'
import { LOCALES } from '@vardenia/i18n'
import { sectionSeoCopy } from './section-seo'
import { sectionName, sectionSummary } from './labels'
import { buildMetadata, localizedPath } from './seo'

afterEach(() => vi.unstubAllEnvs())

describe('category search copy', () => {
  it.each(SECTIONS)('$path has distinct, country-specific English and Arabic copy', (section) => {
    const en = sectionSeoCopy(section, 'en')
    const ar = sectionSeoCopy(section, 'ar')
    expect(en.title).toContain('Lebanon')
    expect(en.description).toContain('Lebanon')
    expect(ar.title).toContain('لبنان')
    expect(ar.description).toContain('لبنان')
    for (const copy of [en, ar]) {
      expect(copy.title.length).toBeLessThanOrEqual(60)
      expect(copy.description.length).toBeLessThanOrEqual(160)
      expect(copy.title).not.toMatch(/Vardenia|فاردينيا/)
      expect(copy.description).not.toMatch(/best|cheapest|verified|guaranteed|الأفضل|الأرخص|مضمون/i)
    }
  })

  it('keeps each category title unique and describes only current services', () => {
    for (const locale of ['en', 'ar'] as const) {
      expect(new Set(SECTIONS.map((section) => sectionSeoCopy(section, locale).title)).size).toBe(
        SECTIONS.length,
      )
    }
    const weddings = SECTIONS.find((section) => section.category === 'weddings')!
    expect(sectionSeoCopy(weddings, 'en').title).toContain('Planners')
    expect(sectionSeoCopy(weddings, 'en').description).not.toContain('venues')
  })

  it('preserves all other language copy rather than substituting English', () => {
    for (const locale of LOCALES.filter((code) => code !== 'en' && code !== 'ar')) {
      for (const section of SECTIONS) {
        expect(sectionSeoCopy(section, locale)).toEqual({
          title: sectionName(section, locale),
          description: sectionSummary(section, locale),
        })
      }
    }
  })

  it('preserves canonicals and launch protection while giving social cards the category copy', () => {
    vi.stubEnv('NEXT_PUBLIC_ALLOW_INDEX', 'false')
    for (const locale of LOCALES) {
      for (const section of SECTIONS) {
        const copy = sectionSeoCopy(section, locale)
        const path = `/${section.path}`
        const metadata = buildMetadata({ seo: undefined, ...copy, path, locale })
        expect(metadata.alternates?.canonical).toBe(localizedPath(path, locale))
        expect(metadata.openGraph?.title).toBe(copy.title)
        expect(metadata.twitter?.description).toBe(copy.description)
        expect(metadata.robots).toEqual({ index: false, follow: false })
      }
    }
  })
})

describe('hub metadata wiring', () => {
  it.each(['[section]', 'directory', 'magazine', 'magazine/articles', 'magazine/issues'])(
    '%s uses page-specific social metadata',
    (route) => {
      const file = fileURLToPath(
        new URL(`../app/(frontend)/[locale]/${route}/page.tsx`, import.meta.url),
      )
      const source = readFileSync(file, 'utf8')
      const metadata = source.slice(
        source.indexOf('export async function generateMetadata'),
        source.indexOf('\n}', source.indexOf('export async function generateMetadata')),
      )
      expect(metadata).toContain('buildMetadata(')
      expect(metadata).toContain('locale:')
      expect(metadata).toContain('path:')
    },
  )
})
