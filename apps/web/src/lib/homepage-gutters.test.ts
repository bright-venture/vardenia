import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { parse } from 'postcss'
import { describe, expect, it } from 'vitest'

const css = parse(
  readFileSync(fileURLToPath(new URL('../app/home-finish.css', import.meta.url)), 'utf8'),
)

/** Both full-width atlas siblings align with the existing responsive site gutter. */
describe('homepage edition and featured-place gutters', () => {
  it.each(['.vd-edition-regions', '.vd-featured-destinations-title'])(
    '%s uses the shared gutter on both logical sides, including RTL',
    (selector) => {
      const inlinePadding: string[] = []
      css.walkRules((rule) => {
        if (!rule.selectors.includes(selector)) return
        rule.walkDecls((decl) => {
          if (decl.prop === 'padding-inline') inlinePadding.push(decl.value)
          // Physical or shorthand overrides could erase the RTL/mobile inset.
          expect(['padding-left', 'padding-right', 'padding']).not.toContain(decl.prop)
        })
      })
      expect(inlinePadding).toEqual(['var(--vd-gutter)'])
    },
  )
})
