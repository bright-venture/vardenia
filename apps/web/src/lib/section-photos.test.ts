import { existsSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { SECTIONS } from '@vardenia/core'
import { getMessages } from '@vardenia/i18n/messages'
import { SECTION_PHOTOS } from './section-photos'

describe('section photographs', () => {
  it('has one for every section, and the file is there', () => {
    expect(Object.keys(SECTION_PHOTOS).sort()).toEqual(SECTIONS.map((s) => s.path).sort())
    for (const photo of Object.values(SECTION_PHOTOS)) {
      expect(existsSync(path.join(__dirname, '../../public', photo.src))).toBe(true)
      expect(photo.alt.length).toBeGreaterThan(20)
    }
  })

  it('has a description for every section in every language', () => {
    for (const locale of ['en', 'ar', 'fr', 'es', 'pt', 'ru', 'zh', 'hi', 'bn', 'ur'] as const) {
      const intro = (getMessages(locale) as { directory: { sectionIntro: Record<string, string> } })
        .directory.sectionIntro
      for (const section of SECTIONS) expect(intro[section.path]?.length).toBeGreaterThan(20)
    }
  })
})
