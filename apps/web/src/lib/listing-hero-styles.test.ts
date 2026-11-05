import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { parse } from 'postcss'
import { describe, expect, it } from 'vitest'

const css = parse(
  readFileSync(fileURLToPath(new URL('../app/redesign.css', import.meta.url)), 'utf8'),
)

/** A no-photo listing is a compact masthead, not an empty cinematic frame. */
describe('listing hero sizing', () => {
  it('reserves desktop and mobile minimum heights for actual photographs', () => {
    const minimums: string[] = []
    css.walkRules((rule) => {
      if (!rule.selector.startsWith('.vd-listing > header')) return
      rule.walkDecls('min-height', (declaration) => {
        expect(rule.selector).toBe(".vd-listing > header[data-has-photograph='true']")
        minimums.push(declaration.value)
      })
    })
    expect(minimums).toEqual(['65svh', '600px'])
  })

  it('marks the header using the resolved photograph, not any media record', () => {
    const page = readFileSync(
      fileURLToPath(
        new URL('../app/(frontend)/[locale]/directory/[slug]/page.tsx', import.meta.url),
      ),
      'utf8',
    )
    expect(page).toContain('data-has-photograph={Boolean(hero)}')
    expect(page).toContain('const hero = resolvePhotograph(')
  })
})
